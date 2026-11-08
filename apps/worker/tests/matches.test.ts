/**
 * `POST /matches` — validation, idempotency, the 409 and the Elo write (`matches.md`, `US-RANK-001/002`).
 *
 * The endpoint is the only writer of ratings, so these tests look at the rows, not only the status code:
 * a 201 that wrote half a match is exactly the failure the story's atomicity criterion is about.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetLimits } from "../src/lib/ratelimit";
import { createRig, seedProfile, type Rig } from "./support/fake-env";
import { TUNABLES } from "@gbw/core";

const STARTED = "2026-11-05T10:00:00.000Z";
const ENDED = "2026-11-05T10:10:00.000Z";

// The limiter's buckets are module state and this file sits well past one account's hourly allowance of
// submissions, so every case starts from an empty counter the way it starts from an empty database.
beforeEach(() => resetLimits());

interface PlayerInput {
  slot: number;
  team: "A" | "B";
  accountId: string | null;
  damageDealt: number;
  shotsFired: number;
  hits: number;
}

function players(overrides: { teamB?: "guest" } = {}): PlayerInput[] {
  return [
    { slot: 0, team: "A", accountId: "acct-a1", damageDealt: 140, shotsFired: 12, hits: 7 },
    { slot: 1, team: "A", accountId: "acct-a2", damageDealt: 90, shotsFired: 9, hits: 4 },
    { slot: 2, team: "B", accountId: overrides.teamB === "guest" ? null : "acct-b1", damageDealt: 30, shotsFired: 8, hits: 2 },
    { slot: 3, team: "B", accountId: "acct-b2", damageDealt: 20, shotsFired: 6, hits: 1 },
  ];
}

function submission(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    matchId: "match-0001",
    roomCode: "ABCD23",
    rulesetVersion: TUNABLES.rulesetVersion,
    startedAt: STARTED,
    endedAt: ENDED,
    winnerTeam: "A",
    abandoned: false,
    players: players(),
    ...overrides,
  };
}

async function rigWithProfiles(): Promise<{ rig: Rig; token: string }> {
  return rigWithRatings({ "acct-a1": 1200, "acct-a2": 1200, "acct-b1": 1200, "acct-b2": 1200 });
}

/** The same rig, with the ratings and rated-match counts a criterion needs to reach an edge. */
async function rigWithRatings(
  ratings: Record<string, number>,
  ratedMatches: Record<string, number> = {},
): Promise<{ rig: Rig; token: string }> {
  const rig = createRig();
  for (const [accountId, rating] of Object.entries(ratings)) {
    seedProfile(rig.db, {
      accountId,
      displayName: accountId.replace("acct-", "P"),
      rating,
      ratedMatches: ratedMatches[accountId] ?? 0,
    });
  }
  const token = await rig.token({ kind: "account", accountId: "acct-a1", guestId: null });
  return { rig, token };
}

/** The smallest legal submission: one registered player on each team. */
function oneOnOne(): PlayerInput[] {
  return [
    { slot: 0, team: "A", accountId: "acct-a1", damageDealt: 10, shotsFired: 2, hits: 1 },
    { slot: 1, team: "B", accountId: "acct-b1", damageDealt: 0, shotsFired: 2, hits: 0 },
  ];
}

