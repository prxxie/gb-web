import { describe, expect, it } from "vitest";
import { MOBILES, getMobile } from "../src/data/mobiles.js";
import { launch, simulateFlight, stepProjectile, windAcceleration } from "../src/ballistics.js";
import { TUNABLES } from "../src/tuning.js";
import type { Wind } from "../src/types.js";

/**
 * A flat probe wide enough to contain the whole flight.
 *
 * `simulateFlight` stops at `mapBounds`, so on the real 2,000 × 1,200 map a full-power shell reports where it
 * *left* the map instead of where it *lands*. The rebalance made that the normal case — the calibration shot now
 * flies 3,680 units — so every range assertion here is measured on a flat 120,000-unit plane with 120,000-unit
 * bounds, and the one test that is *about* the map passes the real bounds explicitly.
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
/** Sector 0 = east (`directionDeg 0`), GB's only two wind directions. */
const SEPARATION = 1_640; // map-01's spawn separation
const EAST = (magnitude: number): Wind => ({ magnitude, directionDeg: 0, sector: 0 });
/** Sector 1 = west (`directionDeg 180`). */
const WEST = (magnitude: number): Wind => ({ magnitude, directionDeg: 180, sector: 1 });

interface ShotOptions {
  /** Fire this mobile's shot 1 with another mobile, to hold the shell constant while the shooter varies. */
  readonly weaponFrom?: string;
  readonly bounds?: { width: number; height: number };
}

function shoot(mobileId: string, angle: number, force: number, wind: Wind = CALM, options: ShotOptions = {}) {
  const mobile = getMobile(mobileId);
  const projectile = launch({
    id: 1,
    ownerSlot: 0,
    weaponSlot: 0,
    weapon: getMobile(options.weaponFrom ?? mobileId).weapons[0],
    from: { x: 8, y: 820 },
    facing: 1,
    angle,
    force,
  });
  // One gravity for the whole roster (`tunables.md` § 1.1): no per-mobile term reaches the integrator.
  const flight = simulateFlight(projectile, { wind, gravity: TUNABLES.gravity }, flat(), options.bounds ?? BOUNDS);
  return { ...flight, mobile };
}

