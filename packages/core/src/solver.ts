/**
 * The practice solver — the reference engine's three closed-form answers (`US-BAL-007`).
 *
 * A player practising types a distance in phần, an angle and a height difference, and gets the bar that lands there; or
 * types a bar and gets the distance and the flight time. The arithmetic is `02-reference/gameplay/reference-gunbound.md`
 * § 10 with the wind term of `ballistics.ts`:
 *
 * ```
 * v0 = bar × BAR_VELOCITY,  vx = cos θ × v0,  vy = −sin θ × v0
 * x(t) = vx·t + ½·ax·t²,    y(t) = vy·t + ½·(g + ay)·t²
 * ```
 *
 * The shell lands when `y = deltaY`, so the flight time is the positive root of that quadratic — a closed form — and the
 * range follows by substitution. `barForDistance` inverts the same expression: while the shell is still falling
 * (`gravity + ay > 0`) the range is monotone in the bar, so a bisection on `0…4` finds the bar that lands there, printed
 * to a hundredth. `deltaY`, `gravity` and both wind components have to be finite: a half-typed field is a refusal, never
 * a `NaN` answer.
 *
 * The shot is always eastward (`facing = 1`, the practice screen's own convention); a caller that wants the mirrored
 * answer reflects `deltaY` and the wind itself, as `launch()` does.
 *
 * It is **flat ground**: no terrain, no bounce, no map gimmick, and the screen says so. It is also **not imported by the
 * match route** (AC4): the shot is the calculation the game is about.
 *
 * Every refusal is a code, not a sentence: the screen maps it to its own copy key, so `@gbw/core` carries no user-facing
 * string (`docs/01-overview/conventions.md`).
 */
import { BAR_VELOCITY, TUNABLES } from "./tuning";
import type { WindAcceleration } from "./ballistics";

/** What the question is asked about: one angle, one height difference, one machine's gravity and wind. */
export interface SolveContext {
  /** Degrees, `0…180` with `0` = east and `90` = straight up (the shot's own convention). */
  readonly angle: number;
  /** The target's height above the muzzle, in world units; negative below it. */
  readonly deltaY: number;
  /** The machine's `gravityFor(mobile)`, u/s². */
  readonly gravity: number;
  /** `windAcceleration(wind, windKFor(mobile))` — horizontal in play, vertical on a gimmick map. */
  readonly wind: WindAcceleration;
}

/** Why a question has no answer. The screen turns each into one sentence of copy. */
export type SolveReason = "angle" | "bar" | "distance" | "height" | "unreachable" | "wind";

export type SolveResult =
  | {
      readonly ok: true;
      /** The bar that reaches the distance, `0…4`. */
      readonly bar: number;
      /** The distance, in phần (negative fires westward at an angle past 90°). */
      readonly parts: number;
      /** Flight time in seconds. */
      readonly flightSec: number;
    }
  | { readonly ok: false; readonly reason: SolveReason };

const fail = (reason: SolveReason): SolveResult => ({ ok: false, reason });

/** `0 < angle < 180`: a zero angle fires flat forever and there is no shot behind 180°. */
function angleIsUsable(angle: number): boolean {
  return Number.isFinite(angle) && angle > 0 && angle < 180;
}

function barIsUsable(bar: number): boolean {
  return Number.isFinite(bar) && bar >= 0 && bar <= TUNABLES.powerBarMax;
}

/** A half-typed height or wind is not a question; `NaN` would otherwise flow straight into the answer. */
function contextIsMeasurable(context: SolveContext): boolean {
  return (
    Number.isFinite(context.deltaY) &&
    Number.isFinite(context.gravity) &&
    Number.isFinite(context.wind.ax) &&
    Number.isFinite(context.wind.ay)
  );
}

/**
 * One shot: the flight time to `deltaY` and the horizontal distance covered by then, or `null` when the shell can never
 * reach that height at this bar (`discriminant < 0` — the arc peaks below the target).
 */
function flightAt(bar: number, context: SolveContext): { parts: number; flightSec: number } | null {
  const radians = (context.angle * Math.PI) / 180;
  const speed = bar * BAR_VELOCITY;
  const vx = Math.cos(radians) * speed;
  const vy = -Math.sin(radians) * speed;
  const fall = context.gravity + context.wind.ay;
  if (!(fall > 0) || !Number.isFinite(fall)) return null;

  const discriminant = vy * vy + 2 * fall * context.deltaY;
  if (discriminant < 0) return null;

  const flightSec = (-vy + Math.sqrt(discriminant)) / fall;
  const parts = (vx * flightSec + 0.5 * context.wind.ax * flightSec * flightSec) / TUNABLES.partWidth;
  return { parts, flightSec };
}

/** The distance a bar reaches, and how long it takes. */
export function distanceForBar(bar: number, context: SolveContext): SolveResult {
  if (!angleIsUsable(context.angle)) return fail("angle");
  if (!contextIsMeasurable(context)) return fail("height");
  if (!barIsUsable(bar)) return fail("bar");
  const flown = flightAt(bar, context);
  if (!flown) return fail("unreachable");
  return { ok: true, bar, parts: flown.parts, flightSec: flown.flightSec };
}

/** The flight time alone — the same root `distanceForBar` takes the distance from. */
export function timeForShot(bar: number, context: SolveContext): SolveResult {
  return distanceForBar(bar, context);
}

/**
 * The bar that lands `parts` away, at this angle and height difference.
 *
 * The range is monotone in the bar, so the answer is a bisection over `0…4`; the shell is then flown at the found bar
 * and the residual is checked, which is what turns "the search ran out of range" into a refusal instead of a wrong bar.
 */
export function barForDistance(parts: number, context: SolveContext): SolveResult {
  if (!angleIsUsable(context.angle)) return fail("angle");
  if (!contextIsMeasurable(context)) return fail("height");
  if (!Number.isFinite(parts) || parts <= 0) return fail("distance");

  const target = parts * TUNABLES.partWidth;
  const far = flightAt(TUNABLES.powerBarMax, context);
  if (!far) return fail("unreachable");
  if (!(far.parts * TUNABLES.partWidth >= target)) {
    // A westward shot is short because the wind beat it, not because the angle is wrong; say which.
    const calm = flightAt(TUNABLES.powerBarMax, { ...context, wind: { ...context.wind, ax: 0 } });
    return fail(context.wind.ax < 0 && calm && calm.parts * TUNABLES.partWidth >= target ? "wind" : "unreachable");
  }

  let lo = 0;
  let hi: number = TUNABLES.powerBarMax;
  for (let step = 0; step < 60; step += 1) {
    const mid = (lo + hi) / 2;
    const flown = flightAt(mid, context);
    // `null` here means the arc at this bar still peaks below the target — the bar is too weak, not the shot hopeless:
    // the bar-4 flight above already cleared it. Treat it as "short" and keep bisecting.
    if (!flown) {
      lo = mid;
      continue;
    }
    if (flown.parts * TUNABLES.partWidth < target) lo = mid;
    else hi = mid;
  }

  const solved = flightAt((lo + hi) / 2, context);
  if (!solved) return fail("unreachable");
  // Within a tenth of a world unit — a hundredth of a phần, below the 0.01 bar the answer is printed to.
  if (Math.abs(solved.parts * TUNABLES.partWidth - target) > 0.1) return fail("unreachable");
  return { ok: true, bar: (lo + hi) / 2, parts, flightSec: solved.flightSec };
}
