/**
 * The independent oracle for the stepped integrator (`US-BAL-008`).
 *
 * `reference-gunbound.md` section 10 gives the closed-form arc on flat ground with horizontal wind. The integrator has to
 * agree with it unless a constant in `tuning.ts` drifts, in which case this file fails before players learn a different
 * shot. Terrain, bounce and cluster shots are outside the oracle's contract.
 */
import { describe, expect, it } from "vitest";
import { gravityFor, launch, muzzleVelocity, simulateFlight, windKFor } from "../src/ballistics";
import { getMobile } from "../src/data/mobiles";
import { TUNABLES } from "../src/tuning";
import type { Wind } from "../src/types";

const PROBE_WIDTH = 120_000;
const BOUNDS = { width: PROBE_WIDTH, height: TUNABLES.mapHeight };
const FLAT_Y = 820;
const MUZZLE_X = 8;
const CALM: Wind = { magnitude: 0, directionDeg: 0, sector: 0 };
/** The reference hull: weight 5.78, so gravity is exactly 390 u/s^2. */
const REFERENCE = getMobile("mbl-03");

const flat = () => ({
  step: TUNABLES.terrainStep,
  heights: new Float64Array(Math.floor(PROBE_WIDTH / TUNABLES.terrainStep) + 1).fill(FLAT_Y),
  width: PROBE_WIDTH,
});

/**
 * The closed form for a shot that starts and lands at the same height:
 *
 * ```
 * range = v0^2 sin(2 theta) / g
 * time  = 2 v0 sin(theta) / g
 * ```
 */
export function analyticRange(v0: number, angleDeg: number, gravity: number): number {
  const radians = (angleDeg * Math.PI) / 180;
  return (v0 * v0 * Math.sin(2 * radians)) / gravity;
}

export function analyticFlightSec(v0: number, angleDeg: number, gravity: number): number {
  const radians = (angleDeg * Math.PI) / 180;
  return (2 * v0 * Math.sin(radians)) / gravity;
}

interface Fixture {
  readonly angle: number;
  readonly bar: number;
  readonly label: string;
}

const FIXTURES: readonly Fixture[] = [30, 37.5, 45, 52.5, 60, 67.5, 75].flatMap((angle) =>
  [1, 1.5, 2, 2.5, 3, 3.5, 4].map((bar) => ({ angle, bar, label: `${angle} deg at bar ${bar}` })),
);

interface Comparison {
  readonly fixture: Fixture;
  readonly actualRange: number;
  readonly expectedRange: number;
  readonly rangeMissUnits: number;
  readonly rangeTolerance: number;
  readonly rangeError: number;
  readonly actualTime: number;
  readonly expectedTime: number;
  readonly timeMissMs: number;
  readonly timeToleranceMs: number;
  readonly timeError: number;
}

interface CompareOptions {
  readonly integrationGravity?: number;
  readonly analyticGravity?: number;
}

/**
 * The semi-implicit update advances a level-ground shot by almost exactly one horizontal step before it crosses the
 * ground again:
 *
 * ```
 * range tolerance = v0 cos(theta) x 25 ms + 4 terrain samples
 * ```
 *
 * The first term is the discrete update's built-in horizontal bias; the four terrain samples (`4 x 2 u`) cover the
 * segment test's position quantisation. `flightMs` is the age at a step boundary rather than an interpolated crossing,
 * so its budget is two 25 ms ages: the crossing can be one step early and the reported age the next step. Both budgets
 * scale with `TUNABLES.stepMs`/`terrainStep`, so changing either constant changes this test.
 */
const rangeTolerance = (angle: number, bar: number): number => {
  const radians = (angle * Math.PI) / 180;
  return muzzleVelocity(bar) * Math.cos(radians) * (TUNABLES.stepMs / 1000) + 4 * TUNABLES.terrainStep;
};
const TIME_TOLERANCE_MS = 2 * TUNABLES.stepMs;

