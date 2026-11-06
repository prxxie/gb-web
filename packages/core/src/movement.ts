import type { Mobile, PlayerState } from "./types.js";
import { clamp } from "./tuning.js";
import { MAP_BOUNDS } from "./data/maps.js";
import { groundY, heightAt, isUnderGround, slopeAt, type Terrain } from "./terrain.js";

/**
 * Movement is a turn action paid in **energy** and in **queue delay** (`tunables.md` § 4.4):
 *
 * ```
 * walk: distance = moveDistance                       energy −= moveEnergy        delay += moveDelay
 * run:  distance = moveDistance × runMultiplier        energy −= moveEnergy × 2    delay += moveDelay
 * ```
 *
 * Guards: per-turn move budget, enough energy, climbable slope, inside the map. Energy never
 * regenerates, so a mobile that spends it early becomes a fixed turret.
 */
export type MoveRejection =
  | "no-moves-left"
  | "not-enough-energy"
  | "too-steep"
  | "out-of-map"
  | "eliminated"
  /** Fully inside the ground: it can still fire, but it has no ground to walk on (`US-CORE-006` AC5). */
  | "buried";

export interface MoveOutcome {
  readonly ok: boolean;
  readonly reason?: MoveRejection;
  readonly player?: PlayerState;
  readonly distance?: number;
}

export function moveCost(mobile: Mobile, run: boolean): number {
  return run ? mobile.moveEnergy * 2 : mobile.moveEnergy;
}

export function moveDistance(mobile: Mobile, run: boolean): number {
  return Math.round(run ? mobile.moveDistance * mobile.runMultiplier : mobile.moveDistance);
}

export function tryMove(
  player: PlayerState,
  mobile: Mobile,
  terrain: Terrain,
  direction: -1 | 1,
  run: boolean,
  movesThisTurn: number,
): MoveOutcome {
  if (player.eliminated) return { ok: false, reason: "eliminated" };
  if (isUnderGround(terrain, player.x, player.y)) return { ok: false, reason: "buried" };
  if (movesThisTurn >= mobile.maxMovesPerTurn) return { ok: false, reason: "no-moves-left" };
  const cost = moveCost(mobile, run);
  if (player.energy < cost) return { ok: false, reason: "not-enough-energy" };
  const targetX = clamp(player.x + direction * moveDistance(mobile, run), 8, MAP_BOUNDS.width - 8);
  if (targetX === player.x) return { ok: false, reason: "out-of-map" };
  // The whole path, not the destination: sampling only where it lands lets a unit walk straight over a
  // cliff, because the far side of a wall can be flat again (`US-CORE-008` AC3). Only *climbing* is
  // limited — a unit may always walk down into a crater, which is what makes a fresh hole usable cover.
  const stride = terrain.step * Math.sign(targetX - player.x);
  for (let x = player.x; Math.abs(x - targetX) >= terrain.step; x += stride) {
    const climbing = heightAt(terrain, x + stride) < heightAt(terrain, x);
    if (climbing && Math.abs(slopeAt(terrain, x)) > mobile.maxIncline) return { ok: false, reason: "too-steep" };
  }
  if (Math.abs(slopeAt(terrain, targetX)) > mobile.maxIncline && heightAt(terrain, targetX) < heightAt(terrain, player.x)) {
    return { ok: false, reason: "too-steep" };
  }
  return {
    ok: true,
    distance: Math.abs(targetX - player.x),
    player: {
      ...player,
      x: targetX,
      y: groundY(terrain, targetX) - 8,
      energy: player.energy - cost,
      delay: player.delay + mobile.moveDelay,
    },
  };
}

/** Teleport items ignore incline and energy, but still respect the map (`items.md`). */
export function teleportTo(player: PlayerState, terrain: Terrain, targetX: number): PlayerState {
  const x = clamp(targetX, 8, MAP_BOUNDS.width - 8);
  return { ...player, x, y: groundY(terrain, x) - 8 };
}

/**
 * How many steps a held button produced (`US-MATCH-006`).
 *
 * The first step happens on press, so a hold of `heldMs` yields `1 + floor(heldMs / 1000 * rate)`
 * steps clamped to `cap`.
 */
export function stepHold(heldMs: number, ratePerSecond: number, cap: number): number {
  if (heldMs < 0 || ratePerSecond <= 0 || cap <= 0) return 0;
  return Math.min(cap, 1 + Math.floor((heldMs / 1000) * ratePerSecond));
}