describe("POST /matches — the happy path and the Elo write", () => {
  it("TC-RANK-110: a ranked 2v2 writes the record, both players and both rating rows in one batch", async () => {
    // Arrange
    const { rig, token } = await rigWithProfiles();

    // Act
    const response = await rig.request("POST", "/matches", {
      body: submission(),
      token,
      headers: { "idempotency-key": "key-0001" },
    });

    // Assert
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      matchId: string;
      ranked: boolean;
      ratings: { accountId: string; before: number; after: number }[];
    };
    expect(body.matchId).toBe("match-0001");
    expect(body.ranked).toBe(true);
    expect(rig.db.rows("match_record")).toHaveLength(1);
    expect(rig.db.rows("match_player")).toHaveLength(4);
    expect(rig.db.rows("rating_history")).toHaveLength(4);
    expect(rig.db.batches).toBe(1);
    // Equal teams: +16 for A, -16 for B (US-RANK-002 AC1)
    expect(body.ratings.find((row) => row.accountId === "acct-a1")?.after).toBe(1216);
    expect(body.ratings.find((row) => row.accountId === "acct-b1")?.after).toBe(1184);
    // The history is what an audit reads, so the stored rows carry the before/after/delta, not just the response
    const history = new Map(rig.db.rows("rating_history").map((row) => [row["account_id"], row]));
    for (const accountId of ["acct-a1", "acct-a2"]) {
      expect(history.get(accountId)).toMatchObject({ rating_before: 1200, rating_after: 1216, delta: 16 });
    }
    for (const accountId of ["acct-b1", "acct-b2"]) {
      expect(history.get(accountId)).toMatchObject({ rating_before: 1200, rating_after: 1184, delta: -16 });
    }
    const profile = rig.db.rows("profile").find((row) => row["account_id"] === "acct-a1");
    expect(profile?.["rating"]).toBe(1216);
    expect(profile?.["rated_matches"]).toBe(1);
    rig.db.close();
  });

  it("TC-RANK-110: the response reports the per-player delta the doc names", async () => {
    // Arrange
    const { rig, token } = await rigWithProfiles();

    // Act
    const response = await rig.request("POST", "/matches", { body: submission(), token });

    // Assert — matches.md: `ratings[]` is `{ accountId, before, after, delta }`
    const body = (await response.json()) as { ratings: Record<string, unknown>[] };
    expect(Object.keys(body.ratings[0] ?? {}).sort()).toEqual(["accountId", "after", "before", "delta"]);
    rig.db.close();
  });

  it("TC-RANK-111: a second submission of the same matchId is refused with 409", async () => {
    // Arrange
    const { rig, token } = await rigWithProfiles();
    await rig.request("POST", "/matches", { body: submission(), token });

    // Act
    const again = await rig.request("POST", "/matches", { body: submission(), token });

    // Assert
    expect(again.status).toBe(409);
    const problem = (await again.json()) as { type: string };
    expect(problem.type).toContain("match-already-recorded");
    expect(rig.db.rows("match_record")).toHaveLength(1);
    expect(rig.db.rows("rating_history")).toHaveLength(4);
    rig.db.close();
  });

  it("TC-RANK-111: the same Idempotency-Key replays the first answer instead of recording twice", async () => {
    // Arrange — matches.md: "Idempotent by Idempotency-Key for 24 h"
    const { rig, token } = await rigWithProfiles();
    const first = await rig.request("POST", "/matches", {
      body: submission(),
      token,
      headers: { "idempotency-key": "retry-key" },
    });
    expect(first.status).toBe(201);

    // Act — a retry with the same key but a fresh matchId (the client regenerated it)
    const retry = await rig.request("POST", "/matches", {
      body: submission({ matchId: "match-0002", startedAt: "2026-11-05T11:00:00.000Z", endedAt: "2026-11-05T11:10:00.000Z" }),
      token,
      headers: { "idempotency-key": "retry-key" },
    });

    // Assert
    expect(rig.db.rows("match_record")).toHaveLength(1);
    expect(retry.status).toBe(201);
    const body = (await retry.json()) as { matchId: string };
    expect(body.matchId).toBe("match-0001");
    rig.db.close();
  });
});

