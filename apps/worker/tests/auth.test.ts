/**
 * Authentication — bearer parsing, Clerk JWKS verification, and the shape of a 401.
 *
 * Sources: `apps/worker/src/routes/accounts.ts`, `apps/worker/src/lib/session.ts`,
 * `apps/worker/src/lib/jwt.ts`; contract in `docs/02-reference/api/README.md` (RFC 9457 errors, every
 * `/me` and `/matches` call needs a verified identity) and `docs/02-reference/api/accounts.md`.
 *
 * The theme of every case: identity is proved server-side. A header the client can type must never be
 * enough on its own.
 */
import { SignJWT, generateKeyPair } from "jose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handleFetch } from "../src/index";
import { bearerOf, mintSession } from "../src/lib/session";
import { fakeClerk, type FakeClerk } from "./support/clerk";
import { TEST_ISSUER, TEST_SECRET, jsonRequest, testEnv } from "./support/fake-worker";

const SESSIONS = "https://api.test/api/v1/sessions";

let clerk: FakeClerk;

beforeEach(async () => {
  clerk = await fakeClerk();
});

afterEach(() => {
  clerk.restore();
});

const me = (header: Record<string, string>) =>
  handleFetch(new Request("https://api.test/api/v1/me", { headers: header }), testEnv().env);

describe("bearer parsing", () => {
  it("accepts `Bearer <token>` in any case and trims it", () => {
    const request = (authorization: string) => new Request("https://api.test/", { headers: { authorization } });

    expect(bearerOf(request("Bearer abc.def"))).toBe("abc.def");
    expect(bearerOf(request("bearer abc.def"))).toBe("abc.def");
    expect(bearerOf(request("BEARER   abc.def  "))).toBe("abc.def");
  });

  it("falls back to the `x-session-token` header", () => {
    const request = new Request("https://api.test/", { headers: { "x-session-token": " abc.def " } });

    expect(bearerOf(request)).toBe("abc.def");
  });

  it("returns null when neither header is a bearer credential", () => {
    expect(bearerOf(new Request("https://api.test/"))).toBeNull();
    expect(bearerOf(new Request("https://api.test/", { headers: { authorization: "Basic dXNlcjpwdw==" } }))).toBeNull();
  });

  it("does not treat a lowercase-only prefix as the whole scheme", () => {
    const request = new Request("https://api.test/", { headers: { authorization: "bearerz abc" } });

    expect(bearerOf(request)).toBeNull();
  });
});

describe("401 shapes", () => {
  it("answers a missing credential with an RFC 9457 problem body", async () => {
    const response = await me({});

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    const problem = (await response.json()) as Record<string, unknown>;
    expect(String(problem["type"])).toMatch(/\/problems\/unauthenticated$/);
    expect(problem["status"]).toBe(401);
    expect(typeof problem["title"]).toBe("string");
    expect(typeof problem["request_id"]).toBe("string");
    expect(response.headers.get("x-request-id")).toBe(problem["request_id"]);
  });

  it("does not leak internals in the problem body", async () => {
    const response = await me({ authorization: "Bearer not-a-token" });

    const text = await response.text();
    expect(response.status).toBe(401);
    expect(text).not.toMatch(/SELECT|INSERT|D1_ERROR|at .*\.ts:/);
    expect(text).not.toMatch(/stack/i);
  });

  it("rejects a malformed token, a tampered payload and a foreign signature alike", async () => {
    const genuine = await mintSession({ kind: "account", guestId: null, accountId: "acc_1" }, TEST_SECRET);
    const [payload = "", signature = ""] = genuine.token.split(".");
    const tampered = `${Buffer.from(JSON.stringify({ sub: { kind: "account", accountId: "acc_other" } })).toString("base64url")}.${signature}`;
    const foreign = await mintSession({ kind: "account", guestId: null, accountId: "acc_1" }, "not-the-secret");

    for (const token of ["nonsense", tampered, foreign.token, `${payload}.${signature}x`]) {
      const response = await me({ authorization: `Bearer ${token}` });
      expect(response.status, `token ${token.slice(0, 12)} should be refused`).toBe(401);
      expect(((await response.json()) as Record<string, unknown>)["type"]).toContain("unauthenticated");
    }
  });
});

