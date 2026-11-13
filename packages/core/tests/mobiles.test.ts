import { describe, expect, it } from "vitest";
import { MOBILES, damagePerDelay, getMobile, isMobileId, resolveMobileId } from "../src/data/mobiles.js";
import {
  gravityFor,
  launch,
  simulateFlight,
  splitCluster,
  stepProjectile,
  windAcceleration,
  windKFor,
} from "../src/ballistics.js";
import { createTerrain } from "../src/terrain.js";
import { createMatch } from "../src/match.js";
import { TUNABLES } from "../src/tuning.js";
import type { Archetype, Effect, Mobile, ShotClass, TrajectoryProfile, Wind } from "../src/types.js";

const CALM: Wind = { magnitude: 0, directionDeg: 0, sector: 0 };

function flat(width: number = TUNABLES.mapWidth, height = 820) {
  const terrain = createTerrain("map-01");
  terrain.heights.fill(height);
  return { ...terrain, width };
}

/**
 * `docs/02-reference/data/mobiles.md` § 4 measures on a plane wide enough that the shell lands instead of being
 * clamped at the map edge — a calm max-power shot already reaches ~3,680 units on a 2,000-unit map.
 */
const PROBE_WIDTH = 60_000;
const PROBE_BOUNDS = { width: PROBE_WIDTH, height: 4000 };

type StatRow = readonly [
  mobileId: string,
  name: string,
  archetype: Archetype,
  trajectory: TrajectoryProfile,
  angleMin: number,
  angleMax: number,
  maxHp: number,
  maxShield: number,
  shieldRegen: number,
  defense: number,
  energy: number,
  baseDelay: number,
  weight: number,
  windDrag: number,
  moveDistance: number,
  maxMovesPerTurn: number,
  runMultiplier: number,
  moveEnergy: number,
  moveDelay: number,
  maxIncline: number,
  effect: Effect,
];

/** `docs/02-reference/data/mobiles.md` § 1–§ 2, one row per mobile. */
const STATS: readonly StatRow[] = [
  ["mbl-01", "Stone Sentinel", "balanced", "standard", "warded", -10, 45, 1050, 150, 20, 1.0, 105, 100, 7.5, 0.072, 88, 1, 1.5, 12, 12, 35, "explosion"],
  ["mbl-02", "River Warden", "support", "lobber", "warded", 38, 82, 1000, 300, 40, 0.9, 100, 110, 5.33, 0.0512, 85, 2, 1.7, 9, 10, 32, "impact"],
  ["mbl-03", "Iron Tortoise", "tank", "skimmer", "plated", -8, 38, 1200, 200, 20, 1.15, 80, 120, 5.78, 0.0555, 60, 1, 1.5, 14, 14, 25, "explosion"],
  ["mbl-04", "Glacier Mammoth", "tank", "lobber", "plated", 30, 88, 1150, 250, 30, 1.12, 85, 118, 4.8, 0.046, 65, 1, 1.6, 12, 13, 22, "impact"],
  ["mbl-05", "Storm Falcon", "sniper", "direct", "bionic", -20, 25, 925, 0, 0, 0.9, 120, 95, 5, 0.048, 100, 2, 1.7, 10, 9, 40, "laser"],
  ["mbl-07", "Ash Behemoth", "bombardier", "mortar", "plated", 45, 88, 1100, 100, 0, 1.0, 90, 115, 6.5, 0.0624, 70, 1, 1.5, 13, 13, 30, "explosion"],
  ["mbl-09", "Moon Hare", "bouncer", "skimmer", "bionic", -5, 45, 975, 100, 10, 0.95, 115, 105, 5.33, 0.0512, 95, 2, 1.8, 8, 9, 38, "impact"],
  ["mbl-10", "Coral Crab", "bouncer", "skimmer", "bionic", 0, 42, 990, 120, 10, 0.96, 112, 103, 4.8, 0.046, 92, 2, 1.6, 9, 10, 36, "laser"],
  ["mbl-11", "Pale Stag", "all-rounder", "standard", "warded", -12, 42, 1020, 280, 40, 0.92, 102, 108, 5.78, 0.0555, 86, 2, 1.7, 9, 10, 33, "impact"],
  ["mbl-12", "Sacred Crane", "support", "standard", "warded", -8, 48, 980, 260, 30, 0.9, 104, 106, 5.5, 0.0528, 88, 2, 1.7, 10, 10, 34, "laser"],
  ["mbl-13", "Cinder Fox", "glass", "direct", "bionic", -18, 28, 900, 0, 0, 0.85, 130, 90, 4.2, 0.0403, 110, 2, 1.9, 8, 8, 42, "explosion"],
  ["mbl-14", "Sky Serpent", "glass", "direct", "bionic", -16, 32, 920, 0, 0, 0.86, 128, 92, 4.9, 0.047, 108, 2, 1.9, 8, 8, 44, "laser"],
  ["mbl-15", "Jade Dragon", "balanced", "standard", "warded", -10, 50, 1050, 150, 20, 1.05, 105, 100, 4.2, 0.0403, 88, 2, 1.7, 10, 10, 35, "explosion"],
  ["mbl-17", "Sand Wyrm", "zoner", "mortar", "plated", 48, 88, 1025, 150, 10, 1.0, 100, 110, 6.5, 0.0624, 80, 1, 1.6, 12, 12, 33, "impact"],
  ["mbl-18", "Frost Hydra", "zoner", "mortar", "plated", 42, 86, 1040, 120, 10, 1.02, 98, 112, 6, 0.058, 78, 1, 1.6, 12, 13, 31, "impact"],
  ["mbl-19", "Shadow Cat", "trickster", "skimmer", "bionic", -8, 44, 950, 100, 10, 0.95, 125, 95, 4.8, 0.046, 105, 2, 1.8, 8, 9, 40, "electric"],
  ["mbl-20", "Mist Raven", "trickster", "direct", "bionic", -20, 35, 940, 80, 10, 0.94, 128, 93, 4.8, 0.095, 108, 2, 1.8, 8, 9, 41, "electric"],
];

