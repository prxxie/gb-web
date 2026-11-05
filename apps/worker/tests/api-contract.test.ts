/**
 * The API contract — `docs/02-reference/api/README.md`.
 *
 * Everything the client hard-codes is asserted here: the endpoint index resolves, each route answers the
 * documented status, success bodies are `application/json; charset=utf-8` and carry `request_id`, a
 * cursor that cannot be read is a `400`, and a retried `POST /matches` replays instead of duplicating.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { RULESET_VERSION } from "@gbw/core";

import { handleFetch } from "../src/index";
import { mintSession } from "../src/lib/session";
import { resetLimits } from "../src/lib/ratelimit";
import { fakeRooms, TEST_SECRET, testEnv, type TestEnv } from "./support/fake-worker";

/** The endpoint index, verbatim from `docs/02-reference/api/README.md`. */
const INDEX: readonly (readonly [string, string])[] = [
  ["POST", "/sessions"],
  ["GET", "/turn-credentials"],
  ["POST", "/rooms"],
  ["GET", "/rooms/ABC234"],
  ["POST", "/rooms/ABC234/join"],
  ["GET", "/rooms/ABC234/ws"],
  ["GET", "/me"],
  ["PATCH", "/me"],
  ["DELETE", "/me"],
  ["GET", "/me/matches"],
  ["POST", "/matches"],
  ["GET", "/leaderboard"],
  ["GET", "/health"],
];

async function signedIn(): Promise<{ harness: TestEnv; authorization: string }> {
  const harness = testEnv({ rooms: fakeRooms() });
  harness.db.seedPlayer({ accountId: "acc_1", clerkUserId: "user_1", displayName: "Bao Tran" });
  harness.db.seedPlayer({ accountId: "acc_2", displayName: "Linh Pham" });
  const session = await mintSession({ kind: "account", guestId: null, accountId: "acc_1" }, TEST_SECRET);
  return { harness, authorization: `Bearer ${session.token}` };
}

