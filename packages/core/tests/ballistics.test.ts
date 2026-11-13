import { describe, expect, it } from "vitest";
import { MOBILES, getMobile } from "../src/data/mobiles.js";
import {
  gravityFor,
  launch,
  muzzleVelocity,
  simulateFlight,
  stepProjectile,
  windAcceleration,
  windKFor,
} from "../src/ballistics.js";
import { TUNABLES } from "../src/tuning.js";
import type { Mobile, Wind } from "../src/types.js";

/**
 * A flat probe wide enough to contain the whole flight.
 *
 * `simulateFlight` stops at `mapBounds`, so on the real 2,000 × 1,200 map a full-bar shell reports where it *left*
 * the map instead of where it *lands*. Every range assertion here is measured on a flat 120,000-unit plane; the one
 * test that is *about* the map passes the real bounds explicitly.
 */
const PROBE_WIDTH = 120_000;
const BOUNDS = { width: PROBE_WIDTH, height: TUNABLES.mapHeight };
const MAP_BOUNDS = { width: TUNABLES.mapWidth, height: TUNABLES.mapHeight };

const flat = (y = 820) => ({
  step: TUNABLES.terrainStep,
  heights: new Float64Array(Math.floor(PROBE_WIDTH / TUNABLES.terrainStep) + 1).fill(y),
  width: PROBE_WIDTH,
});

const CALM: Wind = { magnitude: 0, directionDeg: 0, sector: 0 };
/** map-01's spawn separation, in units. */
const SEPARATION = 1_640;
/** Sector 0 = east (`directionDeg 0`), GB's only two wind directions. */
const EAST = (magnitude: number): Wind => ({ magnitude, directionDeg: 0, sector: 0 });
/** Sector 1 = west (`directionDeg 180`). */
const WEST = (magnitude: number): Wind => ({ magnitude, directionDeg: 180, sector: 1 });

/** The contract's three pinned coefficients (`US-BAL-005` AC5, amended 2026-11-13 to be proportional to the drag). */
const MID_WEIGHT_K = 5.8227788279773165;

interface ShotOptions {
  /** Fire this mobile's shot 1 with another mobile, to hold the shell constant while the shooter varies. */
  readonly weaponFrom?: string;
  readonly bounds?: { width: number; height: number };
}

function shoot(mobileId: string, angle: number, bar: number, wind: Wind = CALM, options: ShotOptions = {}) {
  const mobile = getMobile(mobileId);
  const projectile = launch({
    id: 1,
    ownerSlot: 0,
    weaponSlot: 0,
    weapon: getMobile(options.weaponFrom ?? mobileId).weapons[0],
    from: { x: 8, y: 820 },
    facing: 1,
    angle,
    bar,
  });
  const flight = simulateFlight(
    projectile,
    { wind, gravity: gravityFor(mobile), windK: windKFor(mobile) },
    flat(),
    options.bounds ?? BOUNDS,
  );
  return { ...flight, mobile };
}

