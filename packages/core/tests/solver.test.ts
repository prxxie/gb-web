/**
 * The practice solver (`US-BAL-007`) — the reference engine's three closed-form answers.
 *
 * These are the numbers a player checks their arithmetic against, so the tests pin the arithmetic itself: the
 * calibration shot of `reference-gunbound.md` § 10, the round trip across the whole envelope, and the three ways the
 * question has no answer (`.agents/rules/01-workflow.md` § 5: a wrong answer is worse than a refusal). The solver never
 * sees terrain — it is the flat-ground algebra, and the screen says so.
 */
import { describe, expect, it } from "vitest";
import { gravityFor, launch, simulateFlight, windAcceleration, windKFor } from "../src/ballistics";
import { createTerrain } from "../src/terrain";
import { getMobile } from "../src/data/mobiles";
import { barForDistance, distanceForBar, timeForShot, type SolveContext } from "../src/solver";
import { TUNABLES } from "../src/tuning";
import type { Wind } from "../src/types";

const CALM: Wind = { magnitude: 0, directionDeg: 0, sector: 0 };

/** `mbl-03` is the reference hull: weight 5.78, so `gravity = 390` exactly. */
const TORTOISE = getMobile("mbl-03");

function context(angle: number, deltaY = 0, wind: Wind = CALM): SolveContext {
  return {
    angle,
    deltaY,
    gravity: gravityFor(TORTOISE),
    wind: windAcceleration(wind, windKFor(TORTOISE)),
  };
}

const east = (magnitude: number): Wind => ({ magnitude, directionDeg: 0, sector: 0 });
const west = (magnitude: number): Wind => ({ magnitude, directionDeg: 180, sector: 1 });

function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  expect(result.ok).toBe(true);
  return result as Extract<T, { ok: true }>;
}

function refused<T extends { ok: boolean }>(result: T): Extract<T, { ok: false }> {
  expect(result.ok).toBe(false);
  return result as Extract<T, { ok: false }>;
}

describe("TC-BAL-150: the calibration shot (US-BAL-007 AC2)", () => {
  it("solves the calibration distance at 45° to bar 4.00 and 3.37 s", () => {
    // § 10's shot measures 2 214 u = 22.14 phần; the document's "2.77 màn" is that rounded (22.16 phần).
    const solved = ok(barForDistance(22.14, context(45)));

    expect(solved.bar).toBeCloseTo(4, 2);
    expect(solved.flightSec).toBeCloseTo(3.37, 1);
    expect(Math.abs(solved.flightSec - 3.37)).toBeLessThanOrEqual(0.05);
  });

  it("refuses the rounded 2.77 màn, because that shot is past the bar's reach", () => {
    const rounded = (2.77 * TUNABLES.manWidth) / TUNABLES.partWidth;

    expect(rounded).toBeCloseTo(22.16, 2);
    expect(rounded * TUNABLES.partWidth).toBeGreaterThan(ok(distanceForBar(4, context(45))).parts * TUNABLES.partWidth);
    expect(barForDistance(rounded, context(45))).toEqual({ ok: false, reason: "unreachable" });
  });

  it("is the shot the engine flies: bar 3 at 45° lands where the closed form says", () => {
    const flown = ok(distanceForBar(4, context(45)));
    expect(flown.parts).toBeCloseTo(22.15, 1);
    expect(flown.flightSec).toBeCloseTo(3.37, 2);

    // The closed form and the 25 ms integrator have to agree; the cross-check flies at bar 3, because the bar-4 shot
    // lands 2 514 u from the muzzle — past the 2 000 u map edge, where the integrator has no ground to stop on.
    const terrain = createTerrain("map-01");
    terrain.heights.fill(820);
    const shell = launch({
      id: 1,
      ownerSlot: 0,
      weaponSlot: 0,
      weapon: TORTOISE.weapons[0],
      from: { x: 300, y: 812 },
      facing: 1,
      angle: 45,
      bar: 3,
    });
    const flight = simulateFlight(
      shell,
      { gravity: gravityFor(TORTOISE), wind: CALM, windK: windKFor(TORTOISE) },
      terrain,
    );
    const closed = ok(distanceForBar(3, context(45)));

    // Within ten units and a twentieth of a second: the 25 ms sampler and the eight units the muzzle sits above the
    // flag are both in that budget, and the closed form knows about neither.
    expect(Math.abs(flight.landingX - 300 - closed.parts * TUNABLES.partWidth)).toBeLessThanOrEqual(10);
    expect(Math.abs(flight.flightMs / 1_000 - closed.flightSec)).toBeLessThanOrEqual(0.05);
  });
});

