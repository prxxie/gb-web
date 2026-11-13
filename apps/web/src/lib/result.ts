/**
 * What the result screen renders (`US-RANK-005`).
 *
 * The match screen writes this payload into `sessionStorage` when the match ends: the per-player statistics
 * it already has, plus the record the room answered with (`match_recorded`), which is the only place the
 * rating deltas exist. The screen never computes a rating itself — an absent record renders as `—`.
 */
import { resolveMobileId, type RankedReason } from "@gbw/core";
import type { WinCondition } from "./outcome";

export type MatchResult = "win" | "loss" | "abandon";

/** Why a match did not affect any rating (`US-RANK-001` AC6); defined once, on the wire. */
export type { RankedReason };

export interface ResultPlayer {
  readonly slot: number;
  readonly accountId: string | null;
  readonly displayName: string;
  readonly team: "A" | "B";
  readonly damageDealt: number;
  readonly shotsFired: number;
  readonly hits: number;
  readonly result: MatchResult;
}

export interface RatingChange {
  readonly accountId: string;
  readonly before: number;
  readonly after: number;
  readonly delta: number;
}

/** The room's answer, or the reason it never arrived (`failed`). */
export interface RecordedMatch {
  readonly matchId?: string;
  readonly ranked: boolean;
  readonly rankedReason: RankedReason | null;
  readonly ratings: readonly RatingChange[];
  /** The room's verdict per seat (`match_recorded.players`), the only authority on win/loss/abandon. */
  readonly results?: readonly { readonly slot: number; readonly result: MatchResult }[];
  /** Set when the room did not answer in time: the screen offers the host a retry (`AC6`). */
  readonly failed?: boolean;
  /**
   * Set when the server said the match *is* recorded (`409`) but its row could not be read back: the deltas
   * are unknown rather than missing, so the screen prints `—` and offers no retry that could only be refused.
   */
  readonly unresolved?: boolean;
}

export interface ResultPayload {
  readonly roomCode: string;
  readonly mode: string;
  readonly winnerTeam: "A" | "B" | null;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly rulesetVersion: string;
  /** Added with `US-CORE-010` AC6; a payload written before it simply omits the condition. */
  readonly winCondition?: WinCondition | undefined;
  readonly players: readonly ResultPlayer[];
  /** The seat this device played, which is what marks the viewer's row (`AC3`); a guest has no account id. */
  readonly localSlot?: number | undefined;
  /** What `Chơi lại` needs to rebuild the room (`AC4`); older payloads omit it. */
  readonly mapId: string;
  readonly maxPlayers: number;
  readonly mobileId: string;
  readonly kind: "bot" | "online";
  /** Only the host may resubmit a lost record (`matches.md` § POST /matches → `not-host`). */
  readonly isHost: boolean;
  readonly submission: RecordedMatch | null;
}

export const RESULT_KEY = "gbw.result";

/** Read the payload for `roomCode`; `null` when it is absent, unreadable, or belongs to another match. */
export function readResult(roomCode: string): ResultPayload | null {
  try {
    const raw = sessionStorage.getItem(RESULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ResultPayload>;
    if (parsed.roomCode !== roomCode) return null;
    return {
      roomCode: parsed.roomCode,
      mode: parsed.mode ?? "",
      winnerTeam: parsed.winnerTeam ?? null,
      startedAt: parsed.startedAt ?? 0,
      endedAt: parsed.endedAt ?? 0,
      rulesetVersion: parsed.rulesetVersion ?? "",
      winCondition: parsed.winCondition,
      players: parsed.players ?? [],
      localSlot: parsed.localSlot,
      mapId: parsed.mapId ?? "map-01",
      maxPlayers: parsed.maxPlayers ?? 2,
      mobileId: resolveMobileId(parsed.mobileId),
      kind: parsed.kind === "bot" ? "bot" : "online",
      isHost: parsed.isHost ?? false,
      submission: parsed.submission ?? null,
    };
  } catch {
    return null;
  }
}

export function writeResult(payload: ResultPayload): void {
  try {
    sessionStorage.setItem(RESULT_KEY, JSON.stringify(payload));
  } catch {
    /* nothing to do — the screen keeps the payload it already holds in state */
  }
}

/**
 * Why the match was not ranked, in the words the screen prints.
 *
 * The record's own `rankedReason` and nothing else (`signaling.md` § match_recorded): it is the only place
 * `ruleset_mismatch` can come from, since this client always runs `TUNABLES.rulesetVersion`, and a room
 * cannot tell a rated match from an unrated one when its write was lost. A `null` here means "nothing said
 * why", which the screen prints as silence rather than as an invented reason.
 */
export function rankedReasonOf(payload: ResultPayload): RankedReason | null {
  const recorded = payload.submission;
  if (!recorded || recorded.ranked) return null;
  return recorded.rankedReason;
}

/**
 * The row that belongs to this device: the seat the match screen recorded, or — for a payload written
 * before that field existed — the seat of the signed-in account. A guest has no account id, which is why
 * the seat is the primary answer (`AC3`).
 */
export function viewerOf(payload: ResultPayload, accountId: string | null): ResultPlayer | null {
  if (payload.localSlot !== undefined) return payload.players.find((player) => player.slot === payload.localSlot) ?? null;
  if (!accountId) return null;
  return payload.players.find((player) => player.accountId === accountId) ?? null;
}
