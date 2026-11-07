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
  /** The blast centre, `null` when the shot leaves the map. */
  readonly impact: Vec2 | null;
  /** The weapon's blast radius — the ring drawn at the landing point. */
  readonly radius: number;
}

/** How many dots the flight is sampled into — enough for a clean dotted line, few enough to draw cheaply. */
export const PATH_DOTS = TUNABLES.previewDots;

export interface AimPreviewInput {
  readonly state: MatchState;
  readonly localSlot: number;
  readonly weaponSlot: 0 | 1 | 2;
  readonly angle: number;
  readonly power: number;
  /** The pad's nudge, added exactly as `fireFromPull` adds it (`US-MATCH-006`). */
  readonly aimDelta?: number | undefined;
}

/** Stride the resolver's path down to `PATH_DOTS` points, ending on the impact when the engine found one. */
function sample(path: readonly Vec2[], impact: Vec2 | null): readonly Vec2[] {
  const every = Math.max(1, Math.ceil(path.length / PATH_DOTS));
  const dots: Vec2[] = [];
  for (let index = 0; index < path.length; index += every) dots.push(path[index] as Vec2);
  const last = path[path.length - 1] as Vec2;
  if (dots[dots.length - 1] !== last) dots.push(last);
  if (impact && (last.x !== impact.x || last.y !== impact.y)) dots.push(impact);
  return dots;
}

export function aimPreview(input: AimPreviewInput): AimPreview | null {
  if (!Number.isFinite(input.angle) || !Number.isFinite(input.power)) return null;
  const player = input.state.players.find((candidate) => candidate.slot === input.localSlot);
  if (!player || player.eliminated || input.state.status !== "playing") return null;

  const angle = shotAngle(input.angle, input.aimDelta, getMobile(player.mobileId));
  const shot = previewShot(input.state, input.localSlot, input.weaponSlot, angle, forceFromPower(input.power));
  if (!shot) return null;

  return {
    weaponSlot: shot.weaponSlot,
    angle: shot.angle,
    force: shot.force,
    path: sample(shot.path, shot.impact),
    impact: shot.impact,
    radius: shot.radius,
  };
}
