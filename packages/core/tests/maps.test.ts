import { describe, expect, it } from "vitest";
import { createMatch, terrainOf, type Seat } from "../src/match.js";
import { DEFAULT_MAP_ID, MAPS, MAP_BOUNDS, getMap } from "../src/data/maps.js";
import { applyGimmicks, GIMMICK_IDS } from "../src/gimmicks.js";
import { createTerrain, deserializeTerrain, heightAt, serializeTerrain } from "../src/terrain.js";
import { TUNABLES } from "../src/tuning.js";

const NOW = 1_700_000_000_000;
const MAP_IDS = [
  "map-01",
  "map-02",
  "map-03",
  "map-04",
  "map-05",
  "map-06",
  "map-07",
  "map-08",
  "map-09",
  "map-10",
  "map-11",
] as const;

function seat(slot: number, team: "A" | "B"): Seat {
  return { slot, team, accountId: `acc-${slot}`, displayName: `P${slot}`, mobileId: "mbl-01", loadout: {} };
}

function match(mapId: string, seed = 7) {
  return createMatch({
    matchId: "match-1",
    roomCode: "ABC234",
    seed,
    mode: "jewel",
    mapId,
    seats: [seat(0, "A"), seat(1, "B")],
    now: NOW,
  });
}

describe("maps", () => {
  it("TC-CORE-920: the eleven documented maps load with unique seeds and the documented bounds", () => {
    expect(MAPS).toHaveLength(11);
    expect(MAPS.map((map) => map.mapId)).toEqual([...MAP_IDS]);
    expect(DEFAULT_MAP_ID).toBe("map-01");
    expect(MAP_BOUNDS).toEqual({ width: 2000, height: 1200 });
    expect(TUNABLES.mapWidth).toBe(MAP_BOUNDS.width);
    expect(TUNABLES.mapHeight).toBe(MAP_BOUNDS.height);
    expect(new Set(MAPS.map((map) => map.name)).size).toBe(11);
    expect(new Set(MAPS.map((map) => map.seed)).size).toBe(11);
    for (const map of MAPS) {
      expect(Number.isInteger(map.seed)).toBe(true);
      expect(map.gravityModifier).toBeGreaterThanOrEqual(0.95);
      expect(map.gravityModifier).toBeLessThanOrEqual(1.05);
      expect(getMap(map.mapId)).toBe(map);
    }
    expect(() => getMap("map-12")).toThrow(RangeError);
  });

  it("TC-CORE-920: every map validates its spawns on ground for up to eight slots", () => {
    for (const map of MAPS) {
      expect(map.spawns).toHaveLength(8);
      const terrain = createTerrain(map.mapId);
      map.spawns.forEach((spawn, index) => {
        expect(spawn, `${map.mapId} spawn ${index} present`).not.toBeNull();
        if (!spawn) return;
        const [x, y] = spawn;
        const ground = heightAt(terrain, x);
        expect(x, `${map.mapId} spawn ${index} x`).toBeGreaterThanOrEqual(0);
        expect(x, `${map.mapId} spawn ${index} x`).toBeLessThanOrEqual(MAP_BOUNDS.width);
        expect(y, `${map.mapId} spawn ${index} above ground`).toBeLessThanOrEqual(ground + 0.5);
        expect(y, `${map.mapId} spawn ${index} near ground`).toBeGreaterThanOrEqual(ground - 40);
        if (index < 4) expect(x, `${map.mapId} team A half`).toBeLessThan(MAP_BOUNDS.width / 2);
        else expect(x, `${map.mapId} team B half`).toBeGreaterThan(MAP_BOUNDS.width / 2);
      });
    }
  });

  it("TC-CORE-920: every map places its three jewels above the ground inside the bounds", () => {
    for (const map of MAPS) {
      expect(map.jewels, `${map.mapId} jewel count`).toHaveLength(3);
      const terrain = createTerrain(map.mapId);
      for (const [x, y] of map.jewels) {
        const ground = heightAt(terrain, x);
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(MAP_BOUNDS.width);
        expect(y).toBeLessThanOrEqual(ground);
        expect(y).toBeGreaterThanOrEqual(ground - 60);
      }
    }
  });

  it("TC-CORE-920: terrain RLE expands to the generated mask and rejects corrupt data", () => {
    for (const map of MAPS) {
      const terrain = createTerrain(map.mapId);
      const expanded = deserializeTerrain(map.mapId, serializeTerrain(terrain));
      expect(Array.from(expanded.heights), `${map.mapId} RLE round-trip`).toEqual(Array.from(terrain.heights));
      expect(() => deserializeTerrain(map.mapId, "820x0"), `${map.mapId} corrupt run`).toThrow(/corrupt terrain RLE/);
    }
    expect(() => deserializeTerrain("map-01", "820x1")).toThrow(/terrain length mismatch/);
  });

  it("TC-CORE-920: each map record carries windRange, authored terrain and a localised name", () => {
    const missingWind = MAPS.filter((map) => !("windRange" in map)).map((map) => map.mapId);
    const missingTerrain = MAPS.filter((map) => !("terrain" in map)).map((map) => map.mapId);
    const localised = MAPS.filter((map) => typeof map.name === "object").map((map) => map.mapId);
    expect.soft(missingWind, "maps without windRange").toEqual([]);
    expect.soft(missingTerrain, "maps without terrain").toEqual([]);
    expect.soft(localised, "maps with a {vi,en} name").toEqual([...MAP_IDS]);
  });

  it("TC-CORE-918: each map lists active gimmicks drawn from the documented set", () => {
    const known = new Set<string>(GIMMICK_IDS);
    for (const map of MAPS) {
      expect(map.gimmicks.length, `${map.mapId} gimmick count`).toBeLessThanOrEqual(2);
      for (const gimmick of map.gimmicks) {
        expect(known.has(gimmick), `${map.mapId} gimmick ${gimmick}`).toBe(true);
      }
    }
    const used = new Set(MAPS.flatMap((map) => map.gimmicks));
    expect([...used].sort()).toEqual([...GIMMICK_IDS].sort());
    expect(getMap("map-01").gimmicks).toEqual([]);
  });

  it("TC-CORE-040: the same map and seed reproduce terrain, wind and gimmick events", () => {
    for (const mapId of ["map-06", "map-11"] as const) {
      const first = match(mapId);
      const second = match(mapId);
      expect(Array.from(first.terrain), `${mapId} terrain`).toEqual(Array.from(second.terrain));
      expect(first.weather, `${mapId} weather`).toEqual(second.weather);
      for (const round of [2, 3]) {
        const map = getMap(mapId);
        const a = applyGimmicks(first, round, map);
        const b = applyGimmicks(second, round, map);
        expect(a.weather, `${mapId} round ${round} weather`).toEqual(b.weather);
        expect(a.events, `${mapId} round ${round} events`).toEqual(b.events);
      }
    }
  });
});