describe("POST /matches — validation (TC-RANK-115)", () => {
  it("TC-RANK-115: a duration under a minute is 422", async () => {
    // Arrange
    const { rig, token } = await rigWithProfiles();

    // Act
    const response = await rig.request("POST", "/matches", {
      body: submission({ endedAt: "2026-11-05T10:00:30.000Z" }),
      token,
    });

    // Assert
    expect(response.status).toBe(422);
    expect(rig.db.rows("match_record")).toHaveLength(0);
    rig.db.close();
  });

  it("TC-RANK-115: fewer than two players is 422", async () => {
    // Arrange
    const { rig, token } = await rigWithProfiles();

    // Act
    const response = await rig.request("POST", "/matches", {
      body: submission({ players: players().slice(0, 1) }),
      token,
    });

    // Assert
    expect(response.status).toBe(422);
    rig.db.close();
  });

  it("TC-RANK-115: unequal team sizes are 422", async () => {
    // Arrange
    const { rig, token } = await rigWithProfiles();
    const lopsided = players().map((player) => (player.slot === 3 ? { ...player, team: "A" as const } : player));

    // Act
    const response = await rig.request("POST", "/matches", { body: submission({ players: lopsided }), token });

    // Assert
    expect(response.status).toBe(422);
    rig.db.close();
  });

  it("TC-RANK-115: hits above shotsFired are 422", async () => {
    // Arrange — matches.md: "0 ≤ hits ≤ shotsFired"
    const { rig, token } = await rigWithProfiles();
    const impossible = players().map((player) => (player.slot === 0 ? { ...player, shotsFired: 3, hits: 9 } : player));

    // Act
    const response = await rig.request("POST", "/matches", { body: submission({ players: impossible }), token });

    // Assert
    expect(response.status).toBe(422);
    rig.db.close();
  });

  it("TC-RANK-115: two players on the same slot are 422", async () => {
    // Arrange — matches.md: slots are unique
    const { rig, token } = await rigWithProfiles();
    const collided = players().map((player) => (player.slot === 1 ? { ...player, slot: 0 } : player));

    // Act
    const response = await rig.request("POST", "/matches", { body: submission({ players: collided }), token });

    // Assert
    expect(response.status).toBe(422);
    rig.db.close();
  });

  it("TC-RANK-115: a winnerTeam outside A and B is 422", async () => {
    // Arrange
    const { rig, token } = await rigWithProfiles();

    // Act
    const response = await rig.request("POST", "/matches", { body: submission({ winnerTeam: "C" }), token });

    // Assert
    expect(response.status).toBe(422);
    expect(rig.db.rows("match_record")).toHaveLength(0);
    rig.db.close();
  });

  it("TC-RANK-112: a submitter who is not a participant is forbidden", async () => {
    // Arrange — `acct-stranger` signs in and submits a match between four other accounts
    const { rig } = await rigWithProfiles();
    seedProfile(rig.db, { accountId: "acct-stranger", displayName: "Stranger" });
    const stranger = await rig.token({ kind: "account", accountId: "acct-stranger", guestId: null });

    // Act
    const response = await rig.request("POST", "/matches", { body: submission(), token: stranger });

    // Assert — matches.md error table: 403 forbidden
    expect(response.status).toBe(403);
    expect(rig.db.rows("match_record")).toHaveLength(0);
    rig.db.close();
  });

  it("TC-RANK-115: a guest token cannot submit a match", async () => {
    // Arrange
    const { rig } = await rigWithProfiles();
    const guest = await rig.token({ kind: "guest", accountId: null, guestId: "guest-1" });

    // Act
    const response = await rig.request("POST", "/matches", { body: submission(), token: guest });

    // Assert
    expect(response.status).toBe(401);
    rig.db.close();
  });
});

