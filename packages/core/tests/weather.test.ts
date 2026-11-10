import { describe, expect, it } from "vitest";
import { launch, simulateFlight, windAcceleration } from "../src/ballistics.js";
import { getMobile } from "../src/data/mobiles.js";
import { applyInput, createMatch, type Seat } from "../src/match.js";
import { createRng } from "../src/rng.js";
import { decodeSnapshot, encodeSnapshot, snapshotBytes, toSnapshot } from "../src/snapshot.js";
import { TUNABLES } from "../src/tuning.js";
import type { Rng, Wind } from "../src/types.js";
import {
  WEATHER_BANDS,
  describeWind,
  isCalm,
  newerWeather,
  weatherKind,
  rollWeather,
  rollWind,
  sectorLabel,
  weatherSequence,
} from "../src/weather.js";

const NOW = 1_700_000_000_000;

function seat(slot: number): Seat {
  return {
    slot,
    team: slot % 2 === 0 ? "A" : "B",
    accountId: `acc-${slot}`,
    displayName: `P${slot}`,
    mobileId: "mbl-01",
    loadout: {},
  };
}

/** A match on `map-01`: no gimmick may replace the plain roll (`US-CORE-015` § 5). */
function match(players: 2 | 4 | 8, seed = 7) {
  return createMatch({
    matchId: "match-1",
    roomCode: "ABC234",
    seed,
    mode: "solo",
    mapId: "map-01",
    seats: Array.from({ length: players }, (_, slot) => seat(slot)),
    now: NOW,
  });
}

/** RNG stub at the `rollWind` boundary: `int` yields the supplied values in order. */
function stubRng(ints: readonly number[]): Rng {
  let index = 0;
  return {
    next: () => 0.5,
    int: (min, max) => {
      const value = ints[index % ints.length] ?? min;
      index += 1;
      return Math.min(max, Math.max(min, value));
    },
    float: (min) => min,
    state: () => 0,
  };
}

/**
 * A flat probe under the whole flight path.
 *
 * `simulateFlight` stops at `mapBounds`, and the rebalance put a full-power shell far outside the real 2,000-unit
 * map: on a 4,000-unit probe the wind shot used to report where it *left* the probe (3,680 + 52 units) instead of
 * where it landed. Every drift here is therefore measured on a flat 120,000-unit plane with 120,000-unit bounds.
 */
const PROBE_WIDTH = 120_000;
const BOUNDS = { width: PROBE_WIDTH, height: TUNABLES.mapHeight };
const flat = (width = PROBE_WIDTH) => ({
  step: TUNABLES.terrainStep,
  heights: new Float64Array(Math.floor(width / TUNABLES.terrainStep) + 1).fill(820),
  width,
});

const CALM: Wind = { magnitude: 0, directionDeg: 0, sector: 0 };
/** Sector 0 = east (`directionDeg 0`). */
const EAST = (magnitude: number): Wind => ({ magnitude, directionDeg: 0, sector: 0 });
/** Sector 1 = west (`directionDeg 180`). */
const WEST = (magnitude: number): Wind => ({ magnitude, directionDeg: 180, sector: 1 });

/**
 * `mbl-01` shot 1 at 45°, force 98 — the calibration shot — unless a shorter shot is asked for. A short shot is
 * what a drift can be read from: at force 98 and wind 26 the shell lands ~100,000 units downrange.
 *
 * `fromX` moves the muzzle: a westward shot has to start well inside the plane, because terrain only exists for
 * `x ≥ 0` and a shell blown west of the world edge falls through it instead of landing on it.
 */
function shoot(wind: Wind, force = 98, fromX = 8) {
  const mobile = getMobile("mbl-01");
  const projectile = launch({
    id: 1,
    ownerSlot: 0,
    weaponSlot: 0,
    weapon: mobile.weapons[0],
    from: { x: fromX, y: 820 },
    facing: 1,
    angle: 45,
    force,
  });
  return simulateFlight(projectile, { wind, gravity: TUNABLES.gravity }, flat(), BOUNDS);
}

