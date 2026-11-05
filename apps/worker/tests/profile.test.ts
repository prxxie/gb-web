/**
 * Profile read and update — `docs/02-reference/api/accounts.md` (GET /me, PATCH /me).
 *
 * Two promises are load-bearing for the client: GET /me is the complete D1 export of the caller (the
 * profile screen renders every field), and PATCH /me returns exactly the GET /me representation so the
 * UI can replace its cache with the response.
 */
import { describe, expect, it } from "vitest";

import { handleFetch } from "../src/index";
import { mintSession } from "../src/lib/session";
import { TEST_SECRET, testEnv, type TestEnv } from "./support/fake-worker";

const DOCUMENTED_ME_FIELDS = ["accountId", "displayName", "avatarId", "rating", "ratedMatches", "createdAt", "deletionScheduledFor"];

async function signedIn(displayName = "Bao Tran"): Promise<{ harness: TestEnv; authorization: string }> {
  const harness = testEnv();
  harness.db.seedPlayer({ accountId: "acc_1", clerkUserId: "user_1", displayName, avatarId: "avatar-03", rating: 1234, ratedMatches: 7 });
  const session = await mintSession({ kind: "account", guestId: null, accountId: "acc_1" }, TEST_SECRET);
  return { harness, authorization: `Bearer ${session.token}` };
}

const getMe = (harness: TestEnv, authorization: string): Promise<Response> =>
  handleFetch(new Request("https://api.test/api/v1/me", { headers: { authorization } }), harness.env);

const patchMe = (harness: TestEnv, authorization: string, body: unknown): Promise<Response> =>
  handleFetch(
    new Request("https://api.test/api/v1/me", {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization },
      body: JSON.stringify(body),
    }),
    harness.env,
  );

describe("GET /me", () => {
  it("returns the caller's profile values", async () => {
    const { harness, authorization } = await signedIn();

    const response = await getMe(harness, authorization);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      accountId: "acc_1",
      displayName: "Bao Tran",
      avatarId: "avatar-03",
      rating: 1234,
      ratedMatches: 7,
    });
  });

  it("carries every field the doc lists, including createdAt and deletionScheduledFor", async () => {
    const { harness, authorization } = await signedIn();

    const body = (await (await getMe(harness, authorization)).json()) as Record<string, unknown>;

    for (const field of DOCUMENTED_ME_FIELDS) {
      expect(Object.keys(body), `GET /me must expose ${field}`).toContain(field);
    }
  });

  it("reports wins, losses and abandons in stats", async () => {
    const { harness, authorization } = await signedIn();
    harness.db.matchPlayer.push(
      { match_id: "m1", account_id: "acc_1", result: "win", damage_dealt: 120 },
      { match_id: "m2", account_id: "acc_1", result: "loss", damage_dealt: 40 },
      { match_id: "m3", account_id: "acc_1", result: "abandon", damage_dealt: 0 },
    );

    const body = (await (await getMe(harness, authorization)).json()) as { stats?: Record<string, unknown> };

    expect(body.stats).toMatchObject({ wins: 1, losses: 1, abandons: 1 });
  });

  it("sets deletionScheduledFor to null while no deletion is pending", async () => {
    const { harness, authorization } = await signedIn();

    const body = (await (await getMe(harness, authorization)).json()) as Record<string, unknown>;

    expect(body["deletionScheduledFor"]).toBeNull();
  });

  it("answers 401 when the account behind the session no longer exists", async () => {
    const { harness } = await signedIn();
    harness.db.profile.delete("acc_1");
    const session = await mintSession({ kind: "account", guestId: null, accountId: "acc_1" }, TEST_SECRET);

    const response = await getMe(harness, `Bearer ${session.token}`);

    expect(response.status).toBe(401);
  });
});

describe("PATCH /me", () => {
  it("updates the avatar and persists it", async () => {
    const { harness, authorization } = await signedIn();

    const response = await patchMe(harness, authorization, { avatarId: "avatar-12" });

    expect(response.status).toBe(200);
    expect(((await response.json()) as Record<string, unknown>)["avatarId"]).toBe("avatar-12");
    expect(harness.db.profile.get("acc_1")?.["avatar_id"]).toBe("avatar-12");
  });

  it("returns exactly the GET /me representation", async () => {
    const { harness, authorization } = await signedIn();

    const patched = (await (await patchMe(harness, authorization, { displayName: "Bao" })).json()) as Record<string, unknown>;
    const read = (await (await getMe(harness, authorization)).json()) as Record<string, unknown>;

    // `request_id` is the envelope and differs per request (`api/README.md` § Request tracing).
    const { request_id: _patchedId, ...patchedBody } = patched;
    const { request_id: _readId, ...readBody } = read;
    expect(patchedBody).toEqual(readBody);
  });

  it("rejects an avatar outside the allowlist with a 422 naming avatarId", async () => {
    for (const avatarId of ["avatar-13", "avatar-00", "cat", ""]) {
      const { harness, authorization } = await signedIn();

      const response = await patchMe(harness, authorization, { avatarId });

      expect(response.status, `${avatarId} must be rejected`).toBe(422);
      const problem = (await response.json()) as { errors?: { field: string }[] };
      expect(problem.errors?.map((error) => error.field)).toEqual(["avatarId"]);
      expect(harness.db.profile.get("acc_1")?.["avatar_id"]).toBe("avatar-03");
    }
  });

  it("rejects a body with no updatable field", async () => {
    const { harness, authorization } = await signedIn();

    const response = await patchMe(harness, authorization, {});

    expect(response.status).toBe(422);
    const problem = (await response.json()) as { errors?: { field: string }[] };
    expect(problem.errors?.[0]?.field).toBe("body");
  });

  it("never writes rating, ratedMatches or stats", async () => {
    const { harness, authorization } = await signedIn();

    const response = await patchMe(harness, authorization, {
      displayName: "Bao",
      rating: 1999,
      ratedMatches: 99,
      stats: { wins: 99 },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["rating"]).toBe(1234);
    expect(body["ratedMatches"]).toBe(7);
    expect(harness.db.profile.get("acc_1")?.["rating"]).toBe(1234);
  });

  it("names the non-writable field when the body contains only one", async () => {
    const { harness, authorization } = await signedIn();

    const response = await patchMe(harness, authorization, { rating: 1999 });

    expect([400, 422]).toContain(response.status);
    const problem = (await response.json()) as { errors?: { field: string }[] };
    expect(problem.errors?.map((error) => error.field)).toEqual(["rating"]);
  });
});
