import type { Projectile, ShotClass, Vec2, Weapon, Wind } from "./types.js";
import { TUNABLES, roundTo } from "./tuning.js";
import { heightAt, isUnderGround, slopeAt } from "./terrain.js";

export interface WindAcceleration {
  readonly ax: number;
  readonly ay: number;
}

/**
 * Wind enters the integrator as an acceleration divided by the mobile's mass (`tunables.md` § 1.1):
 *
 * ```
 * ax =  windCoefficient × magnitude × cos θ / mass
 * ay = −windCoefficient × magnitude × sin θ / mass      // added to gravity
 * ```
 *
 * `θ = sector × 30`, `0°` = east. A wind blowing upwards therefore *reduces* effective gravity, which
 * is what makes a lobbed shot hang.
 */
export function windAcceleration(wind: Wind, mass: number, coefficient: number = TUNABLES.windCoefficient): WindAcceleration {
  if (mass <= 0) throw new RangeError("mass must be positive");
  const radians = (wind.directionDeg * Math.PI) / 180;
  return {
    ax: (coefficient * wind.magnitude * Math.cos(radians)) / mass,
    ay: (-coefficient * wind.magnitude * Math.sin(radians)) / mass,
  };
}

export interface LaunchOptions {
  readonly id: number;
  readonly ownerSlot: number;
  readonly weaponSlot: 0 | 1 | 2;
  readonly weapon: Weapon;
  readonly from: Vec2;
  readonly facing: -1 | 1;
  readonly angle: number;
  readonly force: number;
  /** `itm-blood` / `itm-power-up` / avatar attack, already resolved into one factor. */
  readonly powerMultiplier?: number;
  readonly bunge?: boolean;
  readonly ownerMass?: number;
}

const BOUNCE_LIMIT: Partial<Record<ShotClass, number>> = { bounce: 3 };

/** A shot leaves the muzzle: `v0 = force × speedK`, split into `vx`/`vy` by the aim angle. */
export function launch(options: LaunchOptions): Projectile {
  const radians = (options.angle * Math.PI) / 180;
  const v0 = options.force * TUNABLES.speedK;
  const power = Math.round(options.weapon.power * (options.powerMultiplier ?? 1));
  return {
    id: options.id,
    ownerSlot: options.ownerSlot,
    weaponSlot: options.weaponSlot,
    shotClass: options.weapon.shotClass,
    x: roundTo(options.from.x),
    y: roundTo(options.from.y),
    vx: roundTo(Math.cos(radians) * v0 * options.facing),
    vy: roundTo(-Math.sin(radians) * v0),
    ageMs: 0,
    bouncesLeft: BOUNCE_LIMIT[options.weapon.shotClass] ?? 0,
    power,
    radius: options.weapon.radius,
    piercing: options.weapon.shotClass === "piercing",
    parentId: null,
    bunge: options.bunge ?? false,
    homeX: roundTo(options.from.x),
    homeY: roundTo(options.from.y),
    returned: false,
    blooded: (options.powerMultiplier ?? 1) > 1,
  };
}

export interface StepContext {
  readonly wind: Wind;
  readonly gravity: number;
  readonly mass: number;
  readonly stepMs?: number;
  /** Constant sideways acceleration a `force` map adds, in units/s² (`TC-CORE-918`). */
  readonly forceX?: number;
}

/**
 * One fixed step. Returns a new projectile — the engine never mutates state in place, so a snapshot or a
 * replay can fork from any step.
 */
export function stepProjectile(projectile: Projectile, context: StepContext): Projectile {
  const dt = (context.stepMs ?? TUNABLES.stepMs) / 1000;
  const wind = windAcceleration(context.wind, context.mass);
  // A bunge shell turns around a third of a second into the flight and is pulled back to its muzzle, so it
  // lands on the side it was fired from (`itm-bunge`, US-CORE-009). The pull is a force, not a teleport, so
  // it still collides with anything in the way home.
  const turnHome = projectile.bunge && projectile.ageMs >= TUNABLES.bungeTurnMs;
  const pullX = turnHome ? Math.sign(projectile.homeX - projectile.x) * TUNABLES.bungePull : 0;
  const vx =
    (turnHome ? projectile.vx * 0.5 : projectile.vx) + pullX * dt + wind.ax * dt + (context.forceX ?? 0) * dt;
  const vy = (turnHome ? projectile.vy * 0.5 : projectile.vy) + (context.gravity + wind.ay) * dt;
  return {
    ...projectile,
    // Velocity is NOT rounded: `roundTo` is the 0.1 position quantum it takes to make a snapshot compact,
    // and quantising a velocity that grows by 0.3 per step throws away up to 20 % of the wind push (the
    // drift then stops being linear in `magnitude`, which `TC-CORE-023` promises). Positions keep the
    // quantum so host and peer agree byte for byte.
    vx,
    vy,
    x: roundTo(projectile.x + vx * dt),
    y: roundTo(projectile.y + vy * dt),
    ageMs: projectile.ageMs + (context.stepMs ?? TUNABLES.stepMs),
  };
}

export interface Impact {
  readonly x: number;
  readonly y: number;
  readonly normalSlope: number;
}

/**
 * Segment test against the terrain polyline. Sampling per terrain step keeps it exact enough for a
 * 50 ms step (a full-power shell moves at most 23 units per step) and cheap enough for a 20 Hz loop.
 */