describe("POST /matches — ranking rules", () => {
  it("TC-RANK-116: a rulesetVersion the server does not run is recorded unranked", async () => {
    // Arrange
    const { rig, token } = await rigWithProfiles();

    // Act
    const response = await rig.request("POST", "/matches", {
      body: submission({ rulesetVersion: "2025-01-01" }),
      token,
    });

    // Assert
    const body = (await response.json()) as { ranked: boolean; rankedReason: string; ratings: unknown[] };
    expect(response.status).toBe(201);
    expect(body.ranked).toBe(false);
    // AC6 names the reason on the wire and stores it, so the results screen can say why nothing moved.
    expect(body.rankedReason).toBe("ruleset_mismatch");
    expect(body.ratings).toEqual([]);
    expect(rig.db.rows("match_record")[0]?.["ranked_reason"]).toBe("ruleset_mismatch");
    expect(rig.db.rows("rating_history")).toHaveLength(0);
    rig.db.close();
  });

  it("TC-RANK-116: an abandoned match is recorded with result abandon and no rating", async () => {
    // Arrange
    const { rig, token } = await rigWithProfiles();

    // Act
    const response = await rig.request("POST", "/matches", {
      // data/matches.md: `winner_team` is NOT NULL and one of A|B, so an abandoned submission still names it.
      body: submission({ abandoned: true }),
      token,
    });

    // Assert
    expect(response.status).toBe(201);
    const body = (await response.json()) as { ranked: boolean; rankedReason: string };
    expect(body.ranked).toBe(false);
    expect(body.rankedReason).toBe("abandoned");
    const results = rig.db.rows("match_player").map((row) => row["result"]);
    expect(results.every((result) => result === "abandon")).toBe(true);
    expect(rig.db.rows("rating_history")).toHaveLength(0);
    rig.db.close();
  });

  it("TC-RANK-162: a guest is excluded from the average and the rated players still move", async () => {
    // Arrange — one guest on team B, with team B rated so the average can only be right if the seat is skipped:
    // A = (1200 + 1200) / 2 = 1200, B = acct-b2 alone = 1000. Counting the guest as a 1200 player would put B at
    // 1100 and turn both deltas into ±12, so a `±8` here is what proves the exclusion.
    const { rig, token } = await rigWithRatings({
      "acct-a1": 1200,
      "acct-a2": 1200,
      "acct-b2": 1000,
    });

    // Act
    const response = await rig.request("POST", "/matches", {
      body: submission({ players: players({ teamB: "guest" }) }),
      token,
    });

    // Assert — AC7: "the guest is excluded from the average; the remaining team members are rated"
    const body = (await response.json()) as {
      ranked: boolean;
      ratings: { accountId: string; before: number; after: number; delta: number }[];
    };
    expect(body.ranked).toBe(true);
    // `expected(A) = 1 / (1 + 10 ** ((1000 - 1200) / 400)) = 0.7597…`, so both sides move 8, not the 12 a
    // guest-inclusive 1100 average would produce.
    expect(body.ratings.map((row) => [row.accountId, row.delta]).sort()).toEqual([
      ["acct-a1", 8],
      ["acct-a2", 8],
      ["acct-b2", -8],
    ]);
    const ratings = new Map(rig.db.rows("profile").map((row) => [row["account_id"], row["rating"]]));
    expect(ratings.get("acct-a1")).toBe(1208);
    expect(ratings.get("acct-a2")).toBe(1208);
    expect(ratings.get("acct-b2")).toBe(992);
    expect(rig.db.rows("rating_history")).toHaveLength(3);
    // Only seats with an account are stored in `match_player` (`TC-RANK-119`), so the guest leaves no row.
    expect(rig.db.rows("match_player")).toHaveLength(3);
    expect(rig.db.rows("match_player").some((row) => row["slot"] === 2)).toBe(false);
    rig.db.close();
  });
});