const call = (harness: TestEnv, method: string, path: string, authorization?: string, body?: unknown): Promise<Response> =>
  handleFetch(
    new Request(`https://api.test/api/v1${path}`, {
      method,
      headers: {
        ...(authorization ? { authorization } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    harness.env,
  );

beforeEach(() => {
  resetLimits();
});

describe("endpoint index", () => {
  it("routes every documented endpoint", async () => {
    const { harness, authorization } = await signedIn();

    for (const [method, path] of INDEX) {
      const response = await call(harness, method, path, authorization, method === "PATCH" ? {} : undefined);
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const unrouted = response.status === 400 && String(body["detail"] ?? "").includes("Unknown route");
      expect(unrouted, `${method} ${path} is documented but not routed`).toBe(false);
    }
  });

  it("answers the documented status for each route", async () => {
    const { harness, authorization } = await signedIn();
    harness.db.matchPlayer.push({ match_id: "m1", account_id: "acc_1", result: "win", damage_dealt: 120 });
    // A code that names no room is a 404 on `/join`, so the join case needs a seated room.
    harness.rooms.seat("ABC234", "acc_1");

    const expected: [string, string, number, unknown?][] = [
      ["GET", "/health", 200],
      ["POST", "/sessions", 201, { kind: "guest" }],
      ["GET", "/turn-credentials", 200],
      ["POST", "/rooms", 201, { maxPlayers: 4 }],
      ["GET", "/rooms/ABC234", 200],
      ["POST", "/rooms/ABC234/join", 200, {}],
      ["GET", "/me", 200],
      ["PATCH", "/me", 200, { displayName: "Bao Nam" }],
      ["GET", "/me/matches", 200],
      ["GET", "/leaderboard", 200],
      ["DELETE", "/me", 204],
    ];

    for (const [method, path, status, body] of expected) {
      const response = await call(harness, method, path, authorization, body);
      expect(response.status, `${method} ${path}`).toBe(status);
    }
  });
});

describe("response envelope", () => {
  it("sends success bodies as application/json; charset=utf-8", async () => {
    const { harness } = await signedIn();

    const health = await call(harness, "GET", "/health");
    const leaderboard = await call(harness, "GET", "/leaderboard");

    expect(health.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(leaderboard.headers.get("content-type")).toBe("application/json; charset=utf-8");
  });

  it("puts request_id in every success body and header", async () => {
    const { harness, authorization } = await signedIn();

    const responses = [
      await call(harness, "GET", "/health"),
      await call(harness, "GET", "/leaderboard"),
      await call(harness, "GET", "/me", authorization),
    ];

    for (const response of responses) {
      const body = (await response.json()) as Record<string, unknown>;
      expect(typeof body["request_id"], `body of ${response.url}`).toBe("string");
      expect(response.headers.get("x-request-id")).toBe(body["request_id"]);
    }
  });
});

describe("errors", () => {
  it("returns every problem as an RFC 9457 body", async () => {
    const { harness, authorization } = await signedIn();
    const rooms = fakeRooms({
      stateResponse: () =>
        Response.json({ type: "room-closed", detail: "Room is closed" }, { status: 410 }),
    });
    const closing = testEnv({ rooms });

    const cases: [Response, number][] = [
      [await call(harness, "GET", "/nope"), 404],
      [await call(harness, "GET", "/me"), 401],
      [await call(harness, "GET", "/rooms/ABC23!"), 404],
      [await call(closing, "GET", "/rooms/ABC234"), 410],
    ];

    for (const [response, status] of cases) {
      expect(response.status).toBe(status);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      const problem = (await response.json()) as Record<string, unknown>;
      expect(problem["type"]).toMatch(/^https:\/\/[^/]+\/problems\/[a-z-]+$/);
      expect(typeof problem["title"]).toBe("string");
      expect(problem["status"]).toBe(status);
      expect(typeof problem["request_id"]).toBe("string");
      expect(typeof problem["instance"]).toBe("string");
      expect(response.headers.get("x-request-id")).toBe(problem["request_id"]);
    }
    expect(authorization).toBeTruthy();
  });

  it("answers 400 for a cursor it cannot read", async () => {
    const { harness } = await signedIn();

    const response = await call(harness, "GET", "/leaderboard?cursor=%%%");

    expect(response.status).toBe(400);
    const problem = (await response.json()) as Record<string, unknown>;
    expect(String(problem["type"])).toMatch(/\/problems\/bad-request$/);
  });
});

const MATCH = {
  matchId: "match_00000001",
  roomCode: "K7M2QX",
  rulesetVersion: RULESET_VERSION,
  startedAt: "2026-11-04T09:15:00Z",
  endedAt: "2026-11-04T09:21:12Z",
  winnerTeam: "A",
  players: [
    { slot: 0, team: "A", accountId: "acc_1", displayName: "Bao", damageDealt: 240, shotsFired: 9, hits: 6 },
    { slot: 1, team: "B", accountId: "acc_2", displayName: "Linh", damageDealt: 130, shotsFired: 8, hits: 3 },
  ],
};

const submit = (harness: TestEnv, authorization: string, body: unknown = MATCH): Promise<Response> =>
  handleFetch(
    new Request("https://api.test/api/v1/matches", {
      method: "POST",
      headers: { authorization, "content-type": "application/json", "idempotency-key": "match-submit-0001" },
      body: JSON.stringify(body),
    }),
    harness.env,
  );

describe("POST /matches contract", () => {
  it("answers 201 with matchId, ranked and ratings including delta", async () => {
    const { harness, authorization } = await signedIn();

    const response = await submit(harness, authorization);

    expect(response.status).toBe(201);
    const body = (await response.json()) as { ranked: boolean; ratings: Record<string, unknown>[] };
    expect(body.ranked).toBe(true);
    expect(body.ratings).toHaveLength(2);
    for (const rating of body.ratings) {
      expect(Object.keys(rating).sort()).toEqual(["accountId", "after", "before", "delta"]);
      expect(rating["delta"]).toBe(Number(rating["after"]) - Number(rating["before"]));
    }
  });

  it("refuses a submitter who did not play in the match", async () => {
    const { harness, authorization } = await signedIn();

    const response = await submit(harness, authorization, {
      ...MATCH,
      players: [MATCH.players[1], { ...MATCH.players[0], slot: 2, accountId: "acc_3", team: "A" }],
    });

    expect(response.status).toBe(403);
  });

  it("replays the stored 201 for a repeated Idempotency-Key", async () => {
    const { harness, authorization } = await signedIn();

    const first = await submit(harness, authorization);
    const second = await submit(harness, authorization);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(((await second.json()) as Record<string, unknown>)["matchId"]).toBe("match_00000001");
    expect(harness.db.matchRecord.size).toBe(1);
  });
});
