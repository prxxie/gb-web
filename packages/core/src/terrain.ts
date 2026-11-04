import { MAP_PROFILES, MAP_BOUNDS, getMap } from "./data/maps.js";
import { TUNABLES, clamp } from "./tuning.js";

/**
 * Terrain is a height polyline (`y` grows downward, so a *larger* value is *lower* ground).
 *
 * It is generated deterministically from the map profile, so the host and every peer start from the
 * same ground without shipping a heightmap; carving is the only mutation and it travels as an event
 * (`US-CORE-006`).
 */
export interface Terrain {
  readonly step: number;
  readonly heights: Float64Array;
  readonly width: number;
}

const STEP = TUNABLES.terrainStep;

export function createTerrain(mapId: string): Terrain {
  const profile = MAP_PROFILES.get(mapId);
  if (!profile) throw new RangeError(`unknown map: ${mapId}`);
  const count = Math.floor(MAP_BOUNDS.width / STEP) + 1;
  const heights = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    const x = i * STEP;
    const t = x / MAP_BOUNDS.width;
    const wave =
      Math.sin(t * Math.PI * 2 * profile.frequency) * 0.6 +
      Math.sin(t * Math.PI * 5 * profile.frequency + 1.3) * 0.28 +
      Math.sin(t * Math.PI * 11 * profile.frequency + 2.7) * 0.12;
    heights[i] = Math.round(profile.base + wave * profile.amplitude);
  }
  return { step: STEP, heights, width: MAP_BOUNDS.width };
}

export function cloneTerrain(terrain: Terrain): Terrain {
  return { step: terrain.step, heights: Float64Array.from(terrain.heights), width: terrain.width };
}

/** Ground height at `x`, linearly interpolated between samples. */
export function heightAt(terrain: Terrain, x: number): number {
  const clamped = clamp(x, 0, terrain.width);
  const raw = clamped / terrain.step;
  const i = Math.floor(raw);
  const frac = raw - i;
  const h0 = terrain.heights[i] ?? terrain.heights[terrain.heights.length - 1] ?? 0;
  const h1 = terrain.heights[i + 1] ?? h0;
  return h0 + (h1 - h0) * frac;
}

/** Slope in degrees at `x`, positive when the ground rises to the right. */
export function slopeAt(terrain: Terrain, x: number): number {
  const dx = terrain.step * 4;
  const left = heightAt(terrain, x - dx);
  const right = heightAt(terrain, x + dx);
  return (Math.atan2(left - right, dx * 2) * 180) / Math.PI;
}

/** True when the point is inside the map and at or below the ground line. */
export function isUnderGround(terrain: Terrain, x: number, y: number): boolean {
  if (x < 0 || x > terrain.width) return false;
  return y >= heightAt(terrain, x);
}

/**
 * Carve a crater at `(x, y)` with the given radius (`terrainCarveRatio × blastRadius`).
 * Returns the changed span so the same call can be replayed from a replay or a snapshot.
 */
export function carve(terrain: Terrain, x: number, y: number, radius: number): { from: number; to: number } {
  const left = clamp(Math.floor((x - radius) / terrain.step), 0, terrain.heights.length - 1);
  const right = clamp(Math.ceil((x + radius) / terrain.step), 0, terrain.heights.length - 1);
  for (let i = left; i <= right; i += 1) {
    const dx = i * terrain.step - x;
    if (Math.abs(dx) > radius) continue;
    const depth = Math.sqrt(Math.max(0, radius * radius - dx * dx)) * 0.5;
    const current = terrain.heights[i] ?? 0;
    // Never dig below the impact point's own depth by more than the crater's bowl.
    terrain.heights[i] = Math.min(MAP_BOUNDS.height, Math.max(current, y + depth));
  }
  return { from: left, to: right };
}

/** Reground a unit standing on carved ground. */
export function groundY(terrain: Terrain, x: number): number {
  return heightAt(terrain, x);
}

/** Compact RLE over rounded heights, used for the Durable Object snapshot and the tests. */
export function serializeTerrain(terrain: Terrain): string {
  const parts: string[] = [];
  let previous = Math.round(terrain.heights[0] ?? 0);
  let run = 1;
  for (let i = 1; i < terrain.heights.length; i += 1) {
    const value = Math.round(terrain.heights[i] ?? 0);
    if (value === previous) {
      run += 1;
    } else {
      parts.push(`${previous}x${run}`);
      previous = value;
      run = 1;
    }
  }
  parts.push(`${previous}x${run}`);
  return parts.join(",");
}

export function deserializeTerrain(mapId: string, encoded: string): Terrain {
  const base = createTerrain(mapId);
  const heights: number[] = [];
  for (const part of encoded.split(",")) {
    const [valueRaw, runRaw] = part.split("x");
    const value = Number(valueRaw);
    const run = Number(runRaw);
    if (!Number.isFinite(value) || !Number.isFinite(run) || run <= 0) {
      throw new Error(`corrupt terrain RLE: ${part}`);
    }
    for (let i = 0; i < run; i += 1) heights.push(value);
  }
  if (heights.length !== base.heights.length) {
    throw new Error(`terrain length mismatch: ${heights.length} vs ${base.heights.length}`);
  }
  return { step: base.step, heights: Float64Array.from(heights), width: base.width };
}

export { getMap };
