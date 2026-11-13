/**
 * Taking over a match after a host migration (`US-NET-003`).
 *
 * The Durable Object elects a new host, bumps `hostGeneration` and puts the snapshot it kept into `host_changed`
 * (`docs/02-reference/api/signaling.md` § 4). The promoted client must start from that snapshot — not from the plan it
 * was handed in the lobby, and not from the last frame it happened to receive — or the room keeps the dead host's
 * numbers until somebody fires.
 *
 * The module is pure: the page decides *when* to adopt, this decides *what* the adoption is (`NFR-22`).
 */
import { assertCurrentRuleset, isCurrentRuleset, restoreFromSnapshot, type MatchState, type Snapshot } from "@gbw/core";

/** The parts of `host_changed` the adoption reads. */
export interface HostChanged {
  readonly hostPlayerId: string;
  /** The generation the DO already bumped; the client never invents one. */
  readonly hostGeneration: number;
  /** `null` when the room dropped before the first publish (`AC3`). */
  readonly lastSnapshot: Snapshot | null;
}

export interface Adoption {
  /** The state the promoted client now runs, or `null` when it had nothing to adopt. */
  readonly state: MatchState | null;
  /** The generation every publish from now on must carry. */
  readonly hostGeneration: number;
  /** The `seq` the next publish carries — one past the adopted snapshot, so peers accept it. */
  readonly seq: number;
  /** Whether the snapshot was adopted, or the room restarted its numbering. */
  readonly adopted: boolean;
  /** Why a snapshot was refused and the room restarted instead (`US-BAL-004` AC5), else `null`. */
  readonly refusedReason?: string | null;
}

/** A room that dropped before its first publish restarts here (`AC3`). */
export const FRESH_SEQ = 1;

/**
 * Adopt the previous host's snapshot.
 *
 * Two rules make the peers accept the result. The generation comes from the message, never from the local count. The
 * first publish carries `snapshot.seq + 1`, because `acceptSnapshot` refuses anything that is not strictly newer than
 * what the peer already applied — publishing the adopted `seq` itself would be dropped by every peer that was in sync.
 */
export function adoptHostChanged(prev: MatchState | null, message: HostChanged): Adoption {
  const hostGeneration = message.hostGeneration;
  if (prev === null) return { state: null, hostGeneration, seq: FRESH_SEQ, adopted: false };

  if (message.lastSnapshot === null) {
    return { state: { ...prev, seq: FRESH_SEQ }, hostGeneration, seq: FRESH_SEQ, adopted: false };
  }

  // A snapshot from another ruleset cannot be adopted — the old constants would move every shot (`AC5`). Refuse it
  // with a readable reason and restart the numbering, exactly like a room that dropped before its first publish.
  if (!isCurrentRuleset(message.lastSnapshot)) {
    let refusedReason = "ruleset-mismatch";
    try {
      assertCurrentRuleset(message.lastSnapshot);
    } catch (error) {
      refusedReason = error instanceof Error ? error.message : refusedReason;
    }
    return { state: { ...prev, seq: FRESH_SEQ }, hostGeneration, seq: FRESH_SEQ, adopted: false, refusedReason };
  }

  const adopted = restoreFromSnapshot(prev, message.lastSnapshot);
  const seq = message.lastSnapshot.seq + 1;
  return { state: { ...adopted, seq }, hostGeneration, seq, adopted: true };
}
