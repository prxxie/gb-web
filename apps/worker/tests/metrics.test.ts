/**
 * Metrics the SLOs are computed from — `docs/08-ops/slo.md` (SLO-1, SLO-2, SLO-3) and `US-OPS-001`.
 *
 * Each SLO row names the exact query that decides it, so this file asserts the dimensions those queries
 * filter on: `status` for SLO-1, a `route` label that `route=~"/api/v1/.*"` can match for SLO-2, and a
 * `room_code` on the room-creation line that supplies SLO-3's denominator. Nothing here asserts a metric
 * backend, because the doc's source of truth is the Cloudflare dashboard.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { handleFetch } from "../src/index";
import { resetLimits } from "../src/lib/ratelimit";
import { mintSession } from "../src/lib/session";
import { captureLog, fakeRooms, TEST_SECRET, testEnv, type TestEnv } from "./support/fake-worker";

interface Line {
  readonly route?: string;
  readonly method?: string;
  readonly status?: number;
  readonly room_code?: string;
  readonly [key: string]: unknown;
}

let sink: ReturnType<typeof captureLog>;

beforeEach(() => {
  sink = captureLog();
  resetLimits();
});

const lines = (): Line[] => sink.lines.map((line) => JSON.parse(line) as Line);

async function signedIn(): Promise<{ harness: TestEnv; authorization: string }> {
  const harness = testEnv({ rooms: fakeRooms() });
  harness.db.seedPlayer({ accountId: "acc_1", displayName: "Bao Tran" });
  const session = await mintSession({ kind: "account", guestId: null, accountId: "acc_1" }, TEST_SECRET);
  return { harness, authorization: `Bearer ${session.token}` };
}

describe("SLO-1 : `workers_requests_total{status!~\"5..\"}` needs one line per answer", () => {
  it("emits a line for a 2xx, a 4xx and a 5xx so the ratio has a numerator and a denominator", async () => {
    const { harness, authorization } = await signedIn();

    await handleFetch(new Request("https://api.test/api/v1/health"), harness.env);
    await handleFetch(new Request("https://api.test/api/v1/me"), harness.env);
    harness.db.failWhen = () => true;
    await handleFetch(new Request("https://api.test/api/v1/me", { headers: { authorization } }), harness.env);

    const statuses = lines().map((line) => line.status);
    expect(statuses).toContain(200);
    expect(statuses).toContain(401);
    expect(statuses).toContain(500);
  });

  it("logs a 429 so it can be excluded from the ratio", async () => {
    const { harness } = await signedIn();
    const room = () =>
      handleFetch(
        new Request("https://api.test/api/v1/sessions", { method: "POST", headers: { "cf-connecting-ip": "203.0.113.9" } }),
        harness.env,
      );

    for (let index = 0; index < 31; index += 1) await room();

    const statuses = lines().map((line) => line.status);
    expect(statuses).toContain(429);
  });
});

describe("SLO-2 : the p95 query selects on `route=~\"/api/v1/.*\"`", () => {
  it("labels a route with the public path, not the bare segment", async () => {
    const { harness, authorization } = await signedIn();

    await handleFetch(
      new Request("https://api.test/api/v1/rooms", {
        method: "POST",
        headers: { authorization, "content-type": "application/json" },
        body: JSON.stringify({ maxPlayers: 4 }),
      }),
      harness.env,
    );

    const line = lines().find((entry) => entry.status === 201);
    expect(line).toBeDefined();
    expect(line?.route).toBe("POST /api/v1/rooms");
  });

  it("counts an upgraded socket once, at the upgrade", async () => {
    const { harness } = await signedIn();

    await handleFetch(new Request("https://api.test/api/v1/rooms/ABC234/ws"), harness.env);

    expect(sink.lines).toHaveLength(1);
  });
});

describe("SLO-3 : the denominator comes from the room-creation log", () => {
  it("puts the created room code on its line so created rooms can be counted and joined to match_record", async () => {
    const { harness, authorization } = await signedIn();

    const created = (await (
      await handleFetch(
        new Request("https://api.test/api/v1/rooms", {
          method: "POST",
          headers: { authorization, "content-type": "application/json" },
          body: JSON.stringify({ maxPlayers: 4 }),
        }),
        harness.env,
      )
    ).json()) as { roomCode: string };

    const line = lines().find((entry) => entry.status === 201);
    expect(line?.room_code).toBe(created.roomCode);
  });
});