describe("POST /matches — the Elo write (US-RANK-002)", () => {
  it("TC-RANK-158: the favourite gains less than it would against an equal team", async () => {
    // Arrange — AC2: team A averages 1400, team B 1200, so `expected(A) = 0.7597…` and `round(32 × 0.2403) = 8`:
    // half the ±16 an equal team earns. A per-player expected score would give the 1200-rated pair −16 each.
    const { rig, token } = await rigWithRatings({
      "acct-a1": 1400,
      "acct-a2": 1400,
      "acct-b1": 1200,
      "acct-b2": 1200,
    });

    // Act
    const response = await rig.request("POST", "/matches", { body: submission(), token });

    // Assert
    expect(response.status).toBe(201);
    const deltas = new Map(
      rig.db.rows("rating_history").map((row) => [row["account_id"], row["delta"]]),
    );
    expect(deltas.get("acct-a1")).toBe(8);
    expect(deltas.get("acct-a2")).toBe(8);
    expect(deltas.get("acct-b1")).toBe(-8);
    expect(deltas.get("acct-b2")).toBe(-8);
    const history = new Map(rig.db.rows("rating_history").map((row) => [row["account_id"], row]));
    expect(history.get("acct-a1")).toMatchObject({ rating_before: 1400, rating_after: 1408 });
    expect(history.get("acct-b1")).toMatchObject({ rating_before: 1200, rating_after: 1192 });
    const profiles = new Map(rig.db.rows("profile").map((row) => [row["account_id"], row["rating"]]));
    expect([profiles.get("acct-a1"), profiles.get("acct-b1")]).toEqual([1408, 1192]);
    rig.db.close();
  });

  it("TC-RANK-159: a settled player's delta uses K = 16 while a newcomer's uses 32", async () => {
    // Arrange — AC3: acct-a1 has 30 rated matches, the other three have none; every rating is 1200
    const { rig, token } = await rigWithRatings(
      { "acct-a1": 1200, "acct-a2": 1200, "acct-b1": 1200, "acct-b2": 1200 },
      { "acct-a1": 30 },
    );

    // Act
    const response = await rig.request("POST", "/matches", { body: submission(), token });

    // Assert — round(16 × 0.5) = 8 for the settled winner, round(32 × 0.5) = 16 for everybody else
    expect(response.status).toBe(201);
    const deltas = new Map(
      rig.db.rows("rating_history").map((row) => [row["account_id"], row["delta"]]),
    );
    expect(deltas.get("acct-a1")).toBe(8);
    expect(deltas.get("acct-a2")).toBe(16);
    expect(deltas.get("acct-b1")).toBe(-16);
    expect(deltas.get("acct-b2")).toBe(-16);
    const settled = rig.db.rows("profile").find((row) => row["account_id"] === "acct-a1");
    expect(settled?.["rated_matches"]).toBe(31);
    rig.db.close();
  });

  it("TC-RANK-160: a rating at either edge is clamped, and the clamp is what the history records", async () => {
    // Arrange — AC4: both players sit at 3999, so the +16 an equal team earns would pass 4000
    const top = await rigWithRatings({ "acct-a1": 3999, "acct-b1": 3999 });

    // Act
    const won = await top.rig.request("POST", "/matches", {
      body: submission({ players: oneOnOne() }),
      token: top.token,
    });

    // Assert — rating_after is the clamp and `delta` is what was applied, so the clamp is visible
    expect(won.status).toBe(201);
    const winner = top.rig.db.rows("rating_history").find((row) => row["account_id"] === "acct-a1");
    expect(winner).toMatchObject({ rating_before: 3999, rating_after: 4000, delta: 1 });
    const winnerProfile = top.rig.db.rows("profile").find((row) => row["account_id"] === "acct-a1");
    expect(winnerProfile?.["rating"]).toBe(4000);
    top.rig.db.close();

    // Arrange — the other edge: 3 − 16 would be negative
    const bottom = await rigWithRatings({ "acct-a1": 3, "acct-b1": 3 });

    // Act
    const lost = await bottom.rig.request("POST", "/matches", {
      body: submission({ players: oneOnOne(), winnerTeam: "B" }),
      token: bottom.token,
    });

    // Assert
    expect(lost.status).toBe(201);
    const loser = bottom.rig.db.rows("rating_history").find((row) => row["account_id"] === "acct-a1");
    expect(loser).toMatchObject({ rating_before: 3, rating_after: 0, delta: -3 });
    const loserProfile = bottom.rig.db.rows("profile").find((row) => row["account_id"] === "acct-a1");
    expect(loserProfile?.["rating"]).toBe(0);
    bottom.rig.db.close();
  });

  it("TC-RANK-161: one account is rated once per match, because the unique index refuses a second row", async () => {
    // Arrange — AC6: a recorded match, then the row a replay would try to write
    const { rig, token } = await rigWithProfiles();
    const recorded = await rig.request("POST", "/matches", { body: submission(), token });
    expect(recorded.status).toBe(201);

    // Act + Assert — `UNIQUE (account_id, match_id)` is the guard, not the route's pre-check
    expect(() =>
      rig.db.sql
        .prepare(
          `INSERT INTO rating_history (account_id, match_id, rating_before, rating_after, delta, created_at)
           VALUES ('acct-a1', 'match-0001', 1216, 1232, 16, '2026-11-05T10:00:00.000Z')`,
        )
        .run(),
    ).toThrow(/UNIQUE constraint failed: rating_history/);
    const rows = rig.db
      .rows("rating_history")
      .filter((row) => row["account_id"] === "acct-a1" && row["match_id"] === "match-0001");
    expect(rows).toHaveLength(1);

    // The route never gets that far either: a replay is refused, and no rating moves a second time.
    const replay = await rig.request("POST", "/matches", { body: submission(), token });
    expect(replay.status).toBe(409);
    const afterReplay = new Map(rig.db.rows("profile").map((row) => [row["account_id"], row["rating"]]));
    expect([afterReplay.get("acct-a1"), afterReplay.get("acct-b1")]).toEqual([1216, 1184]);
    expect(rig.db.rows("rating_history")).toHaveLength(4);
    rig.db.close();
  });
});

