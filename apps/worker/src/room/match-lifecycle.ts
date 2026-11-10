/**
 * Start to result: the `match_started` frame with its assignments, and the pieces a `match_end` is recorded
 * from (`US-ROOM-003`, `US-RANK-001`).
 *
 * The id and the timestamps come from the object, never from the client, so the host cannot backdate a match
 * or record one twice.
 */
import {
  RULESET_VERSION,
  canStart,
  type ErrorCode,
  type MatchEndFrame,
  type MatchStat,
  type RoomState,
  type RoomStatus,
  type Team,
} from "@gbw/core";
import { withActivity } from "./presence.js";
import type { RecordedMatch } from "./protocol.js";
import { publicRoom } from "./wire.js";

/** Core refusal → the code the client branches on (`docs/02-reference/api/README.md`). */
export const START_REJECTIONS: Record<NonNullable<ReturnType<typeof canStart>>, ErrorCode> = {
  "not-host": "not-host",
  "not-lobby": "invalid-state",
  "not-full": "room-not-full",
  "not-enough-players": "not-enough-players",
  "teams-unbalanced": "teams-not-balanced",
};

export type StartOutcome =
  | {
      readonly ok: true;
      readonly room: RoomState;
      /** When `match_started` was sent; the match id and duration come from it, not from the client. */
      readonly startedAt: number;
      readonly seed: number;
    }
  | { readonly ok: false; readonly code: ErrorCode; readonly detail: string };

/** The seed the match runs on: the object mints it (`match_started`). */
function matchSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}

/** `start_match`'s guards are core's (`canStart`), so a lobby rule has one home. */
export function startRoom(room: RoomState, playerId: string): StartOutcome {
  const rejection = canStart(room, playerId);
  if (rejection) {
    return { ok: false, code: START_REJECTIONS[rejection], detail: "the room is not ready to start" };
  }
  return {
    ok: true,
    room: withActivity({ ...room, status: "playing" }),
    startedAt: Date.now(),
    seed: matchSeed(),
  };
}

/** `match_started`: who plays which slot, under which ruleset — stamped by the deployed build (`US-ROOM-003` AC4). */
export function matchStarted(room: RoomState, startedAt: number, seed: number) {
  return {
    t: "match_started",
    startedAt,
    seed,
    hostPlayerId: room.hostPlayerId,
    hostGeneration: room.hostGeneration,
    rulesetVersion: RULESET_VERSION,
    assignments: room.members.map((member) => ({
      playerId: member.playerId,
      slot: member.slot,
      team: member.team,
      mobileId: member.mobileId,
      accountId: member.accountId,
      loadout: member.loadout ?? [],
    })),
    room: publicRoom(room),
  };
}

/** The record's id: half its idempotency key, rebuilt from `match_started.startedAt` (`US-RANK-005` AC6). */
export function matchIdOf(roomCode: string, startedAt: number): string {
  return `${roomCode}-${startedAt}`;
}

/** The seats a record is written from: the roster says the team and the account, the host says the numbers. */
export function matchPlayers(room: RoomState, stats: readonly MatchStat[]) {
  return stats.map((stat) => {
    const member = room.members.find((candidate) => candidate.slot === stat.slot);
    return {
      slot: stat.slot,
      team: member?.team ?? ("A" as const),
      accountId: member?.accountId ?? null,
      damageDealt: stat.damageDealt,
      shotsFired: stat.shotsFired,
      hits: stat.hits,
    };
  });
}

/** The frame a forfeit is recorded from: the numbers are zeros, nobody was there to report them (`US-ROOM-004` AC6). */
export function abandonedEnd(room: RoomState, winnerTeam: Team): MatchEndFrame {
  return {
    t: "match_end",
    winnerTeam,
    stats: room.members.map((member) => ({
      slot: member.slot,
      damageDealt: 0,
      shotsFired: 0,
      hits: 0,
    })),
  };
}

export function withStatus(room: RoomState, status: RoomStatus): RoomState {
  return { ...room, status };
}

/** What a `match_end` frame decides, before the subrequest is made. */
export type EndPlan =
  | { readonly kind: "refuse"; readonly code: ErrorCode; readonly detail: string }
  /** An `ended` room answering a retry from the copy this object already wrote (`signaling.md` § 2). */
  | { readonly kind: "replay" }
  | { readonly kind: "record"; readonly room: RoomState; readonly endedAt: number };

/**
 * `match_end`'s guards. An `ended` room answers a retry with the stored result instead of `invalid-state`: the
 * host may have lost the broadcast to a network blip, and `documented recovery` is a retry.
 */
export function planEnd(room: RoomState, playerId: string | null, recorded: RecordedMatch | null): EndPlan {
  if (playerId !== room.hostPlayerId) {
    return { kind: "refuse", code: "not-host", detail: "only the host ends the match" };
  }
  if (room.status === "ended") {
    return recorded
      ? { kind: "replay" }
      : { kind: "refuse", code: "invalid-state", detail: "the match was already ended and not yet recorded" };
  }
  if (room.status !== "playing") {
    return { kind: "refuse", code: "invalid-state", detail: "the room is not playing" };
  }
  return { kind: "record", room: withActivity({ ...room, status: "ended" }), endedAt: Date.now() };
}