type WeaponRow = readonly [mobileId: string, weapons: readonly (readonly [ShotClass, number, number, number])[]];

/** `docs/02-reference/data/mobiles.md` § 3: class, inner-tier power, radius, queue delay. */
const WEAPONS: readonly WeaponRow[] = [
  ["mbl-01", [["arc", 240, 80, 100], ["flat", 220, 70, 110], ["arc", 500, 110, 200]]],
  ["mbl-02", [["arc", 220, 85, 100], ["lob", 210, 95, 115], ["cluster", 460, 120, 200]]],
  ["mbl-03", [["arc", 250, 90, 105], ["bounce", 240, 80, 120], ["arc", 520, 120, 200]]],
  ["mbl-04", [["lob", 250, 95, 112], ["bounce", 230, 82, 118], ["arc", 510, 118, 200]]],
  ["mbl-05", [["flat", 260, 60, 100], ["piercing", 280, 55, 115], ["beam", 480, 40, 200]]],
  ["mbl-07", [["lob", 260, 100, 110], ["cluster", 240, 90, 120], ["lob", 550, 130, 200]]],
  ["mbl-09", [["bounce", 240, 80, 100], ["flat", 220, 65, 110], ["bounce", 500, 110, 200]]],
  ["mbl-10", [["bounce", 230, 78, 102], ["arc", 220, 70, 112], ["beam", 470, 45, 198]]],
  ["mbl-11", [["arc", 230, 85, 100], ["flat", 200, 70, 110], ["cluster", 460, 120, 200]]],
  ["mbl-12", [["arc", 210, 82, 102], ["beam", 260, 40, 120], ["cluster", 450, 118, 200]]],
  ["mbl-13", [["flat", 300, 60, 95], ["arc", 280, 70, 110], ["arc", 580, 90, 195]]],
  ["mbl-14", [["flat", 290, 58, 96], ["cluster", 270, 85, 118], ["beam", 560, 44, 196]]],
  ["mbl-15", [["arc", 250, 80, 100], ["piercing", 270, 60, 118], ["arc", 510, 115, 200]]],
  ["mbl-17", [["lob", 240, 95, 108], ["piercing", 260, 60, 120], ["cluster", 500, 125, 200]]],
  ["mbl-18", [["lob", 240, 96, 110], ["arc", 250, 80, 112], ["lob", 530, 130, 200]]],
  ["mbl-19", [["bounce", 230, 70, 98], ["cluster", 220, 85, 116], ["arc", 460, 100, 195]]],
  ["mbl-20", [["bounce", 220, 70, 98], ["beam", 250, 42, 118], ["beam", 450, 38, 196]]],
];

