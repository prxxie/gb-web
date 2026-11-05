import { describe, expect, it } from "vitest";
import { launch, simulateFlight, windAcceleration } from "../src/ballistics.js";
import { getMobile } from "../src/data/mobiles.js";
import { applyInput, createMatch, type Seat } from "../src/match.js";
import { createRng } from "../src/rng.js";
import { decodeSnapshot, encodeSnapshot, snapshotBytes, toSnapshot } from "../src/snapshot.js";
import { TUNABLES } from "../src/tuning.js";
import type { Rng, Wind } from "../src/types.js";
import { describeWind, isCalm, rollWeather, rollWind, weatherSequence } from "../src/weather.js";

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
 * A flat probe map, wide enough that a full-power `mbl-01` shot still lands inside it: the real
 * `map-01` is 2,000 units wide and the calm shot already lands at ~1,986.
 */
const flat = (width = 4_000) => ({
  step: TUNABLES.terrainStep,
  heights: new Float64Array(Math.floor(width / TUNABLES.terrainStep) + 1).fill(820),
  width,
});

const CALM: Wind = { magnitude: 0, directionDeg: 0, sector: 0 };

function shoot(wind: Wind) {
  const mobile = getMobile("mbl-01");
  const projectile = launch({
    id: 1,
    ownerSlot: 0,
    weaponSlot: 0,
    weapon: mobile.weapons[0],
    from: { x: 8, y: 820 },
    facing: 1,
    angle: 45,
    force: 98,
  });
  return simulateFlight(projectile, { wind, gravity: mobile.gravity, mass: mobile.mass }, flat());
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
    expect(Number.isInteger(wind.sector)).toBe(true);
    expect(wind.sector).toBeGreaterThanOrEqual(0);
    expect(wind.sector).toBeLessThan(TUNABLES.windSectors);
    expect(wind.directionDeg).toBe(wind.sector * 30);

    // The RNG boundary: 0…26 magnitude and 0…11 sectors, never a free angle.
    expect(rollWind(stubRng([TUNABLES.windMax, TUNABLES.windSectors - 1]))).toEqual({
      magnitude: 26,
      directionDeg: 330,
      sector: 11,
    });
    expect(rollWind(stubRng([0, 0]))).toEqual({ magnitude: 0, directionDeg: 0, sector: 0 });
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

    // The roll depends on the seed alone, never on `Math.random()`.
    expect(rollWind(createRng(99))).toEqual(rollWind(createRng(99)));
    expect(rollWind(createRng(99))).not.toEqual(rollWind(createRng(100)));
  });

  it("TC-MATCH-923: magnitude 0 is a legal calm roll and the integrator adds no wind term", () => {
    const calmWeather = { wind: CALM, rolledAtRound: 1 };
    expect(isCalm(calmWeather)).toBe(true);
    expect(describeWind(CALM)).toBe("calm");

    const acceleration = windAcceleration(CALM, getMobile("mbl-01").mass);
    expect(acceleration.ax).toBe(0);
    // A zero magnitude leaves the vertical term as `-0`: numerically no acceleration either way.
    expect(acceleration.ay).toBeCloseTo(0);

    // Seed 0 / round 1 is a calm roll in the real sequence, so `0` is reachable, not a special case.
    const calmRoll = rollWeather(0, 1);
    expect(isCalm(calmRoll)).toBe(true);
    expect(calmRoll.wind.magnitude).toBe(0);
    expect(calmRoll.wind.directionDeg).toBe(calmRoll.wind.sector * 30);
    expect(describeWind(calmRoll.wind)).toBe("calm");
  });

  it("TC-CORE-023: drift equals ½·a_x·t² for the shot's own flight time", () => {
    const calm = shoot(CALM);
    const east = shoot({ magnitude: 26, directionDeg: 0, sector: 0 });
    const west = shoot({ magnitude: 26, directionDeg: 180, sector: 6 });
    const mass = getMobile("mbl-01").mass;
    const seconds = calm.flightMs / 1000;
    const expected = 0.5 * windAcceleration({ magnitude: 26, directionDeg: 0, sector: 0 }, mass).ax * seconds ** 2;

    const drift = east.landingX - calm.landingX;

    // The closed form is the reference. Positions are quantised to 0.1 per step (`TUNABLES.roundTo`), so
    // the agreement is within a few percent, not exact; a drift that stops tracking `½·a·t²` at all is the
    // regression this catches (it did: rounding `vx` to 0.1 lost 11 % of the push and made it non-linear).
    expect(expected).toBeGreaterThan(100);
    // The bound is set by the 0.1 position quantum, not by the force: over 126 steps a systematic 0.05 per
    // step is 6 units on a 130-unit drift (4.6 %), which is what the integrator actually loses. A drift that
    // breaks this band means the wind is being quantised again (it was: rounding `vx` lost 11 %).
    expect(drift / expected).toBeGreaterThan(0.95);
    expect(drift / expected).toBeLessThanOrEqual(1.05);

    // Wind is a vector: the same magnitude from the west lands symmetrically on the other side. The
    // 8.7-unit slack is the landing interpolation, which samples the crossing from whichever side the
    // projectile arrives at, not physics.
    expect(west.landingX - calm.landingX).toBeLessThan(0);
    expect(Math.abs((west.landingX - calm.landingX + drift) / drift)).toBeLessThan(0.1);

    // Doubling the magnitude doubles the drift (the term is linear in `magnitude`).
    const half = shoot({ magnitude: 13, directionDeg: 0, sector: 0 });
    expect(Math.abs(((half.landingX - calm.landingX) * 2 - drift) / drift)).toBeLessThan(0.05);

    // The mass division itself is `windAcceleration`'s contract and is unit-tested there; a second
    // mobile's trajectory depends on its own weapon as well, so it is not a cleaner oracle here.
  });

  it("TC-CORE-928: an eight-player mid-round snapshot carries the weather under 800 bytes", () => {
    const state = match(8);
    const snapshot = toSnapshot(state, 1);
    expect(snapshotBytes(state, 1)).toBeLessThanOrEqual(TUNABLES.snapshotMaxBytes);

    const decoded = decodeSnapshot(encodeSnapshot(snapshot));
    expect(decoded.weather).toEqual(state.weather);
    expect(decoded.turn.round).toBe(state.turn.round);
    expect(decoded.weather.rolledAtRound).toBe(state.turn.round);
  });
});
