/**
 * Role rules — `docs/01-overview/roles-and-permissions.md`, TC-AUTH-065.
 *
 * The table in that doc is the authority: a guest may play, join, read the leaderboard and fetch TURN
 * credentials, but may not touch `/me`, submit a match or delete an account. Host-only powers
 * (`start_match`, `team_assign`) are enforced inside the `Room` Durable Object and are covered by
 * `room-*.test.ts`; what this file proves is that the Worker refuses a guest before the DO is reached.
 */
import { describe, expect, it } from "vitest";

import { handleFetch } from "../src/index";
import { mintSession } from "../src/lib/session";
import { TEST_SECRET, testEnv, type TestEnv } from "./support/fake-worker";

async function guest(): Promise<{ harness: TestEnv; authorization: string }> {
  const harness = testEnv();
  const session = await mintSession({ kind: "guest", guestId: "guest-1", accountId: null }, TEST_SECRET);
  return { harness, authorization: `Bearer ${session.token}` };
}

async function player(): Promise<{ harness: TestEnv; authorization: string }> {
  const harness = testEnv();
  harness.db.seedPlayer({ accountId: "acc_1", displayName: "Bao Tran" });
  const session = await mintSession({ kind: "account", guestId: null, accountId: "acc_1" }, TEST_SECRET);
  return { harness, authorization: `Bearer ${session.token}` };
}

const call = (harness: TestEnv, path: string, init: RequestInit = {}): Promise<Response> =>
  handleFetch(new Request(`https://api.test/api/v1${path}`, init), harness.env);

describe("TC-AUTH-065 : guest is refused the account surface", () => {
  it("GET /me is 401 for a guest session", async () => {
    const { harness, authorization } = await guest();

    const response = await call(harness, "/me", { headers: { authorization } });

    expect(response.status).toBe(401);
    expect(((await response.json()) as Record<string, unknown>)["type"]).toContain("unauthenticated");
  });

  it("PATCH /me is 401 for a guest session and writes nothing", async () => {
    const { harness, authorization } = await guest();

    const response = await call(harness, "/me", {
      method: "PATCH",
      headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Guest Name" }),
    });

    expect(response.status).toBe(401);
    expect(harness.db.statements).toEqual([]);
  });

  it("DELETE /me is 401 for a guest session", async () => {
    const { harness, authorization } = await guest();

    const response = await call(harness, "/me", { method: "DELETE", headers: { authorization } });

    expect(response.status).toBe(401);
    expect(harness.db.statements).toEqual([]);
  });

  it("GET /me/matches is 401 for a guest session", async () => {
    const { harness, authorization } = await guest();

    const response = await call(harness, "/me/matches", { headers: { authorization } });

    expect(response.status).toBe(401);
  });

  it("POST /matches is 401 for a guest session", async () => {
    const { harness, authorization } = await guest();

    const response = await call(harness, "/matches", {
      method: "POST",
      headers: { authorization, "content-type": "application/json", "idempotency-key": "guest-match-0001" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(401);
    expect(harness.db.statements).toEqual([]);
  });
});

describe("TC-AUTH-065 : the guest role can still play", () => {
  it("creates a room", async () => {
    const { harness, authorization } = await guest();

    const response = await call(harness, "/rooms", {
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify({ maxPlayers: 4 }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(typeof body["roomCode"]).toBe("string");
    expect(typeof body["playerId"]).toBe("string");
  });

  it("reads a room preview without a session", async () => {
    const { harness } = await guest();

    const response = await call(harness, "/rooms/ABC234");

    expect(response.status).toBe(200);
  });

  it("joins a room", async () => {
    const { harness, authorization } = await guest();
    // The stub must know a room at this code, or the join is a 404 before the session is even checked.
    harness.rooms.seat("ABC234", "acc_1");

    const response = await call(harness, "/rooms/ABC234/join", {
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(200);
  });

  it("fetches TURN credentials", async () => {
    const { harness, authorization } = await guest();

    const response = await call(harness, "/turn-credentials", { headers: { authorization } });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { iceServers?: unknown[]; ttlSeconds?: number };
    expect(Array.isArray(body.iceServers)).toBe(true);
    expect(body.ttlSeconds).toBe(3600);
  });

  it("reads the leaderboard", async () => {
    const { harness } = await guest();

    const response = await call(harness, "/leaderboard");

    expect(response.status).toBe(200);
  });
});

describe("role is proved by the session, never by a header", () => {
  it("ignores spoofed identity headers on a guest session", async () => {
    const { harness, authorization } = await guest();

    const response = await call(harness, "/me", {
      headers: {
        authorization,
        "x-account-id": "acc_1",
        "x-clerk-user-id": "user_1",
        "x-role": "account",
      },
    });

    expect(response.status).toBe(401);
  });

  it("ignores a spoofed role header on an account session", async () => {
    const { harness, authorization } = await player();

    const response = await call(harness, "/me", { headers: { authorization, "x-role": "admin", "x-host": "true" } });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["accountId"]).toBe("acc_1");
    expect(body).not.toHaveProperty("role");
  });

  it("gives the registered player the same play entitlements as a guest", async () => {
    const { harness, authorization } = await player();

    const create = await call(harness, "/rooms", {
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify({ maxPlayers: 4 }),
    });
    const turn = await call(harness, "/turn-credentials", { headers: { authorization } });

    expect(create.status).toBe(201);
    expect(turn.status).toBe(200);
  });
});
