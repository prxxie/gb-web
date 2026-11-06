import { describe, expect, it } from "vitest";
import { problemBody, ProblemError, problemResponse, type FieldError } from "../src/lib/problem";
import { decideCors, preflight } from "../src/lib/cors";
import { checkLimit, resetLimits, RULES } from "../src/lib/ratelimit";
import { mintSession, verifySession, guestIdFor } from "../src/lib/session";
import { Field, limitOf } from "../src/lib/validation";
import { createLogger } from "../src/lib/logging";
import { health } from "../src/routes/health";

const SECRET = "test-secret-value";
const ORIGINS = ["https://gbw.example"];

function env(): Record<string, string> {
  return { SESSION_TOKEN_SECRET: SECRET, ENVIRONMENT: "test", ALLOWED_ORIGINS: ORIGINS.join(",") };
}

describe("problem responses", () => {
  it("TC-FND-071: a problem body carries type, title, status, detail, instance and request id", () => {
    const body = problemBody(new ProblemError("room-not-found", "room ABCD23 is unknown"), "req-1");
    expect(body).toMatchObject({
      type: "https://gbw.example/problems/room-not-found",
      status: 404,
      detail: "room ABCD23 is unknown",
      request_id: "req-1",
    });
    expect(body.title.length).toBeGreaterThan(0);
  });

  it("TC-FND-071: a problem response is application/problem+json with x-request-id", async () => {
    const response = problemResponse(
      new ProblemError("validation", "bad body", [{ field: "maxPlayers", detail: "must be 2, 4, 6 or 8" }]),
      "req-2",
      "https://gbw.example",
    );
    expect(response.status).toBe(422);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(response.headers.get("x-request-id")).toBe("req-2");
    const body = (await response.json()) as { errors?: { field: string }[] };
    expect(body.errors?.[0]?.field).toBe("maxPlayers");
  });
});

describe("TC-OPS-118: structured logging", () => {
  it("writes one JSON line with the fixed field names", () => {
    const lines: string[] = [];
    const logger = createLogger("req-3", (line) => lines.push(line));
    logger.line({ route: "/api/v1/health", method: "GET", status: 200, duration_ms: 4 });
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
    expect(parsed).toMatchObject({ level: "info", request_id: "req-3", route: "/api/v1/health", status: 200 });
    expect(JSON.stringify(parsed)).not.toContain("displayName");
  });
});

describe("TC-ROOM-072: rate limiting", () => {
  it("allows the limit, then refuses inside the window, then refills after it", () => {
    resetLimits();
    const rule = RULES.roomsPerIp;
    const start = 1_000;
    for (let index = 0; index < rule.limit; index += 1) {
      expect(checkLimit("ip-1", rule, start + index).allowed).toBe(true);
    }
    expect(checkLimit("ip-1", rule, start + rule.limit + 1).allowed).toBe(false);
    expect(checkLimit("ip-1", rule, start + rule.windowMs + 1).allowed).toBe(true);
  });
});

describe("TC-AUTH-074: session tokens", () => {
  it("round-trips a guest session and refuses a forged signature", async () => {
    const { token } = await mintSession({ kind: "guest", guestId: "g-1", accountId: null }, SECRET, 1_000);
    const verified = await verifySession(token, SECRET, 1_500);
    expect(verified.sub.kind).toBe("guest");
    expect(guestIdFor(verified)).toBe("g-1");
    await expect(verifySession(`${token}x`, SECRET, 1_500)).rejects.toBeInstanceOf(ProblemError);
    await expect(verifySession(token, "other-secret", 1_500)).rejects.toBeInstanceOf(ProblemError);
  });

  it("TC-AUTH-057: an expired token is refused", async () => {
    const { token, expiresAt } = await mintSession({ kind: "guest", guestId: "g-2", accountId: null }, SECRET, 1_000);
    await expect(verifySession(token, SECRET, expiresAt + 1)).rejects.toBeInstanceOf(ProblemError);
  });
});

describe("TC-FND-071: request validation collects every invalid field", () => {
  it("collects every invalid field instead of stopping at the first", () => {
    const errors: FieldError[] = [];
    const field = new Field(errors);
    const body = { maxPlayers: 3, mode: "capture" };
    field.oneOf(body.maxPlayers, "maxPlayers", [2, 4, 6, 8]);
    field.oneOf(body.mode, "mode", ["solo", "score", "tag", "jewel"]);
    expect(errors).toHaveLength(2);
    expect(errors.map((error) => error.field)).toEqual(["maxPlayers", "mode"]);
    expect(() => field.done()).toThrowError(ProblemError);
  });

  it("caps a page size at one hundred", () => {
    expect(limitOf(new URL("https://x.test/leaderboard?limit=5000"), 20)).toBe(100);
    expect(limitOf(new URL("https://x.test/leaderboard"), 20)).toBe(20);
  });
});

describe("TC-FND-002: CORS", () => {
  it("allows the configured origin and refuses another one", () => {
    const allowed = decideCors(new Request("https://api.test/health", { headers: { origin: "https://gbw.example" } }), ORIGINS);
    expect(allowed.allowed).toBe(true);
    const refused = decideCors(new Request("https://api.test/health", { headers: { origin: "https://evil.test" } }), ORIGINS);
    expect(refused.allowed).toBe(false);
    expect(refused.origin).toBeNull();
  });

  it("TC-FND-002: a preflight answers 204 with no body", async () => {
    const response = preflight("https://gbw.example");
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });
});

describe("TC-FND-001: health", () => {
  it("reports status, version, environment and the ruleset version", async () => {
    const response = health(env() as never, "req-9", "abc123");
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ status: "ok", version: "abc123", environment: "test", ruleset: "2026-11-05" });
  });
});