describe("TC-CORE-957: a map's gimmicks are active in the match and listed for the lobby (US-CORE-012 AC3)", () => {
  it("runs the listed gimmick and exposes the same list on the map record", () => {
    const map = getMap("map-05");
    // The lobby reads `map.gimmicks`; the match applies exactly that list (no hidden gimmick).
    expect(map.gimmicks).toContain("wind");
    const state = match("map-05");
    const after = applyGimmicks(state, 2, map);
    expect(after.weather ?? state.weather).not.toEqual(state.weather);
    for (const gimmick of map.gimmicks) expect(GIMMICK_IDS).toContain(gimmick);
  });
});

describe("TC-CORE-958: the same map and seed replay identically (US-CORE-012 AC6)", () => {
  it("rebuilds the terrain, the opening wind and the gimmick schedule", () => {
    const first = match("map-06");
    const second = match("map-06");
    expect(serializeTerrain(terrainOf(second))).toBe(serializeTerrain(terrainOf(first)));
    expect(second.weather).toEqual(first.weather);
    // The gimmick schedule is a function of the map and the round, so the fourth round matches too.
    const laterSecond = applyGimmicks(second, 4, getMap("map-06"));
    const laterFirst = applyGimmicks(first, 4, getMap("map-06"));
    expect(laterSecond.events).toEqual(laterFirst.events);
    expect(laterSecond.weather).toEqual(laterFirst.weather);
  });
});
