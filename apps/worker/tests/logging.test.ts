/**
 * Structured logging — TC-OPS-118, TC-OPS-173, `US-OPS-001` AC1/AC2/AC6 and
 * `docs/01-overview/architecture.md` ("one JSON line per request: request_id, route, status,
 * duration_ms — no tokens, no display names").
 *
 * The log is the only place an operator can answer "what happened to request X", so the cases below also
 * check the lines nobody thinks about: preflights, proxied 4xx and crashes.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { handleFetch } from "../src/index";
import { mintSession } from "../src/lib/session";
import { captureLog, fakeRooms, TEST_SECRET, testEnv, type FakeD1, type TestEnv } from "./support/fake-worker";

let sink: ReturnType<typeof captureLog>;

beforeEach(() => {
  sink = captureLog();
});

interface Line {
  readonly request_id: string;
  readonly route: string;
  readonly method: string;
  readonly status: number;
  readonly duration_ms: number;
  readonly level?: string;
  readonly code?: string;
  readonly room_code?: string;
  readonly player_id?: string;
  readonly [key: string]: unknown;
}

function lines(): Line[] {
  return sink.lines.map((line) => JSON.parse(line) as Line);
}

async function signedIn(): Promise<{ harness: TestEnv; authorization: string; token: string }> {
  const harness = testEnv();
  harness.db.seedPlayer({ accountId: "acc_1", displayName: "Bao Tran" });
  const session = await mintSession({ kind: "account", guestId: null, accountId: "acc_1" }, TEST_SECRET);
  return { harness, authorization: `Bearer ${session.token}`, token: session.token };
}

describe("TC-OPS-118 : one line per completed request", () => {
  it("writes a single JSON line with request_id, route, status and duration_ms", async () => {
    const harness = testEnv();

    const response = await handleFetch(new Request("https://api.test/api/v1/health"), harness.env);

    expect(sink.lines).toHaveLength(1);
    const [line] = lines();
    expect(line?.["request_id"]).toBe(response.headers.get("x-request-id"));
    expect(typeof line?.["route"]).toBe("string");
    expect(typeof line?.["method"]).toBe("string");
    expect(line?.["status"]).toBe(200);
    expect(typeof line?.["duration_ms"]).toBe("number");
    for (const raw of sink.lines) expect(raw).not.toContain("\n");
  });

  it("logs a thrown problem response exactly once, with its status", async () => {
    const harness = testEnv();

    await handleFetch(new Request("https://api.test/api/v1/me"), harness.env);

    expect(sink.lines).toHaveLength(1);
    expect(lines()[0]?.status).toBe(401);
  });

  it("logs a proxied 4xx that never threw", async () => {
    const rooms = fakeRooms({
      wsResponse: () => Response.json({ type: "room-not-found" }, { status: 404 }),
    });
    const harness = testEnv({ rooms });

    const response = await handleFetch(new Request("https://api.test/api/v1/rooms/ABC234/ws"), harness.env);

    expect(response.status).toBe(404);
    expect(sink.lines, "a request that reached the DO still needs a line").toHaveLength(1);
  });

  it("logs a preflight", async () => {
    const harness = testEnv();

    await handleFetch(
      new Request("https://api.test/api/v1/rooms", {
        method: "OPTIONS",
        headers: { origin: "https://gbw.example", "access-control-request-method": "POST" },
      }),
      harness.env,
    );

    expect(sink.lines).toHaveLength(1);
  });
});

describe("US-OPS-001 AC1 : the line identifies the route the way the story asks", () => {
  it("writes `METHOD /api/v1/<route>` rather than a bare path", async () => {
    const harness = testEnv();

    await handleFetch(new Request("https://api.test/api/v1/health"), harness.env);

    expect(lines()[0]?.route).toBe("GET /api/v1/health");
  });

  it("carries cf_ray for a request that came through the edge", async () => {
    const harness = testEnv();

    await handleFetch(new Request("https://api.test/api/v1/health", { headers: { "cf-ray": "8a1b2c3d4e5f-HAN" } }), harness.env);

    expect(lines()[0]?.["cf_ray"]).toBe("8a1b2c3d4e5f-HAN");
  });

  it("names the room when the request touched one", async () => {
    const harness = testEnv({ rooms: fakeRooms() });

    await handleFetch(new Request("https://api.test/api/v1/rooms/ABC234"), harness.env);

    expect(lines()[0]?.["room_code"]).toBe("ABC234");
  });
});

describe("TC-OPS-173 : a log line never contains a secret or an identity", () => {
  it("omits the session token, the display name and the e-mail", async () => {
    const { harness, authorization, token } = await signedIn();

    await handleFetch(new Request("https://api.test/api/v1/me", { headers: { authorization } }), harness.env);
    await handleFetch(
      new Request("https://api.test/api/v1/me", {
        method: "PATCH",
        headers: { authorization, "content-type": "application/json", cookie: "clerk_session=abc123" },
        body: JSON.stringify({ displayName: "Bao Tran" }),
      }),
      harness.env,
    );

    const raw = sink.lines.join("\n");
    expect(raw).not.toContain(token);
    expect(raw).not.toContain("Bao Tran");
    expect(raw).not.toContain("clerk_session");
    expect(raw).not.toContain("@");
  });

  it("omits the bearer token on a rejected request", async () => {
    const harness = testEnv();

    await handleFetch(new Request("https://api.test/api/v1/me", { headers: { authorization: "Bearer leaked-token-value" } }), harness.env);

    expect(sink.lines.join("\n")).not.toContain("leaked-token-value");
  });
});

describe("US-OPS-001 AC6 : a failure is logged as a failure", () => {
  it("levels an unhandled error as `error` and keeps the stack out of production lines", async () => {
    const harness = testEnv();
    const db = harness.db as FakeD1;
    db.failWhen = () => true;

    const response = await handleFetch(
      new Request("https://api.test/api/v1/me", {
        headers: { authorization: `Bearer ${(await mintSession({ kind: "account", guestId: null, accountId: "acc_1" }, TEST_SECRET)).token}` },
      }),
      harness.env,
    );

    expect(response.status).toBe(500);
    const [line] = lines();
    expect(line).toBeDefined();
    if (!line) return;
    expect(line.level).toBe("error");
    expect(line.status).toBe(500);
    expect(line).not.toHaveProperty("stack");
  });
});