describe("POST /matches — one record, one host, one winner", () => {
  it("TC-RANK-117: a second match for the same room and start time is refused with the stored id", async () => {
    // Arrange — AC2: the same room occurrence submitted again, with a freshly generated matchId
    const { rig, token } = await rigWithProfiles();
    const first = await rig.request("POST", "/matches", { body: submission(), token });
    expect(first.status).toBe(201);
    const stored = (await first.json()) as { matchId: string };

    // Act
    const again = await rig.request("POST", "/matches", { body: submission({ matchId: "match-9999" }), token });

    // Assert — the occurrence, not the id, is what decides; the body names the row that already exists
    expect(again.status).toBe(409);
    const problem = (await again.json()) as { type: string; errors?: { field: string; detail: string }[] };
    expect(problem.type).toContain("match-already-recorded");
    expect(problem.errors?.some((error) => error.detail === stored.matchId)).toBe(true);
    expect(rig.db.rows("match_record")).toHaveLength(1);
    expect(rig.db.rows("rating_history")).toHaveLength(4);
    rig.db.close();
  });

  it("TC-RANK-118: a participant who is not the room's host is refused, and the host is not", async () => {
    // Arrange — a real room: `acct-a1` mints it (and so hosts it), `acct-a2` takes the second seat
    const { rig, token } = await rigWithProfiles();
    const created = await rig.request("POST", "/rooms", {
      token,
      body: { maxPlayers: 4, displayName: "Host", mobileId: "mbl-01", avatarId: "av-01" },
    });
    expect(created.status).toBe(201);
    const { roomCode } = (await created.json()) as { roomCode: string };
    const peerToken = await rig.token({ kind: "account", accountId: "acct-a2", guestId: null });
    const joined = await rig.request("POST", `/rooms/${roomCode}/join`, {
      token: peerToken,
      body: { displayName: "Peer", mobileId: "mbl-02", avatarId: "av-01" },
    });
    expect(joined.status).toBe(200);
    const body = submission({ roomCode });

    // Act — the peer submits first; the room names `acct-a1`
    const asPeer = await rig.request("POST", "/matches", { body, token: peerToken });

    // Assert — AC3: the room is the authority on the role, and nothing was written
    expect(asPeer.status).toBe(403);
    expect(((await asPeer.json()) as { type: string }).type).toContain("not-host");
    expect(rig.db.rows("match_record")).toHaveLength(0);
    expect(rig.db.rows("rating_history")).toHaveLength(0);

    // Act — the host submits the same payload
    const asHost = await rig.request("POST", "/matches", { body, token });

    // Assert — the refusal was about the role, not the match: the host's own call lands
    expect(asHost.status).toBe(201);
    expect(rig.db.rows("match_record")).toHaveLength(1);
    rig.db.close();
  });

  it("TC-RANK-119: a team with no account is stored unranked, with NULL ratings and no history", async () => {
    // Arrange — AC5: both seats of team B are guests, so there is nobody to rate on that side
    const { rig, token } = await rigWithProfiles();
    const guestPlayers = players();
    guestPlayers[2] = { ...guestPlayers[2]!, accountId: null };
    guestPlayers[3] = { ...guestPlayers[3]!, accountId: null };

    // Act
    const response = await rig.request("POST", "/matches", { body: submission({ players: guestPlayers }), token });

    // Assert
    expect(response.status).toBe(201);
    const body = (await response.json()) as { ranked: boolean; rankedReason: string; ratings: unknown[] };
    expect(body.ranked).toBe(false);
    expect(body.rankedReason).toBe("guest");
    expect(body.ratings).toEqual([]);
    const rows = rig.db.rows("match_player");
    expect(rows.map((row) => row["account_id"])).toEqual(["acct-a1", "acct-a2"]);
    expect(rows.every((row) => row["rating_before"] === null && row["rating_after"] === null)).toBe(true);
    expect(rig.db.rows("rating_history")).toHaveLength(0);
    expect(rig.db.rows("match_record")[0]?.["ranked_reason"]).toBe("guest");
    rig.db.close();
  });

  it("TC-RANK-120: two submissions racing for one room leave exactly one record", async () => {
    // Arrange — AC7: the client fires a retry before the first answer lands
    const { rig, token } = await rigWithProfiles();

    // Act
    const [first, second] = await Promise.all([
      rig.request("POST", "/matches", { body: submission({ matchId: "match-race-a" }), token }),
      rig.request("POST", "/matches", { body: submission({ matchId: "match-race-b" }), token }),
    ]);

    // Assert — one winner, one 409, one row: the unique index decides, not a read the other call can pass
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    expect(rig.db.rows("match_record")).toHaveLength(1);
    expect(rig.db.rows("rating_history")).toHaveLength(4);
    rig.db.close();
  });

  it("TC-RANK-121: implausible damage is stored, and one line is logged for review", async () => {
    // Arrange — § 5: damage above 100 × shots is accepted and flagged, never rejected (`OQ-30`)
    const { rig, token } = await rigWithProfiles();
    const lines: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((line: unknown) => {
      lines.push(String(line));
    });
    const implausible = players();
    implausible[0] = { ...implausible[0]!, damageDealt: 5_000, shotsFired: 3, hits: 2 };

    // Act
    const response = await rig.request("POST", "/matches", { body: submission({ players: implausible }), token });
    spy.mockRestore();

    // Assert
    expect(response.status).toBe(201);
    expect(rig.db.rows("match_player").map((row) => row["damage_dealt"])).toContain(5_000);
    const flagged = lines.map((line) => JSON.parse(line) as Record<string, unknown>).filter((line) => line["code"] === "implausible_stats");
    expect(flagged).toHaveLength(1);
    expect(flagged[0]?.["slots"]).toEqual([0]);
    expect(flagged[0]?.["room_code"]).toBe("ABCD23");
    rig.db.close();
  });
});

