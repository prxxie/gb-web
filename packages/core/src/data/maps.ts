import type { Gimmick, MapDef } from "../types.js";

/**
 * Eleven maps (`docs/02-reference/gameplay/tunables.md` § 6).
 *
 * `gravityModifier` is the per-map knob on top of each mobile's own gravity (`×0.95–1.05`), never a
 * replacement for it: a heavy mobile on a low-gravity map is still heavy.
 */
interface MapRow {
  readonly mapId: string;
  readonly name: string;
  readonly gravityModifier: number;
  readonly seed: number;
  readonly gimmicks: readonly Gimmick[];
  /** Terrain character: base height, amplitude and frequency multipliers. */
  readonly base: number;
  readonly amplitude: number;
  readonly frequency: number;
}

const ROWS: readonly MapRow[] = [
  { mapId: "map-01", name: "Megalith Plain", gravityModifier: 1.0, seed: 1101, gimmicks: [], base: 820, amplitude: 90, frequency: 1.0 },
  { mapId: "map-02", name: "Jade Terraces", gravityModifier: 1.05, seed: 1207, gimmicks: ["heal"], base: 780, amplitude: 150, frequency: 1.6 },
  { mapId: "map-03", name: "Frost Fjord", gravityModifier: 1.03, seed: 1309, gimmicks: ["gust"], base: 800, amplitude: 120, frequency: 1.2 },
  { mapId: "map-04", name: "Ember Caldera", gravityModifier: 0.97, seed: 1423, gimmicks: ["electric"], base: 840, amplitude: 160, frequency: 1.9 },
  { mapId: "map-05", name: "Cloud Bridge", gravityModifier: 0.95, seed: 1529, gimmicks: ["wind"], base: 760, amplitude: 110, frequency: 1.4 },
  { mapId: "map-06", name: "Sunken Ruins", gravityModifier: 1.04, seed: 1637, gimmicks: ["tornado"], base: 800, amplitude: 170, frequency: 2.1 },
  { mapId: "map-07", name: "Amber Dunes", gravityModifier: 1.04, seed: 1741, gimmicks: ["force"], base: 830, amplitude: 100, frequency: 0.9 },
  { mapId: "map-08", name: "Moonlit Grove", gravityModifier: 0.98, seed: 1847, gimmicks: ["fog"], base: 790, amplitude: 130, frequency: 1.5 },
  { mapId: "map-09", name: "Iron Quarry", gravityModifier: 1.02, seed: 1951, gimmicks: ["return"], base: 810, amplitude: 140, frequency: 1.8 },
  { mapId: "map-10", name: "Coral Shelf", gravityModifier: 1.01, seed: 2053, gimmicks: ["heal", "gust"], base: 800, amplitude: 105, frequency: 1.1 },
  { mapId: "map-11", name: "Storm Spire", gravityModifier: 0.99, seed: 2159, gimmicks: ["electric", "wind"], base: 770, amplitude: 155, frequency: 2.3 },
];

const WIDTH = 2000;
const HEIGHT = 1200;

/**
 * Four spawn points per side, spread along the map so a 4v4 does not start on one pixel.
 * Slots 0–3 are team A's spawns, slots 4–7 team B's.
 */
function spawnsFor(row: MapRow, side: "left" | "right"): readonly (readonly [number, number])[] {
  const xs = side === "left" ? [180, 300, 420, 540] : [WIDTH - 180, WIDTH - 300, WIDTH - 420, WIDTH - 540];
  return xs.map((x, index) => {
    const y = surfaceHeight(row, x) - 8 - index * 4;
    return [x, Math.round(y)] as const;
  });
}

/**
 * The same height function the terrain generator uses in `terrain.ts`, so spawns sit on the ground of
 * their own map instead of floating above a hill.
 */
export function surfaceHeight(row: { base: number; amplitude: number; frequency: number }, x: number): number {
  const t = x / WIDTH;
  const wave =
    Math.sin(t * Math.PI * 2 * row.frequency) * 0.6 +
    Math.sin(t * Math.PI * 5 * row.frequency + 1.3) * 0.28 +
    Math.sin(t * Math.PI * 11 * row.frequency + 2.7) * 0.12;
  return Math.round(row.base + wave * row.amplitude);
}

export interface MapProfile {
  readonly mapId: string;
  readonly base: number;
  readonly amplitude: number;
  readonly frequency: number;
}

/** Terrain generator input, kept separate from the published `MapDef`. */
export const MAP_PROFILES: ReadonlyMap<string, MapProfile> = new Map(
  ROWS.map((row) => [row.mapId, { mapId: row.mapId, base: row.base, amplitude: row.amplitude, frequency: row.frequency }]),
);

export const MAPS: readonly MapDef[] = ROWS.map((row) => ({
  mapId: row.mapId,
  name: row.name,
  gravityModifier: row.gravityModifier,
  seed: row.seed,
  gimmicks: row.gimmicks,
  spawns: [...spawnsFor(row, "left"), ...spawnsFor(row, "right")],
  jewels: [
    [1000, surfaceHeight(row, 1000) - 40],
    [640, surfaceHeight(row, 640) - 40],
    [1360, surfaceHeight(row, 1360) - 40],
  ],
}));

export const MAPS_BY_ID: ReadonlyMap<string, MapDef> = new Map(MAPS.map((map) => [map.mapId, map]));

export const DEFAULT_MAP_ID = "map-01";

export function getMap(mapId: string): MapDef {
  const map = MAPS_BY_ID.get(mapId);
  if (!map) throw new RangeError(`unknown map: ${mapId}`);
  return map;
}

export const MAP_BOUNDS = { width: WIDTH, height: HEIGHT } as const;
