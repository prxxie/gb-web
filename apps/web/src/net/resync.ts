/**
 * What a host snapshot does to the local state (`US-ROOM-004` AC2, AC5).
 *
 * One relay name carries two cases: the 10 Hz `snapshot_state` of a live match, and the replay a
 * returning or promoted client receives (`docs/02-reference/api/signaling.md` § 4). Both must land the
 * *same* numbers on screen as the host has — hp, turn and wind — or the two players argue about a hit
 * they are both looking at.
 */
import { restoreFromSnapshot, type MatchState, type Snapshot } from "@gbw/core";

export interface ResyncResult {
  readonly state: MatchState;
  /** `false` when the snapshot came from a superseded host and was dropped. */
  readonly applied: boolean;
  /** The highest `hostGeneration` seen so far; pass this back in on the next frame. */
  readonly hostGeneration: number;
}

/**
 * Fold one snapshot into the local state.
 *
 * A snapshot whose `hostGeneration` is below the current one is discarded: the peer that produced it was
 * replaced by an election, and its numbers are older than the ones on screen
 * (`docs/02-reference/api/signaling.md` § 4).
 */
export function resyncFromSnapshot(state: MatchState, snapshot: Snapshot, hostGeneration: number): ResyncResult {
  if (snapshot.hostGeneration < hostGeneration) return { state, applied: false, hostGeneration };
  // The same fold a promoted host performs (`restoreFromSnapshot`), so a peer and a new host cannot disagree
  // about what a snapshot means.
  return { state: restoreFromSnapshot(state, snapshot), applied: true, hostGeneration: snapshot.hostGeneration };
}
