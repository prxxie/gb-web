/**
 * `POST /matches` — validation, idempotency, the 409 and the Elo write (`matches.md`, `US-RANK-001/002`).
 *
 * The endpoint is the only writer of ratings, so these tests look at the rows, not only the status code:
 * a 201 that wrote half a match is exactly the failure the story's atomicity criterion is about.
 */
import { describe, expect, it, vi } from "vitest";
import { createRig, seedProfile, type Rig } from "./support/fake-env";

const STARTED = "2026-11-05T10:00:00.000Z";
const ENDED = "2026-11-05T10:10:00.000Z";

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
    rulesetVersion: "2026-11-05",
    startedAt: STARTED,
    endedAt: ENDED,
    winnerTeam: "A",
    abandoned: false,
    players: players(),
    ...overrides,
  };
}

async function rigWithProfiles(): Promise<{ rig: Rig; token: string }> {
  const rig = createRig();
  for (const [accountId, rating] of [
    ["acct-a1", 1200],
    ["acct-a2", 1200],
    ["acct-b1", 1200],
    ["acct-b2", 1200],
  ] as const) {
    seedProfile(rig.db, { accountId, displayName: accountId.replace("acct-", "P"), rating });
  }
  const token = await rig.token({ kind: "account", accountId: "acct-a1", guestId: null });
  return { rig, token };
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

  it("US-RANK-002 AC7: a guest is excluded from the average and the rated players still move", async () => {
    // Arrange — one guest on team B
    const { rig, token } = await rigWithProfiles();

    // Act
    const response = await rig.request("POST", "/matches", {
      body: submission({ players: players({ teamB: "guest" }) }),
      token,
    });

    // Assert — AC7: "the guest is excluded from the average; the remaining team members are rated"
    const body = (await response.json()) as { ranked: boolean; ratings: { accountId: string; before: number; after: number }[] };
    expect(body.ranked).toBe(true);
    const ratedB = rig.db.rows("profile").find((row) => row["account_id"] === "acct-b2");
    expect(ratedB?.["rating"]).not.toBe(1200);
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
