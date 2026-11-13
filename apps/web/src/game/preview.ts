/**
 * The aim aid: the flight the shot will actually take (`US-MATCH-005` AC2).
 *
 * Nothing here re-derives physics. The angle comes from the same helper the `fire` input uses (`shotAngle`), the
 * force from `forceFromPower`, and the flight from `previewShot` in `@gbw/core` — the exporter of the resolver's
 * own `flightPath`, so bounces, `piercing`, `itm-bunge`, off-map returns, the pad nudge, the item effects and the
 * mobile's angle window are all resolved by the code that will resolve the shot. This module only samples that
 * path into the few dots the scene draws.
 */
import { TUNABLES, getMobile, previewShot } from "@gbw/core";
import type { MatchState, Vec2 } from "@gbw/core";
import { forceFromPower, shotAngle } from "./aim";

export interface AimPreview {
  /** The slot that will really fire — `itm-dual` can override the picked one (`US-CORE-009` AC2). */
  readonly weaponSlot: 0 | 1 | 2;
  readonly angle: number;
  readonly force: number;
  /** The sampled flight, muzzle first; the last dot is the impact when there is one. */
  readonly path: readonly Vec2[];
  /** The same shot with the wind removed, for the baseline arc (`US-BAL-003` AC2). */
  readonly baseline: readonly Vec2[];
  /** The blast centre, `null` when the shot leaves the map. */
  readonly impact: Vec2 | null;
  /** The weapon's blast radius — the ring drawn at the landing point. */
  readonly radius: number;
}

/**
 * Dots per flight (`US-BAL-003` AC3). Ten equal **time** steps, not equal distance: the resolver samples its path at a
 * fixed `stepMs`, so equal index spacing *is* equal time — and a time tick is what a player can count against the wind.
 */
export const PREVIEW_STEPS = TUNABLES.previewSteps;

export interface AimPreviewInput {
  readonly state: MatchState;
  readonly localSlot: number;
  readonly weaponSlot: 0 | 1 | 2;
  readonly angle: number;
  readonly power: number;
  /** The pad's nudge, added exactly as `fireFromPull` adds it (`US-MATCH-006`). */
  readonly aimDelta?: number | undefined;
}

/**
 * Stride the resolver's path into `steps` equal time steps.
 *
 * The path is the resolver's own samples at a fixed `stepMs`, so index spacing is time spacing. The impact is appended
 * when the engine found one and the last tick did not already land on it — the ring has to sit where the shell stops.
 */
export function sampleByTime(path: readonly Vec2[], impact: Vec2 | null, steps: number): readonly Vec2[] {
  if (path.length === 0) return [];
  const lastIndex = path.length - 1;
  const dots: Vec2[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const index = Math.round((step / steps) * lastIndex);
    const point = path[index] as Vec2;
    const previous = dots[dots.length - 1];
    if (previous && previous.x === point.x && previous.y === point.y) continue;
    dots.push(point);
  }
  const last = path[lastIndex] as Vec2;
  if (impact && (last.x !== impact.x || last.y !== impact.y)) dots.push(impact);
  return dots;
}

/** The state with the wind taken out of it: only the wind is different, so the two arcs differ only by the wind. */
function withoutWind(state: MatchState): MatchState {
  return { ...state, weather: { ...state.weather, wind: { ...state.weather.wind, magnitude: 0 } } };
}

/** The same shot with the wind removed (`US-BAL-003` AC2) — the baseline an aid needs to teach what wind costs. */
export function baselineShot(
  state: MatchState,
  slot: number,
  weaponSlot: 0 | 1 | 2,
  angle: number,
  force: number,
): ReturnType<typeof previewShot> {
  return previewShot(withoutWind(state), slot, weaponSlot, angle, force);
}

export function aimPreview(input: AimPreviewInput): AimPreview | null {
  if (!Number.isFinite(input.angle) || !Number.isFinite(input.power)) return null;
  const player = input.state.players.find((candidate) => candidate.slot === input.localSlot);
  if (!player || player.eliminated || input.state.status !== "playing") return null;

  const angle = shotAngle(input.angle, input.aimDelta, getMobile(player.mobileId));
  const force = forceFromPower(input.power);
  const shot = previewShot(input.state, input.localSlot, input.weaponSlot, angle, force);
  if (!shot) return null;
  const baseline = baselineShot(input.state, input.localSlot, input.weaponSlot, angle, force);

  return {
    weaponSlot: shot.weaponSlot,
    angle: shot.angle,
    force: shot.force,
    path: sampleByTime(shot.path, shot.impact, PREVIEW_STEPS),
    baseline: baseline ? sampleByTime(baseline.path, null, PREVIEW_STEPS) : [],
    impact: shot.impact,
    radius: shot.radius,
  };
}
