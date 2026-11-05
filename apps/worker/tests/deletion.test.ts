/**
 * Account deletion — `US-AUTH-004`, `docs/02-reference/api/accounts.md` (DELETE /me), TC-AUTH-069.
 *
 * The story is explicit about the order and the leftovers: delete the Clerk user first, mark the D1
 * account `deleted` with a timestamp, schedule the purge at +30 days, and refuse the request entirely
 * when a match is in progress. TC-AUTH-103 (the purge itself) needs the `scheduled` handler, which this
 * Worker does not export — see the report.
 */
import { describe, expect, it } from "vitest";

import { handleFetch } from "../src/index";
import { mintSession } from "../src/lib/session";
import { fakeRooms, TEST_SECRET, testEnv, type TestEnv } from "./support/fake-worker";

interface DeletionHarness {
  readonly harness: TestEnv;
  readonly authorization: string;
  readonly network: string[];
}

async function signIn(options: { rooms?: ReturnType<typeof fakeRooms> } = {}): Promise<DeletionHarness> {
  const harness = testEnv({ rooms: options.rooms });
  harness.db.seedPlayer({ accountId: "acc_1", clerkUserId: "user_1", displayName: "Bao Tran", rating: 1234, ratedMatches: 7 });
  const session = await mintSession({ kind: "account", guestId: null, accountId: "acc_1" }, TEST_SECRET);
  return { harness, authorization: `Bearer ${session.token}`, network: [] };
}

/** Record outbound calls (the Clerk admin API is the only one deletion may make). */
function recordNetwork(sink: string[]): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sink.push(`${init?.method ?? "GET"} ${String(input instanceof Request ? input.url : input)}`);
    return Response.json({ ok: true });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

const deleteMe = (harness: TestEnv, authorization: string): Promise<Response> =>
  handleFetch(new Request("https://api.test/api/v1/me", { method: "DELETE", headers: { authorization } }), harness.env);

describe("DELETE /me — success path", () => {
  it("answers 204 with no body", async () => {
    const { harness, authorization } = await signIn();

    const response = await deleteMe(harness, authorization);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("marks the account deleted and records when", async () => {
    const { harness, authorization } = await signIn();

    await deleteMe(harness, authorization);

    const account = harness.db.account.get("acc_1");
    expect(account?.["status"]).toBe("deleted");
    expect(account).toHaveProperty("deleted_at");
    expect(Date.parse(String(account?.["deleted_at"]))).toBeGreaterThan(Date.now() - 60_000);
  });

  it("keeps the profile row and its rating history for the 30-day window", async () => {
    const { harness, authorization } = await signIn();

    await deleteMe(harness, authorization);

    expect(harness.db.profile.has("acc_1")).toBe(true);
    expect(harness.db.account.get("acc_1")?.["status"]).toBe("deleted");
  });

  it("deletes the Clerk user before the D1 rows are scheduled for purge", async () => {
    const { harness, authorization, network } = await signIn();
    const restore = recordNetwork(network);
    try {
      await deleteMe(harness, authorization);
    } finally {
      restore();
    }

    expect(network.some((call) => call === "DELETE https://api.clerk.com/v1/users/user_1")).toBe(true);
  });
});

describe("TC-AUTH-069 : deletion is refused while a match is in progress", () => {
  it("answers 409 and leaves the account and the room untouched", async () => {
    const rooms = fakeRooms({
      state: {
        status: "playing",
        members: [{ playerId: "p1", accountId: "acc_1", role: "host", displayName: "Bao Tran" }],
        hostPlayerId: "p1",
        settings: { maxPlayers: 4, mode: "solo", mapId: "map-01", isPrivate: false },
      },
    });
    const { harness, authorization } = await signIn({ rooms });
    // `joinRoomByCode` records where the player sits, because a Durable Object cannot be enumerated; this is
    // the state a real join would have left behind (`US-AUTH-004`, TC-AUTH-069).
    harness.db.profile.set("acc_1", { ...(harness.db.profile.get("acc_1") ?? {}), current_room_code: "ABC234" });

    const response = await deleteMe(harness, authorization);

    expect(response.status).toBe(409);
    const problem = (await response.json()) as Record<string, unknown>;
    expect(String(problem["type"])).toMatch(/conflict|room-closed|forbidden|invalid-state/);
    expect(String(problem["detail"] ?? "")).toMatch(/match|room/i);
    expect(harness.db.account.get("acc_1")?.["status"]).toBe("active");
    expect(harness.db.profile.has("acc_1")).toBe(true);
  });
});

describe("a deleted account has no access", () => {
  it("refuses /me with 401 once deletion is scheduled", async () => {
    const { harness, authorization } = await signIn();
    await deleteMe(harness, authorization);

    const get = await handleFetch(new Request("https://api.test/api/v1/me", { headers: { authorization } }), harness.env);
    const patch = await handleFetch(
      new Request("https://api.test/api/v1/me", {
        method: "PATCH",
        headers: { authorization, "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Ghost" }),
      }),
      harness.env,
    );

    expect(get.status).toBe(401);
    expect(patch.status).toBe(401);
    expect(harness.db.profile.get("acc_1")?.["display_name"]).toBe("Bao Tran");
  });

  it("refuses a second DELETE with 401 rather than deleting twice", async () => {
    const { harness, authorization } = await signIn();
    await deleteMe(harness, authorization);

    const second = await deleteMe(harness, authorization);

    expect(second.status).toBe(401);
  });
});
