/**
 * Privacy surface — `docs/01-overview/roles-and-permissions.md` ("See other players' accountId/guestId:
 * ❌" for every role), `docs/02-reference/api/accounts.md` (Privacy surface), TC-AUTH-075.
 *
 * A public endpoint may describe another player only by the handle the game shows: display name, avatar,
 * rating. Anything a response hands out that identifies the account row is a leak, including opaque
 * values like a pagination cursor.
 */
import { describe, expect, it } from "vitest";

import { handleFetch } from "../src/index";
import { mintSession } from "../src/lib/session";
import { fakeRooms, TEST_ISSUER, TEST_SECRET, jsonRequest, testEnv, type TestEnv } from "./support/fake-worker";
import { fakeClerk } from "./support/clerk";

const ACCOUNT_IDS = ["acc_alpha", "acc_bravo", "acc_charlie"];

function seeded(): TestEnv {
  const harness = testEnv();
  ACCOUNT_IDS.forEach((accountId, index) => {
    harness.db.seedPlayer({ accountId, displayName: `Player ${accountId.slice(4)}`, rating: 1500 - index * 40, ratedMatches: 20 });
  });
  return harness;
}

describe("GET /leaderboard — public by design, so it may not name an account", () => {
  it("TC-AUTH-075 : items expose the documented handle fields only", async () => {
    const harness = seeded();

    const response = await handleFetch(new Request("https://api.test/api/v1/leaderboard?limit=2"), harness.env);
    const body = (await response.json()) as { items: Record<string, unknown>[] };

    expect(response.status).toBe(200);
    expect(body.items.length).toBe(2);
    for (const item of body.items) {
      expect(Object.keys(item).sort()).toEqual(["avatarId", "displayName", "rank", "ratedMatches", "rating"]);
    }
  });

  it("TC-AUTH-075 : no item carries an accountId", async () => {
    const harness = seeded();

    const text = await (await handleFetch(new Request("https://api.test/api/v1/leaderboard"), harness.env)).text();

    for (const accountId of ACCOUNT_IDS) {
      expect(text).not.toContain(accountId);
    }
  });

  it("TC-AUTH-075 : the pagination cursor does not encode an accountId", async () => {
    const harness = seeded();

    const body = (await (await handleFetch(new Request("https://api.test/api/v1/leaderboard?limit=2"), harness.env)).json()) as {
      next_cursor?: string | null;
    };
    expect(typeof body.next_cursor).toBe("string");

    const decoded = Buffer.from(String(body.next_cursor), "base64url").toString("utf8");
    for (const accountId of ACCOUNT_IDS) {
      expect(decoded, "a cursor is part of the response and follows the same rule").not.toContain(accountId);
    }
  });
});

describe("room preview — renders the host by name, not by id", () => {
  it("drops accountId, guestId and the roster the DO stores", async () => {
    const rooms = fakeRooms({
      state: {
        status: "lobby",
        members: [
          { playerId: "p1", accountId: "acc_alpha", guestId: null, role: "host", displayName: "Player alpha" },
          { playerId: "p2", accountId: null, guestId: "guest-9", role: "member", displayName: "Guest nine" },
        ],
        hostPlayerId: "p1",
        settings: { maxPlayers: 4, mode: "solo", mapId: "map-01", isPrivate: false },
      },
    });
    const harness = testEnv({ rooms });

    const response = await handleFetch(new Request("https://api.test/api/v1/rooms/ABC234"), harness.env);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).not.toContain("acc_alpha");
    expect(text).not.toContain("guest-9");
    expect(text).not.toContain("playerId");
    expect(JSON.parse(text)).toMatchObject({ hostDisplayName: "Player alpha", joined: 2, joinable: true });
  });
});

describe("GET /me — the caller's own row only", () => {
  it("never includes another player's id, name or email", async () => {
    const harness = seeded();
    harness.db.seedPlayer({ accountId: "acc_self", clerkUserId: "user_self", displayName: "Self Player" });
    const session = await mintSession({ kind: "account", guestId: null, accountId: "acc_self" }, TEST_SECRET);

    const text = await (
      await handleFetch(new Request("https://api.test/api/v1/me", { headers: { authorization: `Bearer ${session.token}` } }), harness.env)
    ).text();

    for (const accountId of ACCOUNT_IDS) expect(text).not.toContain(accountId);
    expect(text).not.toContain("Player bravo");
    expect(text).not.toContain("user_self");
    expect(text).not.toContain("@example.com");
  });
});

describe("the session token is not an identity document", () => {
  it("carries no email and no display name even when the Clerk token has both", async () => {
    const clerk = await fakeClerk();
    try {
      const harness = testEnv();
      const jwt = await clerk.sign("user_1", "an.nguyen@example.com");

      const body = (await (
        await handleFetch(jsonRequest("https://api.test/api/v1/sessions", { kind: "account" }, { authorization: `Bearer ${jwt}` }), harness.env)
      ).json()) as Record<string, unknown>;

      const decoded = Buffer.from(String(body["sessionToken"]), "base64url").toString("utf8");
      expect(String(body["sessionToken"])).not.toContain("an.nguyen");
      expect(decoded).not.toContain("example.com");
    } finally {
      clerk.restore();
    }
  });

  it("does not put the Clerk subject in the token or the response", async () => {
    const clerk = await fakeClerk({ issuer: TEST_ISSUER });
    try {
      const harness = testEnv();
      const jwt = await clerk.sign("user_clerk_secret");

      const text = await (
        await handleFetch(jsonRequest("https://api.test/api/v1/sessions", { kind: "account" }, { authorization: `Bearer ${jwt}` }), harness.env)
      ).text();

      expect(text).not.toContain("user_clerk_secret");
    } finally {
      clerk.restore();
    }
  });
});