describe("POST /matches — the delay table (US-CORE-002 AC7)", () => {
  it("TC-CORE-939: the table that produced the turn order is stored on the record", async () => {
    // Arrange
    const { rig, token } = await rigWithProfiles();

    // Act
    const response = await rig.request("POST", "/matches", {
      body: submission({ delayTable: [0, 120, 40, 0] }),
      token,
    });

    // Assert — stored as JSON in slot order, so a disputed result can be replayed
    expect(response.status).toBe(201);
    const row = rig.db.rows("match_record")[0];
    expect(JSON.parse(String(row?.["delay_table"]))).toEqual([0, 120, 40, 0]);
    rig.db.close();
  });

  it("TC-CORE-939: a submission without a table records an empty one", async () => {
    // Arrange — an older client that does not track the queue
    const { rig, token } = await rigWithProfiles();

    // Act
    const response = await rig.request("POST", "/matches", { body: submission(), token });

    // Assert
    expect(response.status).toBe(201);
    expect(rig.db.rows("match_record")[0]?.["delay_table"]).toBe("[]");
    rig.db.close();
  });

  it("TC-CORE-939: a fractional or negative delay is 422 and nothing is written", async () => {
    // Arrange
    const { rig, token } = await rigWithProfiles();

    // Act
    const fractional = await rig.request("POST", "/matches", {
      body: submission({ matchId: "match-0002", delayTable: [0, 1.5, 2] }),
      token,
    });
    const negative = await rig.request("POST", "/matches", {
      body: submission({ matchId: "match-0003", delayTable: [0, -1] }),
      token,
    });

    // Assert
    expect(fractional.status).toBe(422);
    expect(negative.status).toBe(422);
    expect(rig.db.rows("match_record")).toHaveLength(0);
    rig.db.close();
  });
});
