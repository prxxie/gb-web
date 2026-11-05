/**
 * `GET /me/matches` — a finished match appears in the caller's history (`matches.md`, `US-RANK-005`).
 *
 * History rows are produced by the real `POST /matches`, not by hand-inserted fixtures: a history that
 * cannot be read back after a legitimate submission is the bug this file is meant to catch.
 */
import { describe, expect, it } from "vitest";
import { createRig, seedProfile, type Rig } from "./support/fake-env";

const BASE = Date.parse("2026-11-05T10:00:00.000Z");

function submission(matchId: string, startOffsetMinutes: number, overrides: Record<string, unknown> = {}) {
  const startedAt = new Date(BASE + startOffsetMinutes * 60_000).toISOString();
  const endedAt = new Date(BASE + startOffsetMinutes * 60_000 + 600_000).toISOString();
  return {
    matchId,
    roomCode: "ABCD23",
    rulesetVersion: "2026-11-05",
    startedAt,
    endedAt,
    winnerTeam: "A",
    abandoned: false,
    players: [
      { slot: 0, team: "A", accountId: "acct-a1", damageDealt: 120, shotsFired: 10, hits: 6 },
      { slot: 1, team: "A", accountId: "acct-a2", damageDealt: 80, shotsFired: 9, hits: 4 },
      { slot: 2, team: "B", accountId: "acct-b1", damageDealt: 40, shotsFired: 8, hits: 3 },
      { slot: 3, team: "B", accountId: "acct-b2", damageDealt: 10, shotsFired: 6, hits: 1 },
    ],
    ...overrides,
  };
}

async function rigWithAccounts(): Promise<{ rig: Rig; tokenA1: string }> {
  const rig = createRig();
  for (const accountId of ["acct-a1", "acct-a2", "acct-b1", "acct-b2"]) {
    seedProfile(rig.db, { accountId, displayName: accountId.replace("acct-", "P") });
  }
  const tokenA1 = await rig.token({ kind: "account", accountId: "acct-a1", guestId: null });
  return { rig, tokenA1 };
}

describe("GET /me/matches", () => {
  it("TC-RANK-141: a match the caller played is in their history", async () => {
    // Arrange
    const { rig, tokenA1 } = await rigWithAccounts();
    await rig.request("POST", "/matches", { body: submission("match-0001", 0), token: tokenA1 });

    // Act
    const response = await rig.request("GET", "/me/matches", { token: tokenA1 });

    // Assert
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: Record<string, unknown>[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.["matchId"]).toBe("match-0001");
    rig.db.close();
  });

  it("TC-RANK-141: the caller's own result and damage are reported", async () => {
    // Arrange
    const { rig, tokenA1 } = await rigWithAccounts();
    await rig.request("POST", "/matches", { body: submission("match-0001", 0), token: tokenA1 });
    const tokenB1 = await rig.token({ kind: "account", accountId: "acct-b1", guestId: null });

    // Act
    const [winnerSide, loserSide] = await Promise.all([
      rig.request("GET", "/me/matches", { token: tokenA1 }),
      rig.request("GET", "/me/matches", { token: tokenB1 }),
    ]);

    // Assert
    const winnerItem = ((await winnerSide.json()) as { items: Record<string, unknown>[] }).items[0];
    const loserItem = ((await loserSide.json()) as { items: Record<string, unknown>[] }).items[0];
    expect(winnerItem?.["result"]).toBe("win");
    expect(loserItem?.["result"]).toBe("loss");
    expect(winnerItem?.["damageDealt"]).toBe(120);
    expect(loserItem?.["damageDealt"]).toBe(40);
    rig.db.close();
  });

  it("TC-RANK-141: another account's match is not in the caller's history", async () => {
    // Arrange — acct-a1 played, acct-b2 did not
    const { rig, tokenA1 } = await rigWithAccounts();
    seedProfile(rig.db, { accountId: "acct-outsider", displayName: "Outsider" });
    await rig.request("POST", "/matches", { body: submission("match-0001", 0), token: tokenA1 });
    const outsider = await rig.token({ kind: "account", accountId: "acct-outsider", guestId: null });

    // Act
    const response = await rig.request("GET", "/me/matches", { token: outsider });

    // Assert
    const body = (await response.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(0);
    rig.db.close();
  });

  it("TC-RANK-141: the item carries the fields matches.md documents", async () => {
    // Arrange
    const { rig, tokenA1 } = await rigWithAccounts();
    await rig.request("POST", "/matches", { body: submission("match-0001", 0), token: tokenA1 });

    // Act
    const response = await rig.request("GET", "/me/matches", { token: tokenA1 });

    // Assert — matches.md: playedAt, team, opponents[], damageDealt, shotsFired, hits, ratingDelta, rulesetVersion
    const item = ((await response.json()) as { items: Record<string, unknown>[] }).items[0] ?? {};
    expect(item).toMatchObject({
      playedAt: expect.any(String),
      team: "A",
      opponents: expect.any(Array),
      ratingDelta: 16,
      rulesetVersion: "2026-11-05",
    });
    rig.db.close();
  });

  it("TC-RANK-141: newest first, by ended_at then match_id", async () => {
    // Arrange — three matches on the same room code, oldest first
    const { rig, tokenA1 } = await rigWithAccounts();
    for (const [index, offset] of [0, 30, 60].entries()) {
      await rig.request("POST", "/matches", { body: submission(`match-000${index + 1}`, offset), token: tokenA1 });
    }

    // Act
    const response = await rig.request("GET", "/me/matches", { token: tokenA1 });

    // Assert
    const ids = ((await response.json()) as { items: { matchId: string }[] }).items.map((item) => item.matchId);
    expect(ids).toEqual(["match-0003", "match-0002", "match-0001"]);
    rig.db.close();
  });

  it("TC-RANK-141: a page ends on a cursor and the next page continues", async () => {
    // Arrange
    const { rig, tokenA1 } = await rigWithAccounts();
    for (const [index, offset] of [0, 30, 60].entries()) {
      await rig.request("POST", "/matches", { body: submission(`match-000${index + 1}`, offset), token: tokenA1 });
    }

    // Act
    const first = await rig.request("GET", "/me/matches?limit=2", { token: tokenA1 });
    const firstBody = (await first.json()) as { items: { matchId: string }[]; next_cursor?: string };
    const second = await rig.request("GET", `/me/matches?limit=2&cursor=${firstBody.next_cursor}`, { token: tokenA1 });

    // Assert
    expect(firstBody.items.map((item) => item.matchId)).toEqual(["match-0003", "match-0002"]);
    expect(firstBody.next_cursor).toBeTruthy();
    expect(((await second.json()) as { items: { matchId: string }[] }).items.map((item) => item.matchId)).toEqual([
      "match-0001",
    ]);
    rig.db.close();
  });

  it("TC-RANK-141: a guest cannot read a history", async () => {
    // Arrange
    const { rig } = await rigWithAccounts();
    const guest = await rig.token({ kind: "guest", accountId: null, guestId: "guest-1" });

    // Act
    const response = await rig.request("GET", "/me/matches", { token: guest });

    // Assert
    expect(response.status).toBe(401);
    rig.db.close();
  });
});