type FlightRow = readonly [
  mobileId: string,
  angle: number,
  range: number,
  seconds: number,
  drift: number,
];

/**
 * `docs/02-reference/data/mobiles.md` § 4: four bar, dead calm, flat probe, first ground contact; the drift column is
 * the same shot in a `10` wind on sector 0 (east) measured on the same probe. Gravity and wind drag are per machine
 * (`US-BAL-004` AC1/AC2), so the table is the roster's identity, not one arc printed twice.
 */
const FLIGHT: readonly FlightRow[] = [
  ["mbl-01", 45, 1696, 2.6, 242],
  ["mbl-02", 45, 2389, 3.7, 342],
  ["mbl-03", 38, 2138, 2.9, 237],
  ["mbl-04", 45, 2654, 4.1, 380],
  ["mbl-05", 25, 1953, 2.3, 124],
  ["mbl-07", 45, 1958, 3, 280],
  ["mbl-09", 45, 2389, 3.7, 342],
  ["mbl-10", 42, 2648, 3.8, 331],
  ["mbl-11", 42, 2198, 3.2, 275],
  ["mbl-12", 45, 2315, 3.5, 332],
  ["mbl-13", 28, 2512, 3.1, 191],
  ["mbl-14", 32, 2336, 3, 207],
  ["mbl-15", 45, 3034, 4.6, 435],
  ["mbl-17", 48, 1946, 3.1, 312],
  ["mbl-18", 45, 2122, 3.2, 306],
  ["mbl-19", 44, 2655, 4, 364],
  ["mbl-20", 35, 2491, 3.3, 513],
];

/** Gravity and the wind coefficient come from the machine, so a shot is a function of `(mobile, angle, bar)`. */
function shoot(mobileId: string, angle: number, bar: number, wind: Wind = CALM, weaponSlot: 0 | 1 | 2 = 0) {
  const mobile = getMobile(mobileId);
  const projectile = launch({
    id: 1,
    ownerSlot: 0,
    weaponSlot,
    weapon: mobile.weapons[weaponSlot],
    from: { x: 8, y: 820 },
    facing: 1,
    angle,
    bar,
  });
  return simulateFlight(
    projectile,
    { wind, gravity: gravityFor(mobile), windK: windKFor(mobile) },
    flat(PROBE_WIDTH),
    PROBE_BOUNDS,
    {
    firstGroundImpact: true,
  });
}

/** The first 40 steps of a flight, as `[x, y]` pairs — the parabola itself, not just its landing point. */
function path(mobileId: string, angle: number, bar: number, weaponFrom = mobileId): number[] {
  const mobile = getMobile(mobileId);
  const shooter = getMobile(weaponFrom);
  let projectile = launch({
    id: 1,
    ownerSlot: 0,
    weaponSlot: 0,
    weapon: shooter.weapons[0],
    from: { x: 8, y: 820 },
    facing: 1,
    angle,
    bar,
  });
  const points: number[] = [projectile.x, projectile.y];
  for (let step = 0; step < 40; step += 1) {
    projectile = stepProjectile(projectile, { wind: CALM, gravity: gravityFor(mobile), windK: windKFor(mobile) });
    points.push(projectile.x, projectile.y);
  }
  return points;
}

