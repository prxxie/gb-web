/**
 * `POST /sessions` and the account row it owns — docs/02-reference/api/accounts.md,
 * docs/01-overview/roles-and-permissions.md.
 *
 * The doc makes three promises a regression must not break: a guest leaves no server-side record, a
 * registered caller's first call creates `account` + `profile` in one transaction, and a deleted
 * account cannot mint a new session. Each case below fails if one of those slips.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handleFetch } from "../src/index";
import { verifySession } from "../src/lib/session";
import { fakeClerk, type FakeClerk } from "./support/clerk";
import { TEST_SECRET, jsonRequest, testEnv, type TestEnv } from "./support/fake-worker";

const SESSIONS = "https://api.test/api/v1/sessions";

let clerk: FakeClerk;
let harness: TestEnv;

beforeEach(async () => {
  clerk = await fakeClerk();
  harness = testEnv();
});

afterEach(() => {
  clerk.restore();
});

const createSession = (body: unknown, headers: Record<string, string> = {}): Promise<Response> =>
  handleFetch(jsonRequest(SESSIONS, body, headers), harness.env);

const insertsInto = (table: string): string[] =>
  harness.db.statements.filter((statement) => statement.startsWith(`INSERT INTO ${table} `));

describe("POST /sessions — guest mode", () => {
  it("mints a guest session bound to a fresh guestId", async () => {
    const response = await createSession({ kind: "guest" });

    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    const subject = body["subject"] as Record<string, unknown>;
    expect(subject["kind"]).toBe("guest");
    expect(typeof subject["guestId"]).toBe("string");
    expect((subject["guestId"] as string).length).toBeGreaterThan(8);
    expect(body["expiresAt"]).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const token = await verifySession(String(body["sessionToken"]), TEST_SECRET);
    expect(token.sub).toMatchObject({ kind: "guest", guestId: subject["guestId"], accountId: null });
  });

  it("gives a guest no server-side record at all", async () => {
    const response = await createSession({ kind: "guest", displayName: "Bao" });

    expect(response.status).toBe(201);
    expect(harness.db.statements).toEqual([]);
    expect(harness.db.batches).toBe(0);
  });

  it("defaults the display name to `Guest <first 4 of guestId>`", async () => {
    const body = (await (await createSession({ kind: "guest" })).json()) as Record<string, unknown>;
    const subject = body["subject"] as Record<string, unknown>;

    expect(subject["displayName"]).toBe(`Guest ${String(subject["guestId"]).slice(0, 4)}`);
  });

  it("is the default mode when `kind` is omitted", async () => {
    const body = (await (await createSession({})).json()) as Record<string, unknown>;

    expect((body["subject"] as Record<string, unknown>)["kind"]).toBe("guest");
  });

  it("issues a different guestId per call", async () => {
    const first = (await (await createSession({ kind: "guest" })).json()) as Record<string, unknown>;
    const second = (await (await createSession({ kind: "guest" })).json()) as Record<string, unknown>;

    expect((first["subject"] as Record<string, unknown>)["guestId"]).not.toBe(
      (second["subject"] as Record<string, unknown>)["guestId"],
    );
  });

  it("rejects an unknown `kind` with 422 validation naming the field", async () => {
    const response = await createSession({ kind: "admin" });

    expect(response.status).toBe(422);
    const problem = (await response.json()) as { errors?: { field: string }[] };
    expect(problem.errors?.map((error) => error.field)).toContain("kind");
  });
});

describe("POST /sessions — account mode", () => {
  it("creates the account and its profile in one transaction on the first call", async () => {
    const token = await clerk.sign("user_1", "an@example.com");

    const response = await createSession({ kind: "account", displayName: "An" }, { authorization: `Bearer ${token}` });

    expect(response.status).toBe(201);
    expect(insertsInto("account")).toHaveLength(1);
    expect(insertsInto("profile")).toHaveLength(1);
    expect(harness.db.batches).toBe(1);
    expect(harness.db.account.size).toBe(1);
    expect([...harness.db.profile.values()][0]).toMatchObject({ rating: 1200, rated_matches: 0 });
  });

  it("returns the account subject shape without the guest fields", async () => {
    const token = await clerk.sign("user_1");

    const body = (await (await createSession({ kind: "account" }, { authorization: `Bearer ${token}` })).json()) as Record<
      string,
      unknown
    >;
    const subject = body["subject"] as Record<string, unknown>;

    expect(subject["kind"]).toBe("account");
    expect(typeof subject["accountId"]).toBe("string");
    expect(subject["avatarId"]).toBe("avatar-01");
    expect(subject["rating"]).toBe(1200);
    expect(subject["ratedMatches"]).toBe(0);
    expect(subject).not.toHaveProperty("guestId");
  });

  it("reuses the account on the next sign-in and only touches last_seen_at", async () => {
    const token = await clerk.sign("user_1");
    const first = (await (await createSession({ kind: "account" }, { authorization: `Bearer ${token}` })).json()) as Record<
      string,
      unknown
    >;
    const before = harness.db.statements.length;

    const second = (await (await createSession({ kind: "account" }, { authorization: `Bearer ${token}` })).json()) as Record<
      string,
      unknown
    >;

    expect((second["subject"] as Record<string, unknown>)["accountId"]).toBe(
      (first["subject"] as Record<string, unknown>)["accountId"],
    );
    expect(insertsInto("account")).toHaveLength(1);
    const later = harness.db.statements.slice(before);
    expect(later.some((statement) => statement.startsWith("UPDATE account SET last_seen_at"))).toBe(true);
  });

  it("accepts the Clerk token in the body instead of the header", async () => {
    const token = await clerk.sign("user_2");

    const response = await createSession({ kind: "account", clerkToken: token });

    expect(response.status).toBe(201);
  });

  it("refuses to sign in without a Clerk token", async () => {
    const response = await createSession({ kind: "account" });

    expect(response.status).toBe(401);
    const problem = (await response.json()) as Record<string, unknown>;
    expect(String(problem["type"])).toContain("unauthenticated");
    expect(typeof problem["request_id"]).toBe("string");
  });

  it("refuses a new session for an account scheduled for deletion", async () => {
    const token = await clerk.sign("user_deleted", "gone@example.com");
    harness.db.seedPlayer({ accountId: "acc_deleted", clerkUserId: "user_deleted", status: "deleted" });

    const response = await createSession({ kind: "account" }, { authorization: `Bearer ${token}` });

    expect(response.status).toBe(403);
    expect(String(((await response.json()) as Record<string, unknown>)["type"])).toContain("forbidden");
  });
});

describe("POST /sessions — the session token it mints", () => {
  it("carries the documented 60-minute expiry", async () => {
    const body = (await (await createSession({ kind: "guest" })).json()) as Record<string, unknown>;

    const expiresAt = Date.parse(String(body["expiresAt"]));
    const remaining = expiresAt - Date.now();
    expect(remaining).toBeGreaterThan(59 * 60 * 1000);
    expect(remaining).toBeLessThanOrEqual(60 * 60 * 1000);

    const token = await verifySession(String(body["sessionToken"]), TEST_SECRET);
    expect(new Date(token.exp).toISOString()).toBe(new Date(String(body["expiresAt"])).toISOString());
  });

  it("is signed with the configured secret and rejects any other", async () => {
    const body = (await (await createSession({ kind: "guest" })).json()) as Record<string, unknown>;

    await expect(verifySession(String(body["sessionToken"]), "another-secret")).rejects.toThrow(/verify/i);
  });
});