describe("Clerk JWT verification", () => {
  it("verifies against the issuer's JWKS and caches the key set", async () => {
    const { env } = testEnv();
    const header = { authorization: `Bearer ${await clerk.sign("user_1")}` };

    const first = await handleFetch(jsonRequest(SESSIONS, { kind: "account" }, header), env);
    const second = await handleFetch(jsonRequest(SESSIONS, { kind: "account" }, header), env);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(clerk.calls).toEqual([`${TEST_ISSUER}/.well-known/jwks.json`]);
  });

  it("rejects a JWT signed by a key that is not in the JWKS", async () => {
    const { privateKey } = await generateKeyPair("RS256");
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(TEST_ISSUER)
      .setSubject("user_1")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    const response = await handleFetch(jsonRequest(SESSIONS, { kind: "account" }, { authorization: `Bearer ${forged}` }), testEnv().env);

    expect(response.status).toBe(401);
    expect(((await response.json()) as Record<string, unknown>)["type"]).toContain("unauthenticated");
  });

  it("rejects a JWT from another issuer", async () => {
    const other = await fakeClerk({ issuer: "https://evil.test" });
    try {
      const token = await other.sign("user_1");

      const response = await handleFetch(
        jsonRequest(SESSIONS, { kind: "account" }, { authorization: `Bearer ${token}` }),
        testEnv().env,
      );

      expect(response.status).toBe(401);
    } finally {
      other.restore();
    }
  });

  it("rejects an expired JWT", async () => {
    const expired = await fakeClerk({ expiresIn: "-10m" });
    try {
      const token = await expired.sign("user_1");

      const response = await handleFetch(
        jsonRequest(SESSIONS, { kind: "account" }, { authorization: `Bearer ${token}` }),
        testEnv().env,
      );

      expect(response.status).toBe(401);
    } finally {
      expired.restore();
    }
  });

  it("answers 503 with a retry hint when the JWKS endpoint is unavailable and nothing is cached", async () => {
    const broken = await fakeClerk({ brokenJwks: true });
    try {
      const token = await broken.sign("user_1");

      const response = await handleFetch(
        jsonRequest(SESSIONS, { kind: "account" }, { authorization: `Bearer ${token}` }),
        testEnv().env,
      );

      // The token may well be valid; we simply could not check it, and that is retryable (`AC4`).
      expect(response.status).toBe(503);
      const problem = (await response.json()) as Record<string, unknown>;
      expect(String(problem["type"])).toMatch(/\/problems\/unavailable$/);
      expect(problem["retryAfterSeconds"]).toBeGreaterThan(0);
    } finally {
      broken.restore();
    }
  });

  it("refuses a token Clerk minted for another application", async () => {
    const clerk = await fakeClerk();
    try {
      const token = await clerk.sign("user_1", undefined, { azp: "https://evil.example" });

      const response = await handleFetch(
        jsonRequest(SESSIONS, { kind: "account" }, { authorization: `Bearer ${token}` }),
        testEnv().env,
      );

      expect(response.status).toBe(401);
      const problem = (await response.json()) as Record<string, unknown>;
      expect(problem["type"]).toMatch(/unauthenticated/);
    } finally {
      clerk.restore();
    }
  });

  it("takes identity from the verified token, never from the request body", async () => {
    const { env, db } = testEnv();
    db.seedPlayer({ accountId: "acc_victim", clerkUserId: "user_victim", displayName: "Victim Player" });

    const response = await handleFetch(
      jsonRequest(
        SESSIONS,
        { kind: "account", accountId: "acc_victim", subject: { kind: "account", accountId: "acc_victim" } },
        { authorization: `Bearer ${await clerk.sign("user_attacker")}` },
      ),
      env,
    );

    expect(response.status).toBe(201);
    const subject = ((await response.json()) as { subject: Record<string, unknown> }).subject;
    expect(subject["accountId"]).not.toBe("acc_victim");
    expect(db.profile.get("acc_victim")?.["display_name"]).toBe("Victim Player");
  });
});