describe("mobiles", () => {
  it("TC-BAL-129: the seventeen documented mobiles load with the exact stats", () => {
    expect(MOBILES).toHaveLength(17);
    expect(MOBILES.map((mobile) => mobile.mobileId)).toEqual(STATS.map((row) => row[0]));
    for (const row of STATS) {
      const [mobileId, name, archetype, trajectory, armor, angleMin, angleMax] = row;
      const mobile = getMobile(mobileId);
      expect(
        [mobile.mobileId, mobile.name, mobile.archetype, mobile.trajectory, mobile.armor, mobile.angleMin, mobile.angleMax],
        `${mobileId} identity`,
      ).toEqual([mobileId, name, archetype, trajectory, armor, angleMin, angleMax]);
      expect(
        [
          mobile.maxHp,
          mobile.maxShield,
          mobile.shieldRegen,
          mobile.defense,
          mobile.energy,
          mobile.baseDelay,
          mobile.weight,
          mobile.windDrag,
        ],
        `${mobileId} stats`,
      ).toEqual(row.slice(7, 15));
      expect(
        [
          mobile.moveDistance,
          mobile.maxMovesPerTurn,
          mobile.runMultiplier,
          mobile.moveEnergy,
          mobile.moveDelay,
          mobile.maxIncline,
          mobile.effect,
        ],
        `${mobileId} movement`,
      ).toEqual(row.slice(15, 22));
    }
  });

  it("TC-BAL-130: every mobile carries its own weight and drag inside the reference clamps", () => {
    // `weight` and `windDrag` are required fields now (`US-BAL-005` AC1), and the old per-machine power cap is gone.
    for (const mobile of MOBILES) {
      expect("gravity" in mobile, `${mobile.mobileId} gravity field`).toBe(false);
      expect("mass" in mobile, `${mobile.mobileId} mass field`).toBe(false);
      expect("maxPower" in mobile, `${mobile.mobileId} maxPower field`).toBe(false);
      expect(Number.isFinite(mobile.weight), `${mobile.mobileId} weight`).toBe(true);
      expect(mobile.weight, `${mobile.mobileId} weight`).toBeGreaterThanOrEqual(4.2);
      expect(mobile.weight, `${mobile.mobileId} weight`).toBeLessThanOrEqual(7.5);
      expect(Number.isFinite(mobile.windDrag), `${mobile.mobileId} drag`).toBe(true);
      expect(mobile.windDrag, `${mobile.mobileId} drag`).toBeGreaterThanOrEqual(0.0403);
      expect(mobile.windDrag, `${mobile.mobileId} drag`).toBeLessThanOrEqual(0.095);
      expect(mobile.maxHp, `${mobile.mobileId} hp`).toBeGreaterThanOrEqual(900);
      expect(mobile.maxHp, `${mobile.mobileId} hp`).toBeLessThanOrEqual(1200);
      expect(mobile.maxShield, `${mobile.mobileId} shield`).toBeGreaterThanOrEqual(0);
      expect(mobile.maxShield, `${mobile.mobileId} shield`).toBeLessThanOrEqual(300);
      expect(mobile.shieldRegen, `${mobile.mobileId} regen`).toBeGreaterThanOrEqual(0);
      expect(mobile.shieldRegen, `${mobile.mobileId} regen`).toBeLessThanOrEqual(mobile.maxShield);
      expect(mobile.defense, `${mobile.mobileId} defense`).toBeGreaterThanOrEqual(0.85);
      expect(mobile.defense, `${mobile.mobileId} defense`).toBeLessThanOrEqual(1.15);
      expect(mobile.energy, `${mobile.mobileId} energy`).toBeGreaterThanOrEqual(80);
      expect(mobile.energy, `${mobile.mobileId} energy`).toBeLessThanOrEqual(130);
      expect(mobile.baseDelay, `${mobile.mobileId} base delay`).toBeGreaterThanOrEqual(80);
      expect(mobile.baseDelay, `${mobile.mobileId} base delay`).toBeLessThanOrEqual(130);
      expect(mobile.moveDistance, `${mobile.mobileId} move`).toBeGreaterThanOrEqual(60);
      expect(mobile.moveDistance, `${mobile.mobileId} move`).toBeLessThanOrEqual(110);
      expect([1, 2], `${mobile.mobileId} moves per turn`).toContain(mobile.maxMovesPerTurn);
      expect(mobile.runMultiplier, `${mobile.mobileId} run`).toBeGreaterThanOrEqual(1.5);
      expect(mobile.runMultiplier, `${mobile.mobileId} run`).toBeLessThanOrEqual(1.9);
      expect(mobile.moveEnergy, `${mobile.mobileId} move energy`).toBeGreaterThanOrEqual(8);
      expect(mobile.moveEnergy, `${mobile.mobileId} move energy`).toBeLessThanOrEqual(14);
      expect(mobile.moveDelay, `${mobile.mobileId} move delay`).toBeGreaterThanOrEqual(8);
      expect(mobile.moveDelay, `${mobile.mobileId} move delay`).toBeLessThanOrEqual(14);
      expect(mobile.maxIncline, `${mobile.mobileId} incline`).toBeGreaterThanOrEqual(22);
      expect(mobile.maxIncline, `${mobile.mobileId} incline`).toBeLessThanOrEqual(44);
      expect(mobile.angleMin, `${mobile.mobileId} angle`).toBeGreaterThanOrEqual(-20);
      expect(mobile.angleMax, `${mobile.mobileId} angle`).toBeLessThanOrEqual(88);
    }
    // The drop leaves single-machine archetypes (the sniper, the bombardier, the all-rounder) where pairs remain.
    const counts = new Map<Archetype, number>();
    for (const mobile of MOBILES) counts.set(mobile.archetype, (counts.get(mobile.archetype) ?? 0) + 1);
    expect([...counts.values()]).toEqual([2, 2, 2, 1, 1, 2, 1, 2, 2, 2]);
  });

  it("TC-CORE-912: each weapon slot fires its documented class, power and radius", () => {
    for (const [mobileId, weapons] of WEAPONS) {
      const mobile = getMobile(mobileId);
      expect(mobile.weapons, `${mobileId} weapon count`).toHaveLength(3);
      weapons.forEach(([shotClass, power, radius, delay], index) => {
        const weapon = mobile.weapons[index]!;
        expect([weapon.shotClass, weapon.power, weapon.radius, weapon.delay], `${mobileId} slot ${index + 1}`).toEqual([
          shotClass,
          power,
          radius,
          delay,
        ]);
        expect(weapon.id, `${mobileId} slot ${index + 1} id`).toBe(`${mobileId}-s${index + 1}`);
        expect("density" in weapon, `${mobileId} slot ${index + 1} density`).toBe(false);
        const projectile = launch({
          id: 1,
          ownerSlot: 0,
          weaponSlot: index as 0 | 1 | 2,
          weapon,
          from: { x: 8, y: 820 },
          facing: 1,
          angle: 45,
          bar: 4,
        });
        expect(
          [projectile.shotClass, projectile.power, projectile.radius],
          `${mobileId} slot ${index + 1} projectile`,
        ).toEqual([shotClass, power, radius]);
      });
    }
  });

  it("TC-CORE-912: a cluster shot splits into three shells carrying the parent id", () => {
    const mobile = getMobile("mbl-02");
    const parent = launch({
      id: 1,
      ownerSlot: 0,
      weaponSlot: 2,
      weapon: mobile.weapons[2],
      from: { x: 8, y: 820 },
      facing: 1,
      angle: 45,
      bar: 4,
    });
    const shells = splitCluster(parent, [10, -10, 0]);
    expect(shells).toHaveLength(3);
    for (const shell of shells) {
      expect(shell.parentId).toBe(parent.id);
      expect([shell.power, shell.radius]).toEqual([parent.power, parent.radius]);
    }
  });

  it("TC-CORE-935: gravity is the machine's own — same weight draws the same arc, another weight does not", () => {
    // `US-BAL-004` AC1 replaced the roster-wide 152 u/s²: `g = 390 × weight / 5.78`. Equal weights trace the same
    // curve when the shell is held constant, and the heavy/light pair no longer matches at all.
    const ANGLE = 30;
    const BAR = 2.4;
    const reference = path("mbl-03", ANGLE, BAR, "mbl-01"); // 5.78
    expect(path("mbl-11", ANGLE, BAR, "mbl-01"), "5.78 twins").toEqual(reference);
    expect(path("mbl-13", ANGLE, BAR, "mbl-01"), "4.20 twin").toEqual(path("mbl-15", ANGLE, BAR, "mbl-01"));
    expect(path("mbl-01", ANGLE, BAR, "mbl-01"), "7.50 differs").not.toEqual(reference);
    expect(gravityFor(getMobile("mbl-01"))).toBeGreaterThan(gravityFor(getMobile("mbl-03")));
    expect(gravityFor(getMobile("mbl-13"))).toBeLessThan(gravityFor(getMobile("mbl-03")));

    // The shot's own shell is the third axis: seventeen distinct three-slot loadouts remain after the drop.
    const loadouts = new Set(
      MOBILES.map((mobile) => mobile.weapons.map((weapon) => `${weapon.shotClass}/${weapon.power}/${weapon.radius}`).join("|")),
    );
    expect(loadouts.size).toBe(MOBILES.length);

    // The bar moves the reach for everyone, and it is the same 0…4 range for every machine.
    const short = shoot("mbl-03", ANGLE, 2);
    const full = shoot("mbl-03", ANGLE, 4);
    expect(full.landingX - short.landingX).toBeGreaterThan(500);
  });

  it("TC-CORE-925: the wind coefficient is the machine's own — same drag drifts alike, more drag drifts further", () => {
    const ANGLE = 30;
    const BAR = 2.4;
    const east: Wind = { magnitude: 10, directionDeg: 0, sector: 0 };
    const west: Wind = { magnitude: 10, directionDeg: 180, sector: 1 };

    // The wind enters the integrator as a plain acceleration with the machine's own coefficient in it (`AC2`).
    const acceleration = windAcceleration(east, windKFor(getMobile("mbl-03")));
    expect(acceleration.ax).toBeCloseTo(windKFor(getMobile("mbl-03")) * 10 * 0.95, 9);
    expect(acceleration.ay).toBeCloseTo(0, 9);
    expect(windAcceleration(west, windKFor(getMobile("mbl-03"))).ax).toBeCloseTo(-acceleration.ax, 9);
    expect(windAcceleration(CALM, windKFor(getMobile("mbl-03"))).ax).toBe(0);

    // Machines with the same drag drift alike; a machine with twice the drag drifts about twice as far at the same
    // hang time. mbl-04 and mbl-20 share weight 4.80, so only their drag separates them.
    const drift = (mobileId: string) =>
      shoot(mobileId, ANGLE, BAR, east).landingX - shoot(mobileId, ANGLE, BAR).landingX;
    expect(drift("mbl-03")).toBe(drift("mbl-11")); // both 0.0555
    expect(drift("mbl-04")).toBe(drift("mbl-10")); // both 4.80 / 0.0460
    expect(drift("mbl-20")).toBeGreaterThan(drift("mbl-04")); // 0.0950 vs 0.0460

    // The drift is `½ · k · (m × 0.95) · t²` for the shot's own hang time, machine by machine.
    for (const mobile of MOBILES) {
      const calm = shoot(mobile.mobileId, ANGLE, BAR);
      const closedForm = 0.5 * windKFor(mobile) * 10 * 0.95 * (calm.flightMs / 1000) ** 2;
      expect(drift(mobile.mobileId) / closedForm, `${mobile.mobileId} drift`).toBeGreaterThan(0.95);
      expect(drift(mobile.mobileId) / closedForm, `${mobile.mobileId} drift`).toBeLessThanOrEqual(1.05);
    }
  });

  it("TC-CORE-923: the two mobiles in each archetype sit within ten percent on damage per delay", () => {
    const byArchetype = new Map<Archetype, Mobile[]>();
    for (const mobile of MOBILES) {
      byArchetype.set(mobile.archetype, [...(byArchetype.get(mobile.archetype) ?? []), mobile]);
    }
    expect([...byArchetype.values()].every((pair) => pair.length === 1 || pair.length === 2)).toBe(true);
    for (const [archetype, pair] of byArchetype) {
      if (pair.length < 2) continue; // the sniper, the bombardier and the all-rounder lost their twin
      const [a, b] = pair as [Mobile, Mobile];
      const metricA = a.weapons[0].power / a.weapons[0].delay;
      const metricB = b.weapons[0].power / b.weapons[0].delay;
      expect(
        Math.abs(metricA - metricB) / Math.max(metricA, metricB),
        `${archetype} damage per delay`,
      ).toBeLessThanOrEqual(0.1);
    }
    expect(getMobile("mbl-12").weapons[0].power / getMobile("mbl-12").weapons[0].delay).toBeCloseTo(2.06, 2);
    expect(getMobile("mbl-13").weapons[0].power / getMobile("mbl-13").weapons[0].delay).toBeCloseTo(3.16, 2);

    const helperMismatch = MOBILES.filter((mobile) => {
      const documented = mobile.weapons[0].power / mobile.weapons[0].delay;
      return Math.abs(damagePerDelay(mobile) - documented) > 1e-9;
    }).map((mobile) => mobile.mobileId);
    expect.soft(helperMismatch, "damagePerDelay must be shot 1 power ÷ delay, as §7 defines it").toEqual([]);
  });

  it("TC-BAL-136: every mobile at four bar lands and drifts where the flat-probe table says", () => {
    const rangeMisses: string[] = [];
    const hangMisses: string[] = [];
    const driftMisses: string[] = [];
    const angleMisses: string[] = [];
    for (const [mobileId, documentedAngle, range, seconds, drift] of FLIGHT) {
      const mobile = getMobile(mobileId);
      const angle = Math.min(mobile.angleMax, Math.max(mobile.angleMin, documentedAngle));
      if (angle !== documentedAngle) angleMisses.push(`${mobileId}: docs ${documentedAngle}°, window max ${mobile.angleMax}°`);
      const result = shoot(mobileId, angle, 4);
      if (result.impact === null || Math.abs(result.landingX - range) > 1) {
        rangeMisses.push(
          `${mobileId}: expected ${range}, got ${result.impact === null ? "no impact" : result.landingX.toFixed(1)}`,
        );
      }
      if (Math.abs(result.flightMs - seconds * 1000) > 100) {
        hangMisses.push(`${mobileId}: expected ${seconds * 1000}, got ${result.flightMs}`);
      }
      const pushed = shoot(mobileId, angle, 4, { magnitude: 10, directionDeg: 0, sector: 0 });
      const measured = pushed.landingX - result.landingX;
      if (Math.abs(measured - drift) > 1) driftMisses.push(`${mobileId}: expected ${drift}, got ${measured.toFixed(1)}`);
    }
    expect.soft(angleMisses, "documented angle must fit the mobile's window").toEqual([]);
    expect.soft(rangeMisses, "landing within ±1 unit of §4").toEqual([]);
    expect.soft(hangMisses, "hang within ±0.1 s of §4").toEqual([]);
    expect.soft(driftMisses, "drift in a 10/0 wind within ±1 unit of §4").toEqual([]);
  });

  it("TC-BAL-133: a stored pick naming a dropped id falls back to the first machine, never undefined", () => {
    // A pick outlives a roster edit: the room, the match plan and the profile all persist a `mobileId`, so a dropped
    // one has to resolve to a real row instead of seating a seat on `undefined` (`US-BAL-005` AC5/§ 5).
    expect(MOBILES[0]?.mobileId).toBe("mbl-01");
    for (const stale of ["mbl-06", "mbl-08", "mbl-16", "", "not-a-mobile"]) {
      expect(isMobileId(stale)).toBe(false);
      expect(resolveMobileId(stale)).toBe("mbl-01");
    }
    expect(resolveMobileId(null)).toBe("mbl-01");
    expect(resolveMobileId(undefined)).toBe("mbl-01");

    // A live id is kept, so the fallback only rescues what it has to.
    expect(resolveMobileId("mbl-13")).toBe("mbl-13");

    // And the match itself accepts the stale seat: it seats the first machine and never throws.
    const state = createMatch({
      matchId: "m-stale",
      roomCode: "ABC234",
      seed: 3,
      mode: "solo",
      mapId: "map-01",
      seats: [
        { slot: 0, team: "A", accountId: "a", displayName: "A", mobileId: "mbl-16", loadout: {} },
        { slot: 1, team: "B", accountId: "b", displayName: "B", mobileId: "mbl-02", loadout: {} },
      ],
      now: 1_700_000_000_000,
    });
    expect(state.players[0]?.mobileId).toBe("mbl-01");
    expect(state.players[1]?.mobileId).toBe("mbl-02");
  });

  it("TC-BAL-134: the seventeen surviving ids keep their numbers and their order", () => {
    // Deleting three rows must not renumber anything: a persisted pick, a rating history row and a replay all name a
    // machine by id, so `mbl-17` stays Sand Wyrm rather than shifting into a vacated slot (`US-BAL-005` AC4).
    expect(MOBILES.map((mobile) => mobile.mobileId)).toEqual([
      "mbl-01",
      "mbl-02",
      "mbl-03",
      "mbl-04",
      "mbl-05",
      "mbl-07",
      "mbl-09",
      "mbl-10",
      "mbl-11",
      "mbl-12",
      "mbl-13",
      "mbl-14",
      "mbl-15",
      "mbl-17",
      "mbl-18",
      "mbl-19",
      "mbl-20",
    ]);
    for (const [index, mobile] of MOBILES.entries()) {
      expect(mobile.mobileId, `row ${index} name`).toBe(`mbl-${String(mobile.mobileId.slice(4))}`);
    }
  });
});