describe("weather (US-CORE-015)", () => {
  it("TC-CORE-926: a fresh match rolls the wind once inside the documented ranges", () => {
    const state = match(4);
    expect(state.turn.round).toBe(1);
    expect(state.weather.rolledAtRound).toBe(state.turn.round);
    expect(state.weather).toEqual(rollWeather(state.seed, 1));

    const { wind } = state.weather;
    expect(Number.isInteger(wind.magnitude)).toBe(true);
    expect(wind.magnitude).toBeGreaterThanOrEqual(0);
    expect(wind.magnitude).toBeLessThanOrEqual(TUNABLES.windMax);
    // GB's wind is horizontal: two sectors, `directionDeg` is 0° (east) or 180° (west), never a free angle.
    expect(TUNABLES.windSectors).toBe(2);
    expect(Number.isInteger(wind.sector)).toBe(true);
    expect(wind.sector).toBeGreaterThanOrEqual(0);
    expect(wind.sector).toBeLessThan(TUNABLES.windSectors);
    expect(wind.directionDeg).toBe(wind.sector * 180);
    expect([0, 180]).toContain(wind.directionDeg);
    expect(sectorLabel(wind.sector)).toBe(wind.sector === 0 ? "E" : "W");

    // The RNG boundary: 0…26 magnitude and 0…1 sectors, never a free angle.
    expect(rollWind(stubRng([TUNABLES.windMax, TUNABLES.windSectors - 1]))).toEqual({
      magnitude: 26,
      directionDeg: 180,
      sector: 1,
    });
    expect(rollWind(stubRng([0, 0]))).toEqual({ magnitude: 0, directionDeg: 0, sector: 0 });

    // The dial's whole vocabulary is east and west, and it wraps rather than running off the end.
    expect([0, 1, 2, 3, -1].map((sector) => sectorLabel(sector))).toEqual(["E", "W", "E", "W", "W"]);
  });

  it("TC-CORE-926: the wind is constant inside a round and re-rolls once when the queue wraps", () => {
    let state = match(4);
    const opening = state.weather;

    for (let acted = 0; acted < 3; acted += 1) {
      const result = applyInput(state, { kind: "skip", slot: state.turn.activeSlot, seq: state.seq }, NOW);
      state = result.state;
      expect(result.events.some((event) => event.kind === "weather")).toBe(false);
      expect(state.weather).toEqual(opening);
      expect(state.weather.rolledAtRound).toBe(state.turn.round);
      expect(state.turn.round).toBe(1);
    }
    expect(state.turn.actedSlots).toHaveLength(3);

    const wrap = applyInput(state, { kind: "skip", slot: state.turn.activeSlot, seq: state.seq }, NOW);
    expect(wrap.state.turn.round).toBe(2);

    const weatherEvents = wrap.events.filter((event) => event.kind === "weather");
    expect(weatherEvents).toHaveLength(1);
    expect(wrap.state.weather.rolledAtRound).toBe(2);
    expect(wrap.state.weather).toEqual(rollWeather(state.seed, 2));

    // Announced with the turn that opens the round, before any snapshot of it.
    expect(wrap.events[0]?.kind).toBe("turn");
    const announced = weatherEvents[0];
    if (announced?.kind === "weather") expect(announced.weather).toEqual(wrap.state.weather);
  });

  it("TC-CORE-926: the same seed and round replay the same sequence and other seeds diverge", () => {
    for (let round = 1; round <= 4; round += 1) {
      expect(rollWeather(7, round)).toEqual(rollWeather(7, round));
    }

    const sequence = weatherSequence(7, 4);
    expect(sequence.map((weather) => weather.rolledAtRound)).toEqual([1, 2, 3, 4]);
    expect(weatherSequence(7, 4)).toEqual(sequence);
    expect(weatherSequence(8, 4)).not.toEqual(sequence);

    // Either side is reachable from a real seed, and nothing else is.
    const directions = new Set(weatherSequence(7, 40).map((weather) => weather.wind.directionDeg));
    expect([...directions].sort((a, b) => a - b)).toEqual([0, 180]);

    // The roll depends on the seed alone, never on `Math.random()`.
    expect(rollWind(createRng(99))).toEqual(rollWind(createRng(99)));
    expect(rollWind(createRng(99))).not.toEqual(rollWind(createRng(100)));
  });

  it("TC-CORE-959: magnitude 0 is a legal calm roll and the integrator adds no wind term", () => {
    const calmWeather = { wind: CALM, rolledAtRound: 1 };
    expect(isCalm(calmWeather)).toBe(true);
    expect(describeWind(CALM)).toBe("calm");

    // No `mass` argument any more: the push is the weather's alone, so a calm roll is zero for every mobile.
    const acceleration = windAcceleration(CALM);
    expect(acceleration.ax).toBe(0);
    // A zero magnitude leaves the vertical term as `-0`: numerically no acceleration either way.
    expect(acceleration.ay).toBeCloseTo(0);

    // Seed 0 / round 1 is a calm roll in the real sequence, so `0` is reachable, not a special case.
    const calmRoll = rollWeather(0, 1);
    expect(isCalm(calmRoll)).toBe(true);
    expect(calmRoll.wind.magnitude).toBe(0);
    expect(calmRoll.wind.directionDeg).toBe(calmRoll.wind.sector * 180);
    expect(describeWind(calmRoll.wind)).toBe("calm");
  });

  it("TC-CORE-926 / AC7: an out-of-order weather frame never wins", () => {
    const fresh = rollWeather(7, 4);
    const stale = rollWeather(7, 3);

    // Equal or older round: the weather in hand stands, so a late frame cannot rewind the wind.
    expect(newerWeather(fresh, stale)).toBe(fresh);
    expect(newerWeather(fresh, fresh)).toBe(fresh);
    // A later round is the only thing allowed to replace it.
    expect(newerWeather(stale, fresh)).toBe(fresh);
  });

  it("TC-CORE-023: drift equals ½·a_x·t² for the shot's own flight time", () => {
    // The calibration shot itself: 5.35 s of hang is long enough that the closed form and the integrator have to
    // agree to better than 5 %, and 2,176 units of range still lands well inside the 20,000-unit probe.
    const calm = shoot(CALM, 98);
    const east = shoot(EAST(26), 98);
    const seconds = calm.flightMs / 1000;
    const expected = 0.5 * windAcceleration(EAST(26)).ax * seconds ** 2;

    // The closed form is the reference: `a_x = 1.0 × 26 = 26 u/s²`, `t = 5.35 s` → 372 units, and the integrator
    // measures 379 of them. Quantising the position to 0.1 per step costs the rest; a drift that stops tracking
    // `½·a·t²` at all is the regression this catches.
    expect(expected).toBeCloseTo(372.1, 0);
    const drift = east.landingX - calm.landingX;
    expect(drift).toBeGreaterThan(expected * 0.95);
    expect(drift).toBeLessThanOrEqual(expected * 1.05);
    expect(drift / expected).toBeGreaterThan(0.95);
    expect(drift / expected).toBeLessThanOrEqual(1.05);

    // Horizontal only: the vertical term is zero, so the wind changes where the shell lands and never when. A
    // vertical wind component would stretch or shorten this hang time (that is the old 12-sector behaviour).
    expect(east.flightMs).toBe(calm.flightMs);

    // Wind is a vector: the same magnitude from the west lands symmetrically on the other side. Measured from a
    // muzzle well inside the plane — terrain only exists for `x ≥ 0`, so a shell blown past the world edge would
    // fall through it instead of landing on it.
    const westMuzzle = 20_000;
    const westCalm = shoot(CALM, 98, westMuzzle);
    const westDrift = shoot(WEST(26), 98, westMuzzle).landingX - westCalm.landingX;
    expect(westDrift).toBeLessThan(0);
    expect(Math.abs((westDrift + drift) / drift)).toBeLessThan(0.05);

    // Doubling the magnitude doubles the drift (the term is linear in `magnitude`).
    const half = shoot(EAST(13));
    expect(Math.abs(((half.landingX - calm.landingX) * 2 - drift) / drift)).toBeLessThan(0.05);

    expect(windAcceleration(EAST(26)).ax).toBe(TUNABLES.windCoefficient * 26);
  });

  it("TC-CORE-928: an eight-player mid-round snapshot carries the weather under 800 bytes", () => {
    const state = match(8);
    const snapshot = toSnapshot(state, 1);
    expect(snapshotBytes(state, 1)).toBeLessThanOrEqual(TUNABLES.snapshotMaxBytes);

    const decoded = decodeSnapshot(encodeSnapshot(snapshot));
    // The whole wind rides the wire, `directionDeg` included: the integrator reads the angle, so a peer that decodes a
    // different one simulates a different shot. The decode side rebuilds it as `sector * 180` — the 12-sector `* 30`
    // formula outlived `windSectors = 2` for one pass and turned a west roll into 30°.
    expect(decoded.weather).toEqual(state.weather);
    expect(decoded.weather.wind.directionDeg).toBe(decoded.weather.wind.sector * 180);
    expect(decoded.turn.round).toBe(state.turn.round);
    expect(decoded.weather.rolledAtRound).toBe(state.turn.round);
  });
});

