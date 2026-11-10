/**
 * The room's wire constants and the two records it keeps about a socket (`signaling.md` § 3, § 5).
 *
 * Values, not behaviour: the close codes the client branches on, the HTTP status each refusal would carry
 * on the REST side, and the metadata the object keys by socket.
 */
import type { ErrorCode, RankedReason } from "@gbw/core";
import type { FrameWindow } from "./rate-limit.js";

export const AUTH_TIMEOUT_MS = 5_000;
export const CLOSE_UNAUTHENTICATED = 4401;
export const CLOSE_ROOM_NOT_FOUND = 4404;
export const CLOSE_ROOM_FULL = 4409;
export const CLOSE_ROOM_CLOSED = 4410;
export const CLOSE_RATE_LIMITED = 4429;
/** How long a promoted host has to prove it is live before the next candidate is tried (`US-ROOM-005` AC3). */
export const HOST_MIGRATION_RECHECK_MS = 5_000;

/**
 * The status the same refusal would carry on the REST side, so a log line and a problem body agree.
 * `problem.ts` cannot answer this: the frame codes include `payload-too-large` and the roster codes,
 * which no REST route returns.
 */
export const FRAME_STATUS: Record<ErrorCode, number> = {
  "bad-request": 400,
  "unsupported-message": 422,
  "payload-too-large": 413,
  "rate-limited": 429,
  "not-host": 403,
  "invalid-state": 409,
  "room-not-full": 409,
  "not-enough-players": 422,
  "teams-not-balanced": 422,
  "peer-not-connected": 404,
  "snapshot-too-large": 413,
  internal: 500,
};

/** One socket's session: what the Worker verified, what it last said, and what it may still say this second. */
export interface SocketMeta {
  playerId: string | null;
  authed: boolean;
  /** Identity the Worker verified for this connection; the client cannot set these headers (`NFR-11`). */
  accountId: string | null;
  guestId: string | null;
  /** The session the socket authenticated with, kept in memory only, used to record the match as the host. */
  token: string | null;
  /** Last heartbeat received; three missed ones move the member to `grace` (`US-ROOM-002` AC6). */
  lastPingAt: number;
  /** Per-second frame counters, reset when the window rolls over (`signaling.md` § 5). */
  window: FrameWindow;
}

/** What `POST /api/v1/matches` answered, shaped for the `match_recorded` frame (`US-RANK-001`, `US-RANK-005`). */
export interface RecordedMatch {
  readonly matchId: string;
  readonly winnerTeam: "A" | "B" | null;
  readonly ranked: boolean;
  /** Straight from the record, so the result screen names the reason instead of guessing it. */
  readonly rankedReason: RankedReason | null;
  readonly ratings: readonly { accountId: string; before: number; after: number; delta: number }[];
  readonly players: readonly { slot: number; result: "win" | "loss" | "abandon" }[];
}

/** The record's reason, narrowed — an unknown string must never reach the wire as a copy key. */
export function reasonOf(value: string | null | undefined): RankedReason | null {
  return value === "guest" || value === "bot" || value === "abandoned" || value === "ruleset_mismatch"
    ? value
    : null;
}