describe("ballistics", () => {
  it("TC-CORE-020: mbl-01 shot 1 at 45°, force 98, no wind lands at ~2,182 units in 5.35 s", () => {
    // Measured, not guessed: `v0 = 98 × 6.2 = 607.6` and `range = v0² / g = 3,692` before the 0.1 position
    // quantum takes its few units. The pre-rebalance pin was 1,986 units in 6.3 s (`speedK 4.55`, `g 105`).
    const flight = shoot("mbl-01", 45, 98);
    expect(flight.landingX).toBeCloseTo(2_182.4, 1);
    expect(flight.flightMs).toBe(5_350);
    expect(flight.steps).toBe(107);
    expect(flight.offMap).toBe(false);

    // One gravity, so the step is the same for every shell: `vy` grows by exactly `g × dt = 7.6 u/s` per 50 ms.
    expect(TUNABLES.gravity).toBe(152);
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
    const stepped = stepProjectile(projectile, { wind: CALM, gravity: TUNABLES.gravity });
    expect(stepped.vy - projectile.vy).toBeCloseTo(7.6, 10);

    // Run-to-run identity: the same inputs draw the same parabola.
    expect(shoot("mbl-01", 45, 98)).toEqual(flight);
  });

  it("TC-CORE-021: the sector sets the side and Δx grows monotonically with the magnitude", () => {
    // Force 40 at 45° hangs 3.5 s and stays inside the probe, so every one of these is a landing point, not a
    // truncated exit — which is what makes the drift readable rather than a boundary artefact.
    const calm = shoot("mbl-01", 45, 40);
    const drift = [5, 13, 20, 26].map((magnitude) => shoot("mbl-01", 45, 40, EAST(magnitude)).landingX - calm.landingX);
    expect(drift[0]).toBeGreaterThan(0);
    for (let index = 1; index < drift.length; index += 1) {
      expect(drift[index]!, `magnitude step ${index}`).toBeGreaterThan(drift[index - 1]!);
    }

    // Sector 1 is the other half of GB's wind: it pushes the same shot the other way.
    const upwind = shoot("mbl-01", 45, 40, WEST(26)).landingX - calm.landingX;
    expect(upwind).toBeLessThan(0);
  });

  it("TC-CORE-023: every mobile draws the same parabola and drifts by the same amount", () => {
    // Before the rebalance this case asserted a *premise the genre does not have*: `mbl-13` (`mass 118`) drifted
    // further than `mbl-03` (`mass 169`) because the wind was divided by mass. GB has one gravity for the roster and
    // a wind that pushes every mobile alike, so the arc and the drift belong to the angle, the power and the weather
    // — never to the mobile. At the same angle and power the old light/heavy pair is now pixel-identical.
    const light = "mbl-13"; // the old mass-118 mobile
    const heavy = "mbl-03"; // the old mass-169 mobile
    const calmLight = shoot(light, 20, 60);
    const calmHeavy = shoot(heavy, 20, 60);
    expect(calmLight.landingX).toBe(521.7);
    expect(calmHeavy.landingX).toBe(calmLight.landingX);
    expect(calmHeavy.flightMs).toBe(calmLight.flightMs);

    // Same wind, same drift: 32.4 units for both, whatever their angle window and shell.
    const driftLight = shoot(light, 20, 60, EAST(26)).landingX - calmLight.landingX;
    const driftHeavy = shoot(heavy, 20, 60, EAST(26)).landingX - calmHeavy.landingX;
    expect(driftLight).toBeCloseTo(32.4, 1);
    expect(driftHeavy).toBeCloseTo(driftLight, 6);

    // The property is roster-wide: every mobile that may fire at 20° with a plain shell lands in the same spot and
    // drifts the same distance. A returning per-mobile gravity or mass term breaks this at once.
    const plain = MOBILES.filter(
      (mobile) =>
        !["bounce", "piercing"].includes(mobile.weapons[0].shotClass) &&
        mobile.angleMin <= 20 &&
        mobile.angleMax >= 20,
    );
    expect(plain.length).toBeGreaterThanOrEqual(8);
    for (const mobile of plain) {
      const still = shoot(mobile.mobileId, 20, 60);
      expect(still.landingX, `${mobile.mobileId} calm`).toBe(521.7);
      expect(still.flightMs, `${mobile.mobileId} hang time`).toBe(1_550);
      const windy = shoot(mobile.mobileId, 20, 60, EAST(26));
      expect(windy.landingX - still.landingX, `${mobile.mobileId} drift`).toBeCloseTo(32.4, 1);
    }
  });

  it("TC-CORE-925: the wind push is the weather's alone — no mass term, no vertical component", () => {
    // `windAcceleration(wind, coefficient?)` lost its `mass` parameter: one wind reading is one push for the whole
    // roster (`tunables.md` § 1.1), which is what makes a wind count transferable between mobiles in GB.
    // `0.8 × 26 = 20.8 u/s²` — a fifth of gravity, and no divisor anywhere in the formula.
    expect(windAcceleration(EAST(26)).ax).toBeCloseTo(26, 10);
    expect(windAcceleration(EAST(26)).ay).toBeCloseTo(0, 10); // `-0` for a horizontal wind, i.e. no vertical term
    expect(windAcceleration(WEST(26)).ax).toBeCloseTo(-26, 10);
    expect(windAcceleration(WEST(26)).ay).toBeCloseTo(0, 10);

    // Horizontal only: neither direction touches `vy`, so wind can never make a shell hang. The general formula
    // keeps its shape for a map gimmick that ever needs vertical wind (`θ = 270°` blows from the north, upward).
    expect(windAcceleration({ magnitude: 26, directionDeg: 270, sector: 0 }).ay).toBeGreaterThan(0);

    // The coefficient is the only scale factor: half of it is half the push.
    expect(windAcceleration(EAST(26), TUNABLES.windCoefficient / 2).ax).toBeCloseTo(13, 10);
  });

  it("TC-CORE-011: a different tunables file produces a different trajectory", () => {
    const mobile = getMobile("mbl-01");
    // `v0 = force × speedK`, so scaling `force` by the `speedK` ratio reproduces the trajectory the other tunables
    // file would draw.
    const make = (speedK: number) =>
      launch({
        id: 1,
        ownerSlot: 0,
        weaponSlot: 0,
        weapon: mobile.weapons[0],
        from: { x: 8, y: 820 },
        facing: 1,
        angle: 45,
        force: 98 * (speedK / TUNABLES.speedK),
      });
    const context = { wind: CALM, gravity: TUNABLES.gravity };
    const slow = simulateFlight(make(4.0), context, flat(), BOUNDS);
    const fast = simulateFlight(make(5.0), context, flat(), BOUNDS);
    expect(fast.landingX).toBeGreaterThan(slow.landingX);
  });

  it("TC-CORE-029: a shot that leaves the map never lands", () => {
    // The real `map-01` bounds, not the probe. After the retune a mobile's own `maxPower` no longer throws the shell
    // out of the window (`TC-CORE-924`), so the case fires past it on purpose: the miss path still has to resolve the
    // turn instead of hanging on `maxFlightMs`.
    const flight = shoot("mbl-01", 45, 200, EAST(26), { bounds: MAP_BOUNDS });
    expect(flight.offMap).toBe(true);
    expect(flight.impact).toBeNull();
  });

  it("TC-CORE-913: a bouncing shell bounces on flat ground and a piercing shell crosses a hill", () => {
    const mobile = getMobile("mbl-01");
    const context = { wind: CALM, gravity: TUNABLES.gravity };
    const bounceWeapon = { ...mobile.weapons[0], shotClass: "bounce" as const };
    const bouncing = launch({
      id: 1,
      ownerSlot: 0,
      weaponSlot: 0,
      weapon: bounceWeapon,
      from: { x: 8, y: 820 },
      facing: 1,
      angle: 45,
      force: 40,
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
      force: 90,
    });
    const pierced = simulateFlight(piercing, context, ridge, BOUNDS);
    expect(pierced.landingX).toBeGreaterThan(520);
  });

  it("TC-CORE-924: every mobile reaches across the map at maxPower on a flat probe", () => {
    expect(TUNABLES.mapWidth).toBe(2_000);
    for (const mobile of MOBILES) {
      const angle = Math.min(mobile.angleMax, Math.max(mobile.angleMin, 45));
      const flight = shoot(mobile.mobileId, angle, mobile.maxPower);
      // One gravity and one power law, so the roster's spread comes from the aim band alone. The genre's own ceiling
      // is that full power overshoots the enemy without leaving the map: every mobile throws at least 1.05× the
      // spawn separation and none more than 2.2×, so the top of the bar is a real choice and not the only option.
      expect(flight.landingX, mobile.mobileId).toBeGreaterThan(SEPARATION * 1.05);
      expect(flight.landingX, mobile.mobileId).toBeLessThan(SEPARATION * 2.2);
      for (const weapon of mobile.weapons) {
        expect(weapon.power, `${mobile.mobileId} power`).toBeGreaterThanOrEqual(150);
        expect(weapon.power, `${mobile.mobileId} power`).toBeLessThanOrEqual(650);
      }
    }
  });

  it("quantises positions, not velocities, so the wind stays linear in the magnitude", () => {
    // `roundTo` is the 0.1 position quantum that keeps a snapshot compact. Quantising `vx` as well would throw away
    // up to 20 % of the wind push and make the drift non-linear (`TC-CORE-023` promises it is linear).
    const mobile = getMobile("mbl-01");
    const projectile = launch({
      id: 1,
      ownerSlot: 0,
      weaponSlot: 0,
      weapon: mobile.weapons[0],
      from: { x: 0, y: 0 },
      facing: 1,
      angle: 30,
      force: 50,
    });
    const stepped = stepProjectile(projectile, { wind: EAST(26), gravity: TUNABLES.gravity });
    // The step lands on the 0.1 grid…
    expect(Math.abs(stepped.x * 10 - Math.round(stepped.x * 10))).toBeLessThan(1e-6);
    expect(Math.abs(stepped.y * 10 - Math.round(stepped.y * 10))).toBeLessThan(1e-6);
    // …but `vx` takes the whole 1.04 u/s of this step's wind (`20.8 × 0.05`) instead of being snapped.
    expect(stepped.vx).toBeCloseTo(projectile.vx + 1.3, 9);
    expect(stepped.ageMs).toBe(50);
  });
});