describe("TC-CORE-960: full wind (26) bends the full-force shot by a fifth of the map (US-CORE-015 AC6)", () => {
  it("pushes the calibration shot ~378 units downrange — three ruler divisions, a sixth of gravity", () => {
    const calm = shoot(CALM);
    const pushed = shoot(EAST(26));
    const drift = pushed.landingX - calm.landingX;

    // Measured on the calibration shot: `mbl-01` shot 1, 45°, force 98 hangs 5.35 s and the wind push is
    // `a_x = 1.0 × 26 = 26 u/s²`, so `½·a·t² = 372` and the integrator lands 377.5 units further on.
    expect(calm.landingX).toBeCloseTo(2_182.4, 1);
    expect(pushed.landingX).toBeCloseTo(2_559.9, 1);
    expect(drift).toBeCloseTo(377.5, 1);
    // The closed form is the reference; the quantised integrator runs ~1.5 % hot on a 5.35 s hang.
    expect(drift / (0.5 * windAcceleration(EAST(26)).ax * (calm.flightMs / 1000) ** 2)).toBeCloseTo(1, 1);

    // The scale, stated plainly: three 125-unit ruler divisions, a fifth of the map, and a sixth of gravity sideways.
    // The first pass at the mass-free formula used the old 105 coefficient and threw the same shot 100,130 units —
    // 50 map widths — which is why the coefficient is the number that has to be re-derived, not the formula.
    expect(drift / TUNABLES.rulerUnitTarget).toBeGreaterThan(2.5);
    expect(drift / TUNABLES.rulerUnitTarget).toBeLessThan(3.5);
    expect(windAcceleration(EAST(26)).ax / TUNABLES.gravity).toBeCloseTo(0.171, 3);
    expect(drift / TUNABLES.mapWidth).toBeGreaterThan(0.15);
    expect(drift / TUNABLES.mapWidth).toBeLessThan(0.25);
  });
});

