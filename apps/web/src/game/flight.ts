/**
 * How long a resolved shot stays on screen, and who has to wait for it (`US-MATCH-012`).
 *
 * The engine resolves a shot **instantly**: `applyInput` returns the whole flight — path, landing, damage — in the same
 * tick, so the turn has already passed while the shell is still in the air. The renderer animates it for the engine's own
 * `flightMs`, which means a client that reads the turn state as "it is your turn now" fires its next shot into a sky that
 * still holds the previous one: two shells flying at once, which is not a turn-based game.
 *
 * These helpers are the hand-over. They live here, apart from Phaser and apart from React, so both the scene and the
 * match hooks can agree on one number and a pure test can pin it.
 */
import type { MatchEvent } from "@gbw/core";

/** The longest flight the renderer will animate. A shell that resolved slower than this on the wire is cut here. */
export const MAX_FLIGHT_MS = 6_000;
/** The shortest flight worth animating: a point-blank shot still has to read as a shot. */
export const MIN_FLIGHT_MS = 220;
/** How long the impact flash and its scorch mark stay on screen after the shell lands. */
export const IMPACT_MS = 420;

/** The engine's `flightMs`, held inside the window the renderer can afford. */
export function clampFlightMs(flightMs: number | undefined): number {
  return Math.max(MIN_FLIGHT_MS, Math.min(MAX_FLIGHT_MS, flightMs || 700));
}

/**
 * When the last shell launched by `events` has finished on screen, in the same clock as `now`, or `0` when the step
 * launched nothing. The settle window is included: a shot is over when its explosion is over, not when the path ends.
 */
export function shotLockUntil(events: readonly MatchEvent[], now: number): number {
  let until = 0;
  for (const event of events) {
    if (event.kind !== "shot") continue;
    until = Math.max(until, now + clampFlightMs(event.flightMs) + IMPACT_MS);
  }
  return until;
}

/** How much longer the screen is busy with a shot that has already resolved. */
export function remainingFlightMs(lockedUntil: number, now: number): number {
  return Math.max(0, lockedUntil - now);
}

/**
 * How long a seat waits before it may shoot: the rest of the shell already in the air **plus** its own thinking time.
 *
 * Adding rather than taking the larger of the two is deliberate. A seat that spent the flight thinking would fire the
 * instant the shell landed, so the two shots would still read as one continuous exchange and a viewer would see the next
 * shell appear out of a sky that had only just cleared. Waiting out the flight and *then* thinking is what makes a turn
 * read as a turn. The wait is never negative, so a caller can hand it straight to `setTimeout`.
 */
export function shotWaitMs(thinkingMs: number, lockedUntil: number, now: number): number {
  return remainingFlightMs(lockedUntil, now) + Math.max(0, thinkingMs);
}