function compare(fixture: Fixture, options: CompareOptions = {}): Comparison {
  const analyticGravity = options.analyticGravity ?? gravityFor(REFERENCE);
  const integrationGravity = options.integrationGravity ?? analyticGravity;
  const projectile = launch({
    id: 1,
    ownerSlot: 0,
    weaponSlot: 0,
    weapon: REFERENCE.weapons[0],
    from: { x: MUZZLE_X, y: FLAT_Y },
    facing: 1,
    angle: fixture.angle,
    bar: fixture.bar,
  });
  const flight = simulateFlight(
    projectile,
    { wind: CALM, gravity: integrationGravity, windK: windKFor(REFERENCE) },
    flat(),
    BOUNDS,
    { firstGroundImpact: true },
  );

  expect(flight.impact, fixture.label).not.toBeNull();
  expect(flight.offMap, fixture.label).toBe(false);

  const v0 = muzzleVelocity(fixture.bar);
  const expectedRange = analyticRange(v0, fixture.angle, analyticGravity);
  const expectedTime = analyticFlightSec(v0, fixture.angle, analyticGravity);
  const actualRange = flight.landingX - MUZZLE_X;
  const actualTime = flight.flightMs / 1_000;

  return {
    fixture,
    actualRange,
    expectedRange,
    actualTime,
    expectedTime,
    rangeMissUnits: Math.abs(actualRange - expectedRange),
    rangeTolerance: rangeTolerance(fixture.angle, fixture.bar),
    rangeError: Math.abs(actualRange - expectedRange) / expectedRange,
    timeMissMs: Math.abs(actualTime - expectedTime) * 1_000,
    timeToleranceMs: TIME_TOLERANCE_MS,
    timeError: Math.abs(actualTime - expectedTime) / expectedTime,
  };
}

const withinTolerance = ({ rangeMissUnits, rangeTolerance, timeMissMs, timeToleranceMs }: Comparison): boolean =>
  rangeMissUnits <= rangeTolerance && timeMissMs <= timeToleranceMs;

describe("TC-BAL-167: the integrator agrees with the algebra (US-BAL-008 AC1)", () => {
  it("stays inside the 25 ms model's range and flight-time budget across 30-75 deg and bar 1-4", () => {
    const outside = FIXTURES.map((fixture) => compare(fixture)).filter((comparison) => !withinTolerance(comparison));

    expect(
      outside.map(
        ({
          fixture,
          actualRange,
          expectedRange,
          rangeMissUnits,
          rangeTolerance,
          rangeError,
          actualTime,
          expectedTime,
          timeMissMs,
          timeToleranceMs,
          timeError,
        }) =>
          `${fixture.label}: range ${actualRange.toFixed(2)}/${expectedRange.toFixed(2)} u ` +
          `(miss ${rangeMissUnits.toFixed(2)}, budget ${rangeTolerance.toFixed(2)} u, ${(rangeError * 100).toFixed(2)}%), ` +
          `time ${actualTime.toFixed(3)}/${expectedTime.toFixed(3)} s ` +
          `(miss ${timeMissMs.toFixed(2)}, budget ${timeToleranceMs.toFixed(2)} ms, ${(timeError * 100).toFixed(2)}%)`,
      ),
    ).toEqual([]);
  });
});

describe("TC-BAL-168: the tolerance is not vacuous (US-BAL-008 AC2)", () => {
  it("rejects the calibration shot when gravity is deliberately perturbed by 5 %", () => {
    const gravity = gravityFor(REFERENCE);
    const calibration = FIXTURES.find(({ angle, bar }) => angle === 45 && bar === 4);
    if (!calibration) throw new Error("the calibration fixture is missing");
    const stillAccepted = [gravity * 1.05, gravity * 0.95]
      .map((integrationGravity) => compare(calibration, { integrationGravity, analyticGravity: gravity }))
      .filter(withinTolerance)
      .map(
        ({ fixture, rangeMissUnits, timeMissMs }) =>
          `${fixture.label} (${rangeMissUnits.toFixed(2)} u, ${timeMissMs.toFixed(2)} ms)`,
      );

    expect(stillAccepted).toEqual([]);
  });
});

describe("TC-BAL-169: the tolerance follows the 25 ms step (US-BAL-008 AC3)", () => {
  it("derives both budgets from the fixed integrator step", () => {
    expect(TUNABLES.stepMs).toBe(25);
    expect(TUNABLES.terrainStep).toBe(2);
    expect(rangeTolerance(45, TUNABLES.powerBarMax)).toBeCloseTo(24.43, 2);
    expect(TIME_TOLERANCE_MS).toBe(50);
  });
});

describe("TC-BAL-170: only horizontal wind belongs to this oracle (US-BAL-008 AC4)", () => {
  const diagonal: Wind = { magnitude: 12, directionDeg: 30, sector: 0 };

  it("skips a diagonal wind with the reason the closed form assumes horizontal wind", (context) => {
    if (diagonal.directionDeg !== 0 && diagonal.directionDeg !== 180) {
      context.skip("closed form assumes horizontal wind");
    }
    compare(FIXTURES[0]!);
  });
});
