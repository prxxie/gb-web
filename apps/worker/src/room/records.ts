/**
 * `POST /api/v1/matches` from inside the object (`US-RANK-001`, `US-RANK-005`).
 *
 * The id and the timestamps come from the DO, so the host cannot backdate a match or record one twice:
 * `409 match-already-recorded` on a retry counts as success. The subrequest is the only network call the
 * object makes, and it is made with the host's own session token.
 */
import { RULESET_VERSION, type MatchEndFrame, type RoomState } from "@gbw/core";
import { matchIdOf, matchPlayers } from "./match-lifecycle.js";
import { reasonOf, type RecordedMatch } from "./protocol.js";

export type RecordOutcome =
  | { readonly ok: true; readonly value: RecordedMatch }
  | { readonly ok: false; readonly detail: string };

export interface RecordInput {
  readonly room: RoomState;
  /** Public origin of the Worker that opened the socket; without it nothing is posted. */
  readonly origin: string | null;
  /** The session the host authenticated with — `POST /matches` authorises the submitter as a player. */
  readonly token: string | null;
  /** `match_started.startedAt`, the other half of the idempotency key. */
  readonly matchStartedAt: number | null;
  readonly frame: MatchEndFrame;
  readonly endedAt: number;
  /** A forfeit is recorded as abandoned so the result enum says `abandon` (`US-ROOM-004` AC6). */
  readonly abandoned: boolean;
  /** The copy this object already wrote, so a host retry after a network blip is answered, not refused. */
  readonly recorded: RecordedMatch | null;
}

/**
 * `recordMatch`, with the subrequest's failure turned into a refusal the host can read: the object must answer an
 * error, never leave a dead socket. Nothing below throws.
 */
export async function recordMatch(input: RecordInput): Promise<RecordOutcome> {
  try {
    return await post(input);
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "the match could not be recorded" };
  }
}

async function post(input: RecordInput): Promise<RecordOutcome> {
  const { room, origin, token, matchStartedAt, frame, endedAt, abandoned, recorded } = input;
  // The record's id is half its idempotency key: a host's retry rebuilds it from `match_started.startedAt`
  // (`US-RANK-005` AC6), so a guessed start would let the same match in twice. Refuse instead.
  if (matchStartedAt === null) {
    return { ok: false, detail: "the room has no start time to key the record with" };
  }
  const startedAt = matchStartedAt;
  const matchId = matchIdOf(room.roomCode, startedAt);
  const players = matchPlayers(room, frame.stats);
  const unranked: RecordedMatch = {
    matchId,
    winnerTeam: frame.winnerTeam,
    ranked: false,
    // A room that never reaches the route has no record to read a reason from; a seat without an
    // account is a guest or a bot, and guessing `guest` would be a fact the object does not hold.
    rankedReason: null,
    ratings: [],
    players: [],
  };
  if (!origin || !token || !players.every((player) => player.accountId !== null)) {
    // A guest room, or a host promoted mid-match, cannot be rated; the results screen still needs a winner.
    return { ok: true, value: unranked };
  }
  const response = await fetch(new URL("/api/v1/matches", origin).toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "idempotency-key": matchId,
    },
    body: JSON.stringify({
      matchId,
      roomCode: room.roomCode,
      rulesetVersion: RULESET_VERSION,
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      winnerTeam: frame.winnerTeam,
      abandoned,
      players,
      delayTable: frame.delayTable ?? [],
    }),
  });
  // Already recorded: the object's own copy is the truth, and the local literal is only what is known
  // when this instance never wrote one (`ranked:false` there means "unknown", not "unrated").
  if (response.status === 409) {
    return { ok: true, value: recorded?.matchId === matchId ? recorded : unranked };
  }
  if (response.status === 201) {
    const body = (await response.json()) as {
      matchId: string;
      ranked: boolean;
      rankedReason?: string | null;
      ratings: readonly { accountId: string; before: number | null; after: number | null }[];
    };
    return {
      ok: true,
      value: {
        matchId: body.matchId,
        winnerTeam: frame.winnerTeam,
        ranked: body.ranked,
        rankedReason: reasonOf(body.rankedReason),
        ratings: body.ratings
          .filter((rating) => rating.before !== null && rating.after !== null)
          .map((rating) => ({
            accountId: rating.accountId,
            before: rating.before as number,
            after: rating.after as number,
            delta: (rating.after as number) - (rating.before as number),
          })),
        players: players.map((player) => ({
          slot: player.slot,
          result:
            frame.winnerTeam === null
              ? "loss"
              : player.team === frame.winnerTeam
                ? "win"
                : abandoned
                  ? "abandon"
                  : "loss",
        })),
      },
    };
  }
  const detail = await response.text();
  return { ok: false, detail: `the match record was refused (${response.status}): ${detail.slice(0, 120)}` };
}

/** The first socket that still has a session token, host first (`POST /matches` accepts any player). */
export function participantToken(
  hostPlayerId: string | null,
  sockets: ReadonlyMap<string, WebSocket>,
  tokenOf: (socket: WebSocket) => string | null,
): string | null {
  const hostSocket = hostPlayerId === null ? undefined : sockets.get(hostPlayerId);
  const ordered = hostSocket === undefined ? [...sockets.values()] : [hostSocket, ...sockets.values()];
  for (const socket of ordered) {
    const token = tokenOf(socket);
    if (token) return token;
  }
  return null;
}
