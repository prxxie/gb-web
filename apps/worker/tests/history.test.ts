/**
 * `GET /me/matches` — a finished match appears in the caller's history (`matches.md`, `US-RANK-005`).
 *
 * History rows are produced by the real `POST /matches`, not by hand-inserted fixtures: a history that
 * cannot be read back after a legitimate submission is the bug this file is meant to catch.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resetLimits } from "../src/lib/ratelimit";
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
  // Thirty submissions in one file would otherwise trip the 30/hour budget and turn a paging bug into a 429.
  beforeEach(() => resetLimits());

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

  it("TC-RANK-143: the caller's own result and damage are reported", async () => {
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

  it("TC-RANK-149: another account's match is not in the caller's history", async () => {
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

  it("TC-RANK-143: the item carries the fields matches.md documents", async () => {
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

  it("TC-RANK-142: a page ends on a cursor and the next page continues", async () => {
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

  it("TC-RANK-141: thirty matches answer twenty and promise more", async () => {
    // Arrange — AC1: the first page of a long history
    const { rig, tokenA1 } = await rigWithAccounts();
    for (let index = 0; index < 30; index += 1) {
      await rig.request("POST", "/matches", { body: submission(`match-${String(index).padStart(4, "0")}`, index * 30), token: tokenA1 });
    }

    // Act
    const response = await rig.request("GET", "/me/matches?limit=20", { token: tokenA1 });

    // Assert — twenty rows, newest first, and the page says there is another
    const body = (await response.json()) as { items: { matchId: string }[]; next_cursor: string | null; has_more: boolean };
    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(20);
    expect(body.items[0]?.matchId).toBe("match-0029");
    expect(body.items[19]?.matchId).toBe("match-0010");
    expect(body.next_cursor).toBeTruthy();
    expect(body.has_more).toBe(true);
    rig.db.close();
  });

  it("TC-RANK-142: the next page continues without a gap or a repeat", async () => {
    // Arrange — AC2: every match of the history is reached by following the cursor
    const { rig, tokenA1 } = await rigWithAccounts();
    for (let index = 0; index < 30; index += 1) {
      await rig.request("POST", "/matches", { body: submission(`match-${String(index).padStart(4, "0")}`, index * 30), token: tokenA1 });
    }

    // Act
    const first = (await (await rig.request("GET", "/me/matches?limit=20", { token: tokenA1 })).json()) as {
      items: { matchId: string }[];
      next_cursor: string | null;
      has_more: boolean;
    };
    const second = (await (
      await rig.request("GET", `/me/matches?limit=20&cursor=${String(first.next_cursor)}`, { token: tokenA1 })
    ).json()) as { items: { matchId: string }[]; next_cursor: string | null; has_more: boolean };

    // Assert — 20 + 10, no overlap, and the oldest row of the first page is not repeated
    expect(second.items).toHaveLength(10);
    expect(second.has_more).toBe(false);
    expect(second.next_cursor).toBeNull();
    const seen = [...first.items, ...second.items].map((item) => item.matchId);
    expect(new Set(seen).size).toBe(30);
    expect(seen).toEqual(Array.from({ length: 30 }, (_, index) => `match-${String(29 - index).padStart(4, "0")}`));
    rig.db.close();
  });

  it("TC-RANK-143: a row carries the team size, the result and the delta the screen prints", async () => {
    // Arrange — AC3: a lost match, rated
    const { rig, tokenA1 } = await rigWithAccounts();
    const tokenB1 = await rig.token({ kind: "account", accountId: "acct-b1", guestId: null });
    await rig.request("POST", "/matches", { body: submission("match-0001", 0), token: tokenA1 });

    // Act — the loser reads their own history
    const response = await rig.request("GET", "/me/matches", { token: tokenB1 });

    // Assert — AC3: win/loss, team size, damage and the (negative) delta
    const item = ((await response.json()) as { items: Record<string, unknown>[] }).items[0] ?? {};
    expect(item["result"]).toBe("loss");
    expect(item["playerCount"]).toBe(4);
    expect(item["damageDealt"]).toBe(40);
    expect(typeof item["ratingDelta"]).toBe("number");
    expect(item["ratingDelta"] as number).toBeLessThan(0);
    expect(item["ranked"]).toBe(true);
    expect(item["rankedReason"]).toBeNull();
    rig.db.close();
  });

  it("TC-RANK-148: an unranked row names its reason and carries no rating", async () => {
    // Arrange — AC4: a match recorded under a stale ruleset
    const { rig, tokenA1 } = await rigWithAccounts();
    await rig.request("POST", "/matches", { body: submission("match-0001", 0, { rulesetVersion: "2025-01-01" }), token: tokenA1 });

    // Act
    const response = await rig.request("GET", "/me/matches", { token: tokenA1 });

    // Assert — AC4: no rating numbers, only the reason
    const item = ((await response.json()) as { items: Record<string, unknown>[] }).items[0] ?? {};
    expect(item["ranked"]).toBe(false);
    expect(item["rankedReason"]).toBe("ruleset_mismatch");
    expect(item["ratingDelta"]).toBeNull();
    rig.db.close();
  });

  it("TC-RANK-149: no other player's account id or rating leaves the server", async () => {
    // Arrange — AC5: opponents are named, nobody else is identified or rated
    const { rig, tokenA1 } = await rigWithAccounts();
    await rig.request("POST", "/matches", { body: submission("match-0001", 0), token: tokenA1 });

    // Act
    const response = await rig.request("GET", "/me/matches", { token: tokenA1 });
    const text = await response.text();

    // Assert — the whole body, not just the item
    expect(text).not.toContain("acct-a2");
    expect(text).not.toContain("acct-b1");
    expect(text).not.toContain("acct-b2");
    expect(text).not.toContain("ratingBefore");
    const item = (JSON.parse(text) as { items: { opponents: Record<string, unknown>[] }[] }).items[0];
    for (const opponent of item?.opponents ?? []) {
      expect(Object.keys(opponent).sort()).toEqual(["displayName", "team"]);
    }
    rig.db.close();
  });

  it("TC-RANK-150: an accountId in the query is ignored, not obeyed", async () => {
    // Arrange — AC6: the caller asks for someone else's history
    const { rig, tokenA1 } = await rigWithAccounts();
    const tokenB1 = await rig.token({ kind: "account", accountId: "acct-b1", guestId: null });
    await rig.request("POST", "/matches", { body: submission("match-0001", 0), token: tokenA1 });

    // Act
    const response = await rig.request("GET", "/me/matches?accountId=acct-a1", { token: tokenB1 });

    // Assert — the row is b1's own (team B, 40 damage), never a1's
    const body = (await response.json()) as { items: { matchId: string; team: string; damageDealt: number }[] };
    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.team).toBe("B");
    expect(body.items[0]?.damageDealt).toBe(40);
    rig.db.close();
  });

  it("TC-RANK-151: a cursor the server did not mint is a 400, not a page", async () => {
    // Arrange — § 5: the cursor is opaque and signed
    const { rig, tokenA1 } = await rigWithAccounts();
    await rig.request("POST", "/matches", { body: submission("match-0001", 0), token: tokenA1 });
    const forged = Buffer.from(JSON.stringify({ v: 1, e: "2026-11-05T10:10:00.000Z", m: "match-0001" })).toString("base64url");

    // Act
    const response = await rig.request("GET", `/me/matches?cursor=${forged}`, { token: tokenA1 });

    // Assert
    expect(response.status).toBe(400);
    expect(((await response.json()) as { type: string }).type).toContain("bad-request");
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