describe("ballistics", () => {
  it("TC-BAL-119: the muzzle follows the bar — 232.335 u/s per bar, clamped to 0…4", () => {
    expect(muzzleVelocity(0)).toBe(0);
    expect(muzzleVelocity(1)).toBeCloseTo(232.335, 10);
    expect(muzzleVelocity(4)).toBeCloseTo(929.34, 10);
    // The bar is clamped, never extrapolated (`US-BAL-004` AC1, § 5): nine bar is four, a negative bar is rest.
    expect(muzzleVelocity(9)).toBe(muzzleVelocity(4));
    expect(muzzleVelocity(-3)).toBe(0);

    // It reaches the projectile's initial speed, split by the angle.
    const shot = launch({
      id: 1,
      ownerSlot: 0,
      weaponSlot: 0,
      weapon: getMobile("mbl-03").weapons[0],
      from: { x: 0, y: 0 },
      facing: 1,
      angle: 0,
      bar: 4,
    });
    expect(shot.vx).toBeCloseTo(929.3, 1);
    expect(shot.vy).toBeCloseTo(0, 10);
  });

  it("TC-BAL-120: gravity is the machine's weight — 390 u/s² at the 5.78 reference", () => {
    // `g = 390 × weight / 5.78`: the reference machine is exactly 390, and the roster spans 283…506 (`US-BAL-004` AC1).
    expect(gravityFor({ weight: 5.78 })).toBeCloseTo(390, 9);
    expect(gravityFor({ weight: 7.5 })).toBeCloseTo(506.055, 2);
    expect(gravityFor({ weight: 4.2 })).toBeCloseTo(283.391, 2);

    const heavy = shoot("mbl-01", 45, 4); // weight 7.50
    const light = shoot("mbl-13", 45, 4); // weight 4.20
    expect(heavy.landingX).toBeLessThan(light.landingX);
    expect(heavy.flightMs).toBeLessThan(light.flightMs);

    // The step applies that machine's own gravity: `vy` grows by `g × 0.025` per step.
    const shot = launch({
      id: 1,
      ownerSlot: 0,
      weaponSlot: 0,
      weapon: getMobile("mbl-03").weapons[0],
      from: { x: 0, y: 0 },
      facing: 1,
      angle: 45,
      bar: 4,
    });
    const stepped = stepProjectile(shot, { wind: CALM, gravity: gravityFor({ weight: 5.78 }), windK: 0 });
    expect(stepped.vy - shot.vy).toBeCloseTo(9.75, 10); // 390 × 0.025
    expect(stepped.ageMs).toBe(25);
  });

  it("TC-BAL-121: the wind coefficient is proportional to the drag — Boomer reads 9.966", () => {
    // k = (0.222 / 0.046) × (windDrag / 0.046). Proportional to the drag, not inverse (`US-BAL-005` AC5).
    expect(windKFor({ windDrag: 0.046 })).toBeCloseTo(4.826, 3);
    expect(windKFor({ windDrag: 0.0555 })).toBeCloseTo(MID_WEIGHT_K, 9);
    expect(windKFor({ windDrag: 0.095 })).toBeCloseTo(9.9669, 3);
    // Boomer's appetite is about twice the mid-weight machines', and its mapped row keeps the printed 0.0950.
    expect(windKFor({ windDrag: 0.095 }) / MID_WEIGHT_K).toBeCloseTo(1.711, 2);

    // The roster-wide span follows the drag column: no machine reads a coefficient the table does not imply.
    for (const mobile of MOBILES) {
      expect(windKFor(mobile), mobile.mobileId).toBeCloseTo((0.222 / 0.046) * (mobile.windDrag / 0.046), 9);
    }
  });

  it("TC-BAL-122: the vertical wind term exists and is zero for GB's horizontal wind", () => {
    const k = MID_WEIGHT_K;
    // `windEff = 26 × 0.95 = 24.7`, so `aₓ = k × 24.7`.
    expect(windAcceleration(EAST(26), k).ax).toBeCloseTo(k * 24.7, 9);
    expect(windAcceleration(EAST(26), k).ay).toBeCloseTo(0, 10); // `-0`: no vertical term
    expect(windAcceleration(WEST(26), k).ax).toBeCloseTo(-k * 24.7, 9);
    expect(windAcceleration(WEST(26), k).ay).toBeCloseTo(0, 10);

    // A calm roll pushes nothing, whatever the coefficient.
    expect(windAcceleration(CALM, k).ax).toBeCloseTo(0, 10);
    expect(windAcceleration(CALM, k).ay).toBeCloseTo(0, 10);

    // The general formula keeps its shape for a map gimmick that ever needs vertical wind: θ = 270° blows upward.
    expect(windAcceleration({ magnitude: 26, directionDeg: 270, sector: 0 }, k).ay).toBeGreaterThan(0);

    // Doubling `k` doubles the push: the coefficient is the only scale factor.
    expect(windAcceleration(EAST(26), k * 2).ax).toBeCloseTo(windAcceleration(EAST(26), k).ax * 2, 9);
  });

  it("TC-BAL-123: the calibration shot — the 5.78 machine, four bar, 45°, lands 2 214 ± 20 u in 3.37 ± 0.05 s", () => {
    // The middle machine: Iron Tortoise's mapped row is `turtle`, weight 5.78 ⇒ g = 390 (`US-BAL-004` AC3).
    const flight = shoot("mbl-03", 45, 4);
    expect(flight.mobile.weight).toBe(5.78);
    expect(gravityFor(flight.mobile)).toBeCloseTo(390, 9);
    expect(Math.abs(flight.landingX - 2_214)).toBeLessThanOrEqual(20);
    expect(Math.abs(flight.flightMs - 3_370)).toBeLessThanOrEqual(50);
    expect(flight.offMap).toBe(false);
    // Closed form: `v0² / g = 929.34² / 390 = 2 214`; the 0.1 position quantum takes the rest.
    expect(muzzleVelocity(4) ** 2 / 390).toBeCloseTo(2_214.5, 1);
  });

  it("TC-BAL-124: wind bends the calibration shot by the amount the machine's k implies", () => {
    const calm = shoot("mbl-03", 45, 4);
    const k = windKFor(getMobile("mbl-03"));
    // `aₓ = k × 24.7`, and the flight is `t` long: `Δx ≈ ½·aₓ·t²` plus the integrator's own rounding.
    const predicted = 0.5 * (k * 24.7) * (calm.flightMs / 1_000) ** 2;
    const east = shoot("mbl-03", 45, 4, EAST(26)).landingX - calm.landingX;
    const west = shoot("mbl-03", 45, 4, WEST(26)).landingX - calm.landingX;
    expect(east).toBeGreaterThan(predicted * 0.95);
    expect(east).toBeLessThan(predicted * 1.05);
    // Symmetric up to the 0.1 quantum the flat probe rounds on.
    expect(Math.abs(west + east)).toBeLessThan(15);
    // 814 units on the 26 reading: a fifth of the map, and no small correction.
    expect(east).toBeCloseTo(814.3, 0);

    // Monotonic in the magnitude, and each sector pushes its own way.
    const drift = [5, 13, 20, 26].map((magnitude) => shoot("mbl-03", 45, 4, EAST(magnitude)).landingX - calm.landingX);
    expect(drift[0]).toBeGreaterThan(0);
    for (let index = 1; index < drift.length; index += 1) {
      expect(drift[index]!, `magnitude step ${index}`).toBeGreaterThan(drift[index - 1]!);
    }

    // The correction is a property of the pick (`AC2`, AC5): each machine's drift follows its *own* k and its own hang
    // time. Glacier Mammoth (`windDrag 0.0460`) hangs ~4.05 s and drifts ~ ½·k·24.7·t²; Mist Raven's bounce shell
    // keeps it in the air too long for the closed form, so the check runs on the arc/lob machines.
    for (const id of ["mbl-04", "mbl-03"]) {
      const still = shoot(id, 45, 4);
      const blown = shoot(id, 45, 4, EAST(26)).landingX - still.landingX;
      const expected = 0.5 * windKFor(getMobile(id)) * 24.7 * (still.flightMs / 1_000) ** 2;
      expect(blown / expected, id).toBeCloseTo(1, 1);
    }
  });

  it("TC-BAL-125: the same shot resolves twice to the same bits, in at most maxFlightMs / 25 points", () => {
    const first = shoot("mbl-03", 45, 4, EAST(26));
    const second = shoot("mbl-03", 45, 4, EAST(26));
    expect(second).toEqual(first);
    expect(second.steps).toBe(first.steps);
    expect(first.steps).toBeLessThanOrEqual(TUNABLES.maxFlightMs / 25);
    expect(TUNABLES.stepMs).toBe(25);
    expect(first.flightMs % 25).toBe(0);
  });

  it("TC-BAL-126: a machine without weight or drag resolves nothing and says why", () => {
    // AC4: a missing or non-finite stat is an error, never a default that quietly changes the arc.
    expect(() => gravityFor({ weight: undefined } as unknown as Pick<Mobile, "weight">)).toThrow(
      "cannot resolve a shot: the machine has no weight",
    );
    expect(() => gravityFor({ weight: Number.NaN })).toThrow("no weight");
    expect(() => windKFor({ windDrag: Number.POSITIVE_INFINITY })).toThrow("no windDrag");
    expect(() => windKFor({} as Pick<Mobile, "windDrag">)).toThrow("no windDrag");

    // Every shipped row carries both, so the guard never fires on real data.
    for (const mobile of MOBILES) {
      expect(Number.isFinite(gravityFor(mobile)), mobile.mobileId).toBe(true);
      expect(Number.isFinite(windKFor(mobile)), mobile.mobileId).toBe(true);
    }
  });

  it("TC-BAL-128: every machine crosses the spawn separation at four bar, and none overshoots the map by more than 3×", () => {
    expect(TUNABLES.mapWidth).toBe(2_000);
    for (const mobile of MOBILES) {
      const angle = Math.min(mobile.angleMax, Math.max(mobile.angleMin, 45));
      const flight = shoot(mobile.mobileId, angle, 4);
      // One bar and one muzzle for the roster, but a per-machine gravity: the reach comes from weight and aim band.
      expect(flight.landingX, mobile.mobileId).toBeGreaterThan(SEPARATION);
      expect(flight.landingX, mobile.mobileId).toBeLessThan(SEPARATION * 3);
      // The shell's own power stays inside the documented weapon band (`mobiles.md` § 3).
      for (const weapon of mobile.weapons) {
        expect(weapon.power, `${mobile.mobileId} power`).toBeGreaterThanOrEqual(150);
        expect(weapon.power, `${mobile.mobileId} power`).toBeLessThanOrEqual(650);
      }
    }
  });

  it("TC-CORE-029: a shot that leaves the map never lands", () => {
    // mbl-20 overshoots the 2,000-unit map at four bar: the miss path still resolves the turn instead of hanging.
    const flight = shoot("mbl-20", 45, 4, CALM, { bounds: MAP_BOUNDS });
    expect(flight.offMap).toBe(true);
    expect(flight.impact).toBeNull();
  });

  it("TC-CORE-913: a bouncing shell bounces on flat ground and a piercing shell crosses a hill", () => {
    const mobile = getMobile("mbl-03");
    const context = { wind: CALM, gravity: gravityFor(mobile), windK: windKFor(mobile) };
    const bounceWeapon = { ...mobile.weapons[0], shotClass: "bounce" as const };
    const bouncing = launch({
      id: 1,
      ownerSlot: 0,
      weaponSlot: 0,
      weapon: bounceWeapon,
      from: { x: 8, y: 820 },
      facing: 1,
      angle: 45,
      bar: 2,
    });
    const bounced = simulateFlight(bouncing, context, flat(), BOUNDS);
    expect(bounced.landingX).toBeGreaterThan(0);
    expect(bouncing.bouncesLeft).toBe(3);

    const ridge = flat();
    for (let i = 200; i < 260; i += 1) ridge.heights[i] = 700;
    const piercing = launch({
      id: 2,
      ownerSlot: 0,
      weaponSlot: 0,
      weapon: { ...mobile.weapons[0], shotClass: "piercing" as const },
      from: { x: 8, y: 820 },
      facing: 1,
      angle: 10,
      bar: 3.6,
    });
    const pierced = simulateFlight(piercing, context, ridge, BOUNDS);
    expect(pierced.landingX).toBeGreaterThan(520);
  });

  it("quantises positions, not velocities, so the wind stays linear in the magnitude", () => {
    // `roundTo` is the 0.1 position quantum that keeps a snapshot compact. Quantising `vx` as well would throw away
    // up to 20 % of the wind push and make the drift non-linear (`TC-BAL-124` promises it is linear).
    const mobile = getMobile("mbl-03");
    const projectile = launch({
      id: 1,
      ownerSlot: 0,
      weaponSlot: 0,
      weapon: mobile.weapons[0],
      from: { x: 0, y: 0 },
      facing: 1,
      angle: 30,
      bar: 2,
    });
    const stepped = stepProjectile(projectile, {
      wind: EAST(26),
      gravity: gravityFor(mobile),
      windK: windKFor(mobile),
    });
    // The step lands on the 0.1 grid…
    expect(Math.abs(stepped.x * 10 - Math.round(stepped.x * 10))).toBeLessThan(1e-6);
    expect(Math.abs(stepped.y * 10 - Math.round(stepped.y * 10))).toBeLessThan(1e-6);
    // …but `vx` takes the whole wind of this step (`k × 24.7 × 0.025`) instead of being snapped.
    expect(stepped.vx).toBeCloseTo(projectile.vx + windKFor(mobile) * 24.7 * 0.025, 9);
    expect(stepped.ageMs).toBe(25);
  });
});
