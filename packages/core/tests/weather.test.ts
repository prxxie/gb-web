import { describe, expect, it } from "vitest";
import { launch, simulateFlight, windAcceleration } from "../src/ballistics.js";
import { getMobile } from "../src/data/mobiles.js";
import { applyInput, createMatch, type Seat } from "../src/match.js";
import { createRng } from "../src/rng.js";
import { decodeSnapshot, encodeSnapshot, snapshotBytes, toSnapshot } from "../src/snapshot.js";
import { TUNABLES } from "../src/tuning.js";
import type { Rng, Wind } from "../src/types.js";
import {
  describeWind,
  isCalm,
  newerWeather,
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
    // Force 40 rather than the calibration shot: at 3.5 s of hang time the shell still lands inside the probe, so
    // the drift is a landing difference and not the point where a 100,000-unit push left the map.
    const calm = shoot(CALM, 40);
    const east = shoot(EAST(26), 40);
    const seconds = calm.flightMs / 1000;
    const expected = 0.5 * windAcceleration(EAST(26)).ax * seconds ** 2;

    // The closed form is the reference: `a_x = 0.8 × 26 = 20.8 u/s²`, `t = 3.55 s` → 131 units, and the
    // integrator measures 127 of them. Quantising the position to 0.1 per step costs the rest; a drift that
    // stops tracking `½·a·t²` at all is the regression this catches.
    expect(expected).toBeCloseTo(127.4, 0);
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
    const westCalm = shoot(CALM, 40, westMuzzle);
    const westDrift = shoot(WEST(26), 40, westMuzzle).landingX - westCalm.landingX;
    expect(westDrift).toBeLessThan(0);
    expect(Math.abs((westDrift + drift) / drift)).toBeLessThan(0.05);

    // Doubling the magnitude doubles the drift (the term is linear in `magnitude`).
    const half = shoot(EAST(13), 40);
    expect(Math.abs(((half.landingX - calm.landingX) * 2 - drift) / drift)).toBeLessThan(0.05);

    // And it is not the mobile's business: the mass division is gone from `windAcceleration`'s contract, so the
    // same shot in another mobile lands in exactly the same place (asserted roster-wide in `ballistics.test.ts`).
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

describe("TC-CORE-960: full wind (26) bends the full-force shot by a sixth of the map (US-CORE-015 AC6)", () => {
  it("pushes the calibration shot ~763 units downrange — six ruler divisions, a fifth of gravity", () => {
    const calm = shoot(CALM);
    const pushed = shoot(EAST(26));
    const drift = pushed.landingX - calm.landingX;

    // Measured on the calibration shot: `mbl-01` shot 1, 45°, force 98 hangs 8.6 s and the wind push is
    // `a_x = 0.8 × 26 = 20.8 u/s²`, so `½·a·t² = 769` and the integrator lands 760 units further on.
    expect(calm.landingX).toBeCloseTo(3_680.3, 1);
    expect(pushed.landingX).toBeCloseTo(4_440.2, 1);
    expect(drift).toBeCloseTo(760, 0);
    expect(drift / (0.5 * windAcceleration(EAST(26)).ax * (calm.flightMs / 1000) ** 2)).toBeCloseTo(1, 2);

    // The scale, stated plainly: six 125-unit ruler divisions, a sixth of the map, and a fifth of gravity sideways.
    // The first pass at the mass-free formula used the old 105 coefficient and threw the same shot 100,130 units —
    // 50 map widths — which is why the coefficient is the number that has to be re-derived, not the formula.
    expect(drift / TUNABLES.rulerUnitTarget).toBeGreaterThan(5);
    expect(drift / TUNABLES.rulerUnitTarget).toBeLessThan(7);
    expect(windAcceleration(EAST(26)).ax / TUNABLES.gravity).toBeCloseTo(0.208, 3);
    expect(drift / TUNABLES.mapWidth).toBeGreaterThan(0.3);
    expect(drift / TUNABLES.mapWidth).toBeLessThan(0.45);
  });
});
