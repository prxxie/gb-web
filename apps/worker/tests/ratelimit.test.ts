/**
 * Rate limiting — `US-OPS-001`, `docs/02-reference/api/accounts.md` ("`429 rate-limited` (30/min per IP)"),
 * and `apps/worker/src/lib/ratelimit.ts` (the rules the Worker applies).
 *
 * The limiter is an in-isolate abuse brake, so the cases stay at the boundary: the request that crosses it,
 * the neighbour who must not be punished for it, the window that reopens, and the answer the client is told
 * to wait for.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleFetch } from "../src/index";
import { resetLimits } from "../src/lib/ratelimit";
import { mintSession } from "../src/lib/session";
import { captureLog, fakeRooms, TEST_SECRET, testEnv, type TestEnv } from "./support/fake-worker";

const IP = "203.0.113.7";

beforeEach(() => {
  resetLimits();
});

afterEach(() => {
  vi.useRealTimers();
});

function createRoom(harness: TestEnv, authorization: string, ip = IP): Promise<Response> {
  return handleFetch(
    new Request("https://api.test/api/v1/rooms", {
      method: "POST",
      headers: { authorization, "content-type": "application/json", "cf-connecting-ip": ip },
      body: JSON.stringify({ maxPlayers: 4 }),
    }),
    harness.env,
  );
}

function createSession(harness: TestEnv, ip = IP): Promise<Response> {
  return handleFetch(
    new Request("https://api.test/api/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": ip },
      body: JSON.stringify({ kind: "guest" }),
    }),
    harness.env,
  );
}

async function signedIn(): Promise<{ harness: TestEnv; authorization: string }> {
  const harness = testEnv({ rooms: fakeRooms() });
  harness.db.seedPlayer({ accountId: "acc_1", displayName: "Bao Tran" });
  const session = await mintSession({ kind: "account", guestId: null, accountId: "acc_1" }, TEST_SECRET);
  return { harness, authorization: `Bearer ${session.token}` };
}

describe("room creation — 10 per minute per IP", () => {
  it("answers the eleventh call with 429 rate-limited", async () => {
    const { harness, authorization } = await signedIn();

    const statuses: number[] = [];
    for (let index = 0; index < 11; index += 1) statuses.push((await createRoom(harness, authorization)).status);

    expect(statuses.slice(0, 10).every((status) => status === 201)).toBe(true);
    const limited = await createRoom(harness, authorization);
    expect(statuses[10]).toBe(429);
    expect(limited.status).toBe(429);
    const problem = (await limited.json()) as Record<string, unknown>;
    expect(String(problem["type"])).toMatch(/\/problems\/rate-limited$/);
    expect(problem["status"]).toBe(429);
  });

  it("leaves another IP alone", async () => {
    const { harness, authorization } = await signedIn();

    for (let index = 0; index < 10; index += 1) await createRoom(harness, authorization);

    expect((await createRoom(harness, authorization)).status).toBe(429);
    expect((await createRoom(harness, authorization, "198.51.100.4")).status).toBe(201);
  });

  it("reopens the window after a minute", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-05T10:00:00Z"));
    const { harness, authorization } = await signedIn();

    for (let index = 0; index < 10; index += 1) await createRoom(harness, authorization);
    expect((await createRoom(harness, authorization)).status).toBe(429);

    vi.setSystemTime(new Date("2026-11-05T10:01:01Z"));

    expect((await createRoom(harness, authorization)).status).toBe(201);
  });
});

describe("sessions — 30 per minute per IP", () => {
  it("answers the thirty-first call with 429 rate-limited", async () => {
    const harness = testEnv();

    const statuses: number[] = [];
    for (let index = 0; index < 31; index += 1) statuses.push((await createSession(harness)).status);

    expect(statuses.slice(0, 30).every((status) => status === 201)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});

describe("US-OPS-001 AC3 : the client is told how long to wait", () => {
  it("sends Retry-After on the 429", async () => {
    const { harness, authorization } = await signedIn();
    for (let index = 0; index < 10; index += 1) await createRoom(harness, authorization);

    const limited = await createRoom(harness, authorization);

    expect(limited.status).toBe(429);
    const header = limited.headers.get("retry-after");
    expect(header).not.toBeNull();
    expect(Number(header)).toBeGreaterThan(0);
    expect(Number(header)).toBeLessThanOrEqual(60);
  });

  it("puts retryAfterSeconds in the problem body", async () => {
    const { harness, authorization } = await signedIn();
    for (let index = 0; index < 10; index += 1) await createRoom(harness, authorization);

    const problem = (await (await createRoom(harness, authorization)).json()) as Record<string, unknown>;

    expect(problem["retryAfterSeconds"]).toBeGreaterThan(0);
  });

  it("names the limit in the log line", async () => {
    const { harness, authorization } = await signedIn();
    const sink = captureLog();
    for (let index = 0; index < 11; index += 1) await createRoom(harness, authorization);

    const line = sink.lines.map((raw) => JSON.parse(raw) as Record<string, unknown>).find((entry) => entry["status"] === 429);

    expect(line).toBeDefined();
    expect(line?.["code"]).toBe("rate-limited");
    expect(line?.["limit"]).toBe("ip_rooms");
  });
});
