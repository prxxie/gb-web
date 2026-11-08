/**
 * The one-finger state machine (`US-MATCH-002`, `US-MATCH-007`).
 *
 * A finger on the battlefield can mean two things and the game has to decide which before it acts: a **drag pans the
 * camera**, a **press held still arms the shot**. The rule that keeps them apart is time plus a movement slop — a press
 * that travels more than `HOLD_SLOP_PX` before `HOLD_MS` has passed was a pan, and a press that survives both is a shot.
 *
 * It lives here, as pure functions over an immutable state, because the previous version of this logic lived inside the
 * Phaser scene: no test could reach it, and the angle readout silently ignored the gesture for weeks. Every branch below
 * is exercised in `apps/web/tests/hold.test.ts`.
 */

export interface GesturePoint {
  readonly x: number;
  readonly y: number;
}

/** How long a press has to stay put before it becomes a shot. Short enough to feel immediate, long enough to separate
 * a deliberate aim from the start of a pan. */
export const HOLD_MS = 300;

/** Movement that turns a pending press into a pan. A finger never sits perfectly still; a thumb always moves. */
export const HOLD_SLOP_PX = 10;

export type HoldPhase = "idle" | "pending" | "panning" | "pulling";

export interface HoldState {
  readonly phase: HoldPhase;
  /** Where the press landed: the centre the pull is measured from. */
  readonly origin: GesturePoint | null;
  /** The last position seen, so a pan can be delivered as a delta. */
  readonly last: GesturePoint | null;
  readonly pressedAt: number;
  /** The furthest the finger has been from `origin`, which is what the slop is judged on. */
  readonly moved: number;
}

export const IDLE: HoldState = { phase: "idle", origin: null, last: null, pressedAt: 0, moved: 0 };

export interface PanDelta {
  readonly dx: number;
  readonly dy: number;
}

export function press(point: GesturePoint, at: number): HoldState {
  return { phase: "pending", origin: point, last: point, pressedAt: at, moved: 0 };
}

/**
 * Feed a move. Returns the state to keep and, when the press is a pan, how far the window should slide: the finger drags
 * the world, so the delta is the *negative* of the finger's own movement — dragging right shows what is to the left.
 */
export function drag(state: HoldState, point: GesturePoint): { state: HoldState; pan: PanDelta | null } {
  if (state.phase === "idle" || !state.origin || !state.last) return { state, pan: null };
  const travelled = Math.hypot(point.x - state.origin.x, point.y - state.origin.y);
  const moved = Math.max(state.moved, travelled);
  if (state.phase === "pulling") {
    // Once the shot is armed the finger is aiming, never panning: the camera holds still so the ring and the arc mean
    // what they say. A target off the screen is the player's problem to have measured before the press.
    return { state: { ...state, last: point, moved }, pan: null };
  }
  if (state.phase === "pending") {
    if (moved <= HOLD_SLOP_PX) return { state: { ...state, last: point, moved }, pan: null };
    // Past the slop before the hold fired: this was a pan, and the movement so far belongs to it.
    const pan = { dx: state.origin.x - point.x, dy: state.origin.y - point.y };
    return { state: { ...state, phase: "panning", last: point, moved }, pan };
  }
  const pan = { dx: state.last.x - point.x, dy: state.last.y - point.y };
  return { state: { ...state, last: point, moved }, pan };
}

/**
 * Tick the hold. Called every frame: a press that is still `pending` after `HOLD_MS` becomes a `pulling`, and `origin`
 * stays where the finger landed so the pull starts at zero power instead of jumping.
 */
export function advance(state: HoldState, at: number): HoldState {
  if (state.phase !== "pending") return state;
  return at - state.pressedAt >= HOLD_MS ? { ...state, phase: "pulling" } : state;
}

/** Did this press end as a shot? The caller fires on `true` and simply clears on `false`. */
export function liftsAsShot(state: HoldState): boolean {
  return state.phase === "pulling";
}

export function lift(): HoldState {
  return IDLE;
}