export function segmentImpact(
  terrain: { step: number; heights: Float64Array; width: number },
  from: Vec2,
  to: Vec2,
): Impact | null {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const samples = Math.max(1, Math.ceil(distance / (terrain.step / 2)));
  for (let i = 1; i <= samples; i += 1) {
    const t = i / samples;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    if (x < 0 || x > terrain.width) continue;
    if (isUnderGround(terrain, x, y)) {
      return { x: roundTo(x), y: roundTo(y), normalSlope: slopeAt(terrain, x) };
    }
  }
  return null;
}

/**
 * Reflect a bouncing shell off the ground. The reflection is about the terrain normal, so a shell
 * landing on a slope skips sideways instead of straight up — the behaviour that makes `bounce`
 * mobiles feel different from `arc` mobiles.
 */
export function bounce(projectile: Projectile, impact: Impact): Projectile {
  const normal = (impact.normalSlope * Math.PI) / 180;
  const nx = Math.sin(normal);
  const ny = -Math.cos(normal);
  const dot = projectile.vx * nx + projectile.vy * ny;
  const vx = projectile.vx - 2 * dot * nx;
  const vy = projectile.vy - 2 * dot * ny;
  const restitution = TUNABLES.bounceRestitution;
  return {
    ...projectile,
    x: roundTo(impact.x),
    y: roundTo(impact.y - 1),
    vx: roundTo(vx * restitution),
    vy: roundTo(vy * restitution),
    bouncesLeft: Math.max(0, projectile.bouncesLeft - 1),
  };
}

/** `cluster` shells split into three at the apex, spread by a deterministic offset. */
export function splitCluster(projectile: Projectile, spread: readonly number[]): Projectile[] {
  return spread.map((offset, index) => ({
    ...projectile,
    id: projectile.id * 10 + index + 1,
    parentId: projectile.id,
    vx: roundTo(projectile.vx + offset),
    vy: roundTo(projectile.vy * 0.55),
    blooded: projectile.blooded,
  }));
}

export interface FlightResult {
  readonly impact: Impact | null;
  readonly landingX: number;
  readonly landingY: number;
  readonly flightMs: number;
  readonly steps: number;
  readonly offMap: boolean;
}

/**
 * Simulate a whole shot — used by the balance table (`data/mobiles.md` § 4), by the bot (`US-CORE-005`)
 * and by the unit tests that pin the calibration point. It never mutates the state it is given.
 */
export function simulateFlight(
  projectile: Projectile,
  context: StepContext,
  terrain: { step: number; heights: Float64Array; width: number },
  mapBounds: { width: number; height: number } = { width: TUNABLES.mapWidth, height: TUNABLES.mapHeight },
  options: { readonly returnOffMap?: boolean; readonly firstGroundImpact?: boolean } = {},
): FlightResult {
  let current = projectile;
  let steps = 0;
  while (current.ageMs < TUNABLES.maxFlightMs) {
    const previous = { x: current.x, y: current.y };
    current = stepProjectile(current, context);
    steps += 1;
    if (current.x < -mapBounds.width || current.x > mapBounds.width * 2 || current.y > mapBounds.height * 2) {
      // A `return` map sends the shell back once with reduced power before it despawns (`TC-CORE-913`).
      if (options.returnOffMap && !current.returned) {
        current = {
          ...current,
          returned: true,
          x: roundTo(Math.min(Math.max(current.x, 0), mapBounds.width)),
          vx: -current.vx * 0.6,
          vy: current.vy * 0.6,
        };
        continue;
      }
      return { impact: null, landingX: current.x, landingY: current.y, flightMs: current.ageMs, steps, offMap: true };
    }
    // A bunge shell that made it home explodes there instead of orbiting its muzzle forever (`itm-bunge`).
    if (
      current.bunge &&
      current.ageMs >= TUNABLES.bungeTurnMs &&
      Math.abs(current.x - current.homeX) <= 60 &&
      current.y >= heightAt(terrain, current.x) - 40
    ) {
      return {
        impact: { x: roundTo(current.x), y: roundTo(current.y), normalSlope: slopeAt(terrain, current.x) },
        landingX: current.x,
        landingY: current.y,
        flightMs: current.ageMs,
        steps,
        offMap: false,
      };
    }
    const hit = segmentImpact(terrain, previous, { x: current.x, y: current.y });
    if (hit) {
      // A `piercing` shell flies on and a `bounce` shell rebounds in play; the balance table wants the first
      // crossing, so it asks for it explicitly (`mobiles.md` § 4).
      if (options.firstGroundImpact) {
        return { impact: hit, landingX: hit.x, landingY: hit.y, flightMs: current.ageMs, steps, offMap: false };
      }
      if (current.piercing) continue;
      if (current.bouncesLeft > 0) {
        current = bounce(current, hit);
        continue;
      }
      return { impact: hit, landingX: hit.x, landingY: hit.y, flightMs: current.ageMs, steps, offMap: false };
    }
  }
  return { impact: null, landingX: current.x, landingY: current.y, flightMs: current.ageMs, steps, offMap: true };
}

/** Ground height at a launch point, used when a mobile is placed in the match. */
export function muzzleHeight(terrain: { step: number; heights: Float64Array; width: number }, x: number): number {
  return heightAt(terrain, x) - 8;
}
