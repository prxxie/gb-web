/**
 * The turn clock as a whole number of seconds (`US-MATCH-003` AC2).
 *
 * Counts down from `turn.deadlineAt` and never reads above `turnDurationMs`, because a host whose clock drifts
 * forward would otherwise print `24s` on a 20 s turn.
 */

/** Seconds left in the turn, floored at 0 and capped at the turn duration. */
export function clockSeconds(deadlineAt: number, now: number, durationMs: number): number {
  if (!Number.isFinite(deadlineAt) || !Number.isFinite(now)) return 0;
  const cap = Math.max(0, Math.ceil(durationMs / 1000));
  const left = Math.ceil((deadlineAt - now) / 1000);
  return Math.max(0, Math.min(cap, left));
}