describe("TC-BAL-149: bar → distance → bar, across the envelope (US-BAL-007 AC1)", () => {
  it("round-trips every reachable pair of angle and bar to ±0.01 bar", () => {
    const pairs = [20, 30, 35, 45, 55, 65, 75, 85];
    for (const angle of pairs) {
      for (const bar of [0.5, 1, 1.75, 2.5, 3.25, 4]) {
        const flown = ok(distanceForBar(bar, context(angle)));
        expect(flown.parts).toBeGreaterThan(0);
        const solved = ok(barForDistance(flown.parts, context(angle)));
        expect(Math.abs(solved.bar - bar)).toBeLessThanOrEqual(0.01);
      }
    }
  });

  it("round-trips with a height difference and with either wind", () => {
    for (const deltaY of [-150, 0, 120]) {
      for (const wind of [CALM, east(12), west(20)]) {
        const flown = ok(distanceForBar(2.5, context(50, deltaY, wind)));
        if (!flown.parts) continue;
        const solved = ok(barForDistance(flown.parts, context(50, deltaY, wind)));
        expect(Math.abs(solved.bar - 2.5)).toBeLessThanOrEqual(0.01);
      }
    }
  });

  it("meets an elevated target later and a sunken one sooner: downhill is shorter", () => {
    const flat = ok(distanceForBar(3, context(45)));
    const uphill = ok(distanceForBar(3, context(45, 200)));
    const downhill = ok(distanceForBar(3, context(45, -200)));

    // The shell has further to fall past a target above the muzzle, and less past one below it.
    expect(uphill.parts).toBeGreaterThan(flat.parts);
    expect(downhill.parts).toBeLessThan(flat.parts);
  });

  it("returns the flight time the distance was measured over, in both directions", () => {
    const flown = ok(distanceForBar(2, context(60)));
    const timed = ok(timeForShot(2, context(60)));

    expect(timed.flightSec).toBeCloseTo(flown.flightSec, 6);
  });
});

describe("TC-BAL-151: the solver refuses instead of answering nonsense (US-BAL-007 AC3)", () => {
  it("refuses an angle too low to climb to the target", () => {
    const refusedHere = refused(barForDistance(20, context(5, 400)));

    expect(refusedHere.reason).toBe("unreachable");
  });

  it("blames the wind only when the wind is what makes the target short", () => {
    // 20 phần is inside the calm bar-4 reach and outside the reach with the strongest headwind.
    expect(barForDistance(20, context(45)).ok).toBe(true);
    const headwind = barForDistance(20, context(45, 0, west(26)));
    expect(headwind.ok).toBe(false);
    if (!headwind.ok) expect(headwind.reason).toBe("wind");

    // 30 phần is out of reach with the wind still and with it blowing: that is the distance, not the wind.
    const hopeless = barForDistance(30, context(45, 0, west(26)));
    expect(hopeless.ok).toBe(false);
    if (!hopeless.ok) expect(hopeless.reason).toBe("unreachable");
  });

  it("refuses a half-typed height or wind instead of answering NaN", () => {
    for (const broken of [
      { ...context(45), deltaY: Number.NaN },
      { ...context(45), deltaY: Number.POSITIVE_INFINITY },
      { ...context(45), gravity: Number.NaN },
      { ...context(45), wind: { ax: Number.NaN, ay: 0, directionDeg: 0, sector: 0 } },
    ]) {
      const solved = barForDistance(12, broken);
      expect(solved.ok).toBe(false);
      if (!solved.ok) expect(solved.reason).toBe("height");
      const measured = distanceForBar(3, broken);
      expect(measured.ok).toBe(false);
      if (!measured.ok) expect(measured.reason).toBe("height");
    }
  });

  it("refuses a distance behind the muzzle instead of mirroring the bar", () => {
    for (const parts of [0, -3, Number.NaN]) {
      const result = barForDistance(parts, context(45));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("distance");
    }
  });

  it("refuses a zero, right-angle-free or non-finite angle", () => {
    for (const angle of [0, 180, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = barForDistance(5, context(angle));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("angle");
    }
  });

  it("refuses a bar outside 0…4 and a non-finite one", () => {
    for (const bar of [-0.5, 4.5, Number.NaN]) {
      for (const result of [distanceForBar(bar, context(45)), timeForShot(bar, context(45))]) {
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe("bar");
      }
    }
  });

  it("never returns a negative or infinite bar for a reachable question", () => {
    for (const angle of [20, 45, 70]) {
      for (const parts of [1, 5, 12]) {
        const result = barForDistance(parts, context(angle));
        if (!result.ok) continue;
        expect(result.bar).toBeGreaterThan(0);
        expect(Number.isFinite(result.bar)).toBe(true);
      }
    }
  });
});
