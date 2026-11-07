/**
 * Frame-level counters the support check reads (`US-NET-004` AC4).
 *
 * A peer already refuses a snapshot from a host that lost the election — `resyncFromSnapshot` keeps the higher
 * `hostGeneration` — but a refusal nobody can see turns "the battlefield flickers" into an unfalsifiable report. The
 * counter is deliberately tiny and synchronous: it is read from the console during a manual check and asserted in
 * `apps/web/tests/diagnostics.test.tsx`.
 */

export interface RejectionCounts {
  /** Snapshots dropped because their `hostGeneration` was already superseded. */
  readonly snapshot: number;
}

let snapshots = 0;

/** One more snapshot refused; called by the screen when the resync answer is `applied: false`. */
export function countRejectedSnapshot(): void {
  snapshots += 1;
}

/** A copy, so a caller cannot write through it. */
export function rejectionCounts(): RejectionCounts {
  return { snapshot: snapshots };
}

/** Back to zero — a manual check starts from a known number. */
export function resetRejections(): void {
  snapshots = 0;
}
