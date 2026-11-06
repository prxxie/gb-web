/**
 * The session token itself — docs/02-reference/api/accounts.md ("HMAC-signed JWT, 60 min, claims
 * `{ sub, kind, exp }`").
 *
 * `accounts.test.ts` covers how the token is minted (which identity, which rows). This file covers the
 * token as an object: its form, its claims, its lifetime, and the fact that `kind` is what decides
 * whether a request may touch account data.
 */
import { describe, expect, it } from "vitest";

import { handleFetch } from "../src/index";
import { SESSION_TTL_MS, mintSession, verifySession } from "../src/lib/session";
import { TEST_SECRET, jsonRequest, testEnv } from "./support/fake-worker";

const SESSIONS = "https://api.test/api/v1/sessions";

/**
 * The JSON claims of a token: a JWT keeps them in the second segment, the Worker's two-segment format in
 * the first. Both are tried so that a claim-level failure is never reported as a parse failure.
 */
function claimsOf(token: string): Record<string, unknown> {
  const segments = token.split(".");
  for (const payload of [segments[1], segments[0]]) {
    if (!payload) continue;
    try {
      return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    } catch {
      continue;
    }
  }
  throw new Error(`no JSON claims in ${token}`);
}

async function guestSession(): Promise<{ token: string; body: Record<string, unknown> }> {
  const { env } = testEnv();
  const response = await handleFetch(jsonRequest(SESSIONS, { kind: "guest" }), env);
  const body = (await response.json()) as Record<string, unknown>;
  return { token: String(body["sessionToken"]), body };
}

describe("session token — form", () => {
  it("is a JWT: three dot-separated segments, as the doc calls it", async () => {
    const { token } = await guestSession();

    expect(token.split("."), "the doc calls the session token an HMAC-signed JWT").toHaveLength(3);
  });

  it("carries the documented `sub`, `kind` and `exp` claims", async () => {
    const { token, body } = await guestSession();

    const claims = claimsOf(token);
    expect(claims).toHaveProperty("sub");
    expect(claims).toHaveProperty("exp");
    expect(claims["kind"], "`kind` is a top-level claim in accounts.md").toBeDefined();
    expect((body["subject"] as Record<string, unknown>)["kind"]).toBe("guest");
  });
});

describe("session token — lifetime", () => {
  it("is minted with a 60-minute lifetime", async () => {
    const { body } = await guestSession();

    expect(Date.parse(String(body["expiresAt"])) - Date.now()).toBeGreaterThan(SESSION_TTL_MS - 60_000);
  });

  it("states iat/exp in Unix seconds, as RFC 7519 requires", async () => {
    const { token } = await guestSession();

    const claims = claimsOf(token);
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(Math.abs(Number(claims["iat"]) - nowSeconds)).toBeLessThan(60);
    expect(Math.abs(Number(claims["exp"]) - nowSeconds - 3600)).toBeLessThan(60);
  });

  it("refuses a token whose exp has passed", async () => {
    const minted = await mintSession({ kind: "guest", guestId: "g1", accountId: null }, TEST_SECRET, Date.now() - 2 * 3_600_000);

    await expect(verifySession(minted.token, TEST_SECRET)).rejects.toThrow(/expired/i);
  });

  it("accepts a token one minute before expiry", async () => {
    const minted = await mintSession({ kind: "guest", guestId: "g1", accountId: null }, TEST_SECRET, Date.now() - 59 * 60 * 1000);

    await expect(verifySession(minted.token, TEST_SECRET)).resolves.toMatchObject({ sub: { kind: "guest", guestId: "g1" } });
  });

  it("answers 401 at the API boundary once the session has expired", async () => {
    const { env } = testEnv();
    const expired = await mintSession({ kind: "account", guestId: null, accountId: "acc_1" }, TEST_SECRET, Date.now() - 2 * 3_600_000);

    const response = await handleFetch(
      new Request("https://api.test/api/v1/me", { headers: { authorization: `Bearer ${expired.token}` } }),
      env,
    );

    expect(response.status).toBe(401);
  });
});

describe("session token — subject.kind decides what the token may do", () => {
  it("lets an account token read /me but not a guest token", async () => {
    const { env, db } = testEnv();
    db.seedPlayer({ accountId: "acc_1", displayName: "Bao Tran" });
    const accountToken = await mintSession({ kind: "account", guestId: null, accountId: "acc_1" }, TEST_SECRET);
    const guestToken = await mintSession({ kind: "guest", guestId: "g1", accountId: null }, TEST_SECRET);

    const asAccount = await handleFetch(
      new Request("https://api.test/api/v1/me", { headers: { authorization: `Bearer ${accountToken.token}` } }),
      env,
    );
    const asGuest = await handleFetch(
      new Request("https://api.test/api/v1/me", { headers: { authorization: `Bearer ${guestToken.token}` } }),
      env,
    );

    expect(asAccount.status).toBe(200);
    expect(asGuest.status).toBe(401);
    expect(((await asGuest.json()) as Record<string, unknown>)["detail"]).toMatch(/signed-in account/i);
  });
});

describe("TC-AUTH-163: a guest body carries no account identity (US-AUTH-001 AC5)", () => {
  it("has no email, accountId or Clerk identifier anywhere in the response", async () => {
    // Arrange
    const { env } = testEnv();

    // Act
    const response = await handleFetch(jsonRequest(SESSIONS, { kind: "guest" }), env);
    const body = (await response.json()) as Record<string, unknown>;
    const text = JSON.stringify(body);

    // Assert — the guest subject names a guest id and nothing else
    expect(response.status).toBe(201);
    const subject = body["subject"] as Record<string, unknown>;
    expect(subject["kind"]).toBe("guest");
    expect(Object.keys(subject)).not.toContain("accountId");
    expect(text).not.toMatch(/@/);
    expect(text).not.toMatch(/clerk/i);
    expect(text).not.toMatch(/user_[A-Za-z0-9]/);
  });
});