/**
 * TC-CORE-964: the weather the tray names is a band of the magnitude the roll already produced.
 *
 * The point of the case is that naming the sky is **not** a second mechanic: the bands have to tile `0…windMax` exactly, so
 * every roll lands in a named band and no magnitude can be read as two kinds at once. A hole would leave a roll unnamed; a
 * shared edge would make the label depend on which end of the range the search happened to check first.
 */
describe("TC-CORE-964: weather kinds are bands over the wind", () => {
  it("tiles 0…windMax with no gap and no overlap", () => {
    expect(WEATHER_BANDS[0]!.min).toBe(0);
    expect(WEATHER_BANDS[WEATHER_BANDS.length - 1]!.max).toBe(TUNABLES.windMax);
    for (let index = 1; index < WEATHER_BANDS.length; index += 1) {
      const previous = WEATHER_BANDS[index - 1]!;
      const current = WEATHER_BANDS[index]!;
      expect(current.min).toBe(previous.max + 1);
      expect(current.min).toBeLessThanOrEqual(current.max);
    }
  });

  it("names every magnitude the roll can produce, monotonically", () => {
    const order = WEATHER_BANDS.map((band) => band.kind);
    let lastIndex = 0;
    for (let magnitude = 0; magnitude <= TUNABLES.windMax; magnitude += 1) {
      const kind = weatherKind({ magnitude, directionDeg: 0, sector: 0 });
      const index = order.indexOf(kind);
      expect(index).toBeGreaterThanOrEqual(lastIndex);
      lastIndex = index;
      // The band it reports is the one that actually contains the magnitude.
      const band = WEATHER_BANDS[index]!;
      expect(magnitude).toBeGreaterThanOrEqual(band.min);
      expect(magnitude).toBeLessThanOrEqual(band.max);
    }
  });

  it("does not depend on the direction, only on the strength", () => {
    for (const magnitude of [0, 4, 5, 13, 14, 20, 21, TUNABLES.windMax]) {
      const east = weatherKind({ magnitude, directionDeg: 0, sector: 0 });
      const west = weatherKind({ magnitude, directionDeg: 180, sector: 1 });
      expect(west).toBe(east);
    }
  });

  it("names the four states the tray can show, and only those", () => {
    const shown = new Set(Array.from({ length: TUNABLES.windMax + 1 }, (_, magnitude) => weatherKind({ magnitude, directionDeg: 0, sector: 0 })));
    expect([...shown].sort()).toEqual(["breeze", "clear", "gale", "storm"]);
  });

  it("clamps rather than leaving a magnitude unnamed", () => {
    // Nothing rolls above `windMax`, but an item or a fixture could hand the tray a bigger number; it must still get a name.
    expect(weatherKind({ magnitude: TUNABLES.windMax + 10, directionDeg: 0, sector: 0 })).toBe("storm");
  });
});
