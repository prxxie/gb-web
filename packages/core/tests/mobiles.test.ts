import { describe, expect, it } from "vitest";
import { MOBILES, damagePerDelay, getMobile } from "../src/data/mobiles.js";
import { launch, simulateFlight, splitCluster, stepProjectile, windAcceleration } from "../src/ballistics.js";
import { createTerrain } from "../src/terrain.js";
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
  maxPower: number,
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
  ["mbl-01", "Stone Sentinel", "balanced", "standard", "warded", -10, 45, 1050, 150, 20, 1.0, 105, 100, 98, 88, 1, 1.5, 12, 12, 35, "explosion"],
  ["mbl-02", "River Warden", "support", "lobber", "warded", 38, 82, 1000, 300, 40, 0.9, 100, 110, 94, 85, 2, 1.7, 9, 10, 32, "impact"],
  ["mbl-03", "Iron Tortoise", "tank", "skimmer", "plated", -8, 38, 1200, 200, 20, 1.15, 80, 120, 92, 60, 1, 1.5, 14, 14, 25, "explosion"],
  ["mbl-04", "Glacier Mammoth", "tank", "lobber", "plated", 30, 88, 1150, 250, 30, 1.12, 85, 118, 90, 65, 1, 1.6, 12, 13, 22, "impact"],
  ["mbl-05", "Storm Falcon", "sniper", "direct", "bionic", -20, 25, 925, 0, 0, 0.9, 120, 95, 100, 100, 2, 1.7, 10, 9, 40, "laser"],
  ["mbl-06", "Silver Ibex", "sniper", "direct", "bionic", -15, 30, 950, 50, 0, 0.92, 125, 93, 100, 105, 2, 1.8, 9, 9, 42, "laser"],
  ["mbl-07", "Ash Behemoth", "bombardier", "mortar", "plated", 45, 88, 1100, 100, 0, 1.0, 90, 115, 96, 70, 1, 1.5, 13, 13, 30, "explosion"],
  ["mbl-08", "Volcano Toad", "bombardier", "mortar", "plated", 40, 85, 1075, 150, 10, 0.98, 88, 113, 95, 72, 1, 1.6, 12, 12, 28, "explosion"],
  ["mbl-09", "Moon Hare", "bouncer", "skimmer", "bionic", -5, 45, 975, 100, 10, 0.95, 115, 105, 98, 95, 2, 1.8, 8, 9, 38, "impact"],
  ["mbl-10", "Coral Crab", "bouncer", "skimmer", "bionic", 0, 42, 990, 120, 10, 0.96, 112, 103, 97, 92, 2, 1.6, 9, 10, 36, "laser"],
  ["mbl-11", "Pale Stag", "all-rounder", "standard", "warded", -12, 42, 1020, 280, 40, 0.92, 102, 108, 94, 86, 2, 1.7, 9, 10, 33, "impact"],
  ["mbl-12", "Sacred Crane", "support", "standard", "warded", -8, 48, 980, 260, 30, 0.9, 104, 106, 95, 88, 2, 1.7, 10, 10, 34, "laser"],
  ["mbl-13", "Cinder Fox", "glass", "direct", "bionic", -18, 28, 900, 0, 0, 0.85, 130, 90, 100, 110, 2, 1.9, 8, 8, 42, "explosion"],
  ["mbl-14", "Sky Serpent", "glass", "direct", "bionic", -16, 32, 920, 0, 0, 0.86, 128, 92, 100, 108, 2, 1.9, 8, 8, 44, "laser"],
  ["mbl-15", "Jade Dragon", "balanced", "standard", "warded", -10, 50, 1050, 150, 20, 1.05, 105, 100, 98, 88, 2, 1.7, 10, 10, 35, "explosion"],
  ["mbl-16", "Sun Lion", "all-rounder", "standard", "warded", -6, 46, 1060, 180, 20, 1.06, 103, 101, 97, 90, 2, 1.7, 10, 11, 34, "explosion"],
  ["mbl-17", "Sand Wyrm", "zoner", "mortar", "plated", 48, 88, 1025, 150, 10, 1.0, 100, 110, 95, 80, 1, 1.6, 12, 12, 33, "impact"],
  ["mbl-18", "Frost Hydra", "zoner", "mortar", "plated", 42, 86, 1040, 120, 10, 1.02, 98, 112, 96, 78, 1, 1.6, 12, 13, 31, "impact"],
  ["mbl-19", "Shadow Cat", "trickster", "skimmer", "bionic", -8, 44, 950, 100, 10, 0.95, 125, 95, 96, 105, 2, 1.8, 8, 9, 40, "electric"],
  ["mbl-20", "Mist Raven", "trickster", "direct", "bionic", -20, 35, 940, 80, 10, 0.94, 128, 93, 95, 108, 2, 1.8, 8, 9, 41, "electric"],
];

type WeaponRow = readonly [mobileId: string, weapons: readonly (readonly [ShotClass, number, number, number])[]];

/** `docs/02-reference/data/mobiles.md` § 3: class, inner-tier power, radius, queue delay. */
const WEAPONS: readonly WeaponRow[] = [
  ["mbl-01", [["arc", 240, 80, 100], ["flat", 220, 70, 110], ["arc", 500, 110, 200]]],
  ["mbl-02", [["arc", 220, 85, 100], ["lob", 210, 95, 115], ["cluster", 460, 120, 200]]],
  ["mbl-03", [["arc", 250, 90, 105], ["bounce", 240, 80, 120], ["arc", 520, 120, 200]]],
  ["mbl-04", [["lob", 250, 95, 112], ["bounce", 230, 82, 118], ["arc", 510, 118, 200]]],
  ["mbl-05", [["flat", 260, 60, 100], ["piercing", 280, 55, 115], ["beam", 480, 40, 200]]],
  ["mbl-06", [["flat", 250, 58, 98], ["arc", 270, 65, 112], ["beam", 490, 42, 198]]],
  ["mbl-07", [["lob", 260, 100, 110], ["cluster", 240, 90, 120], ["lob", 550, 130, 200]]],
  ["mbl-08", [["lob", 250, 98, 112], ["bounce", 230, 85, 122], ["cluster", 540, 128, 200]]],
  ["mbl-09", [["bounce", 240, 80, 100], ["flat", 220, 65, 110], ["bounce", 500, 110, 200]]],
  ["mbl-10", [["bounce", 230, 78, 102], ["arc", 220, 70, 112], ["beam", 470, 45, 198]]],
  ["mbl-11", [["arc", 230, 85, 100], ["flat", 200, 70, 110], ["cluster", 460, 120, 200]]],
  ["mbl-12", [["arc", 210, 82, 102], ["beam", 260, 40, 120], ["cluster", 450, 118, 200]]],
  ["mbl-13", [["flat", 300, 60, 95], ["arc", 280, 70, 110], ["arc", 580, 90, 195]]],
  ["mbl-14", [["flat", 290, 58, 96], ["cluster", 270, 85, 118], ["beam", 560, 44, 196]]],
  ["mbl-15", [["arc", 250, 80, 100], ["piercing", 270, 60, 118], ["arc", 510, 115, 200]]],
  ["mbl-16", [["arc", 250, 82, 100], ["bounce", 230, 78, 116], ["cluster", 500, 122, 200]]],
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
 * `docs/02-reference/data/mobiles.md` § 4: maxPower, dead calm, flat probe, first ground contact; the drift column
 * is the same shot in a `10` wind on sector 0 (east) measured on the same probe.
 */
const FLIGHT: readonly FlightRow[] = [
  ["mbl-01", 45, 3680, 8.6, 290],
  ["mbl-02", 45, 3386, 8.2, 271],
  ["mbl-03", 38, 3150, 7.0, 193],
  ["mbl-04", 45, 3097, 7.8, 253],
  ["mbl-05", 25, 2930, 5.2, 109],
  ["mbl-06", 30, 3300, 6.2, 158],
  ["mbl-07", 45, 3519, 8.4, 288],
  ["mbl-08", 45, 3453, 8.3, 280],
  ["mbl-09", 45, 3680, 8.6, 290],
  ["mbl-10", 42, 3576, 8.0, 264],
  ["mbl-11", 42, 3369, 7.8, 235],
  ["mbl-12", 45, 3453, 8.3, 280],
  ["mbl-13", 28, 3176, 5.8, 132],
  ["mbl-14", 32, 3438, 6.5, 171],
  ["mbl-15", 45, 3680, 8.6, 290],
  ["mbl-16", 45, 3613, 8.5, 281],
  ["mbl-17", 48, 3436, 8.7, 305],
  ["mbl-18", 45, 3519, 8.4, 288],
  ["mbl-19", 44, 3526, 8.3, 275],
  ["mbl-20", 35, 3237, 6.7, 184],
];

/** Every mobile falls under one gravity, so a shot is a function of `(angle, force)` alone. */
function shoot(mobileId: string, angle: number, force: number, wind: Wind = CALM, weaponSlot: 0 | 1 | 2 = 0) {
  const mobile = getMobile(mobileId);
  const projectile = launch({
    id: 1,
    ownerSlot: 0,
    weaponSlot,
    weapon: mobile.weapons[weaponSlot],
    from: { x: 8, y: 820 },
    facing: 1,
    angle,
    force,
  });
  return simulateFlight(projectile, { wind, gravity: TUNABLES.gravity }, flat(PROBE_WIDTH), PROBE_BOUNDS, {
    firstGroundImpact: true,
  });
}

/** The first 40 steps of a flight, as `[x, y]` pairs — the parabola itself, not just its landing point. */
function path(mobileId: string, angle: number, force: number): number[] {
  const mobile = getMobile(mobileId);
  let projectile = launch({
    id: 1,
    ownerSlot: 0,
    weaponSlot: 0,
    weapon: mobile.weapons[0],
    from: { x: 8, y: 820 },
    facing: 1,
    angle,
    force,
  });
  const points: number[] = [projectile.x, projectile.y];
  for (let step = 0; step < 40; step += 1) {
    projectile = stepProjectile(projectile, { wind: CALM, gravity: TUNABLES.gravity });
    points.push(projectile.x, projectile.y);
  }
  return points;
}

describe("mobiles", () => {
  it("TC-CORE-905: the twenty documented mobiles load with the exact stats", () => {
    expect(MOBILES).toHaveLength(20);
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
          mobile.maxPower,
        ],
        `${mobileId} stats`,
      ).toEqual(row.slice(7, 14));
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
      ).toEqual(row.slice(14, 21));
    }
  });

  it("TC-CORE-905: every mobile stays inside the documented schema clamps", () => {
    // Gravity is a rule now, not a stat: no row may carry its own, and the one value is a usable number.
    expect(Number.isFinite(TUNABLES.gravity)).toBe(true);
    expect(TUNABLES.gravity).toBeGreaterThan(0);
    for (const mobile of MOBILES) {
      expect("gravity" in mobile, `${mobile.mobileId} gravity field`).toBe(false);
      expect("mass" in mobile, `${mobile.mobileId} mass field`).toBe(false);
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
      expect(mobile.maxPower, `${mobile.mobileId} power`).toBeGreaterThanOrEqual(90);
      expect(mobile.maxPower, `${mobile.mobileId} power`).toBeLessThanOrEqual(120);
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
    const counts = new Map<Archetype, number>();
    for (const mobile of MOBILES) counts.set(mobile.archetype, (counts.get(mobile.archetype) ?? 0) + 1);
    expect([...counts.values()]).toEqual(Array(10).fill(2));
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
          force: mobile.maxPower,
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
      force: mobile.maxPower,
    });
    const shells = splitCluster(parent, [10, -10, 0]);
    expect(shells).toHaveLength(3);
    for (const shell of shells) {
      expect(shell.parentId).toBe(parent.id);
      expect([shell.power, shell.radius]).toEqual([parent.power, parent.radius]);
    }
  });

  it("TC-CORE-935: one gravity — the same angle and force draw the same parabola on every mobile (US-CORE-001 AC6)", () => {
    // GB parity: gravity is a rule, so the arc is a function of `(angle, force)` and nothing else. Eleven mobiles
    // can aim at 40°, and each of them must trace the same curve there at the same force.
    const ANGLE = 40;
    const FORCE = 90;
    const shooters = MOBILES.filter((mobile) => mobile.angleMin <= ANGLE && ANGLE <= mobile.angleMax);
    expect(shooters).toHaveLength(11);

    const reference = path("mbl-01", ANGLE, FORCE);
    const referenceFlight = shoot("mbl-01", ANGLE, FORCE);
    for (const mobile of shooters) {
      expect(path(mobile.mobileId, ANGLE, FORCE), `${mobile.mobileId} @ ${ANGLE}°/${FORCE}`).toEqual(reference);
      const flight = shoot(mobile.mobileId, ANGLE, FORCE);
      expect([flight.landingX, flight.flightMs], `${mobile.mobileId} landing`).toEqual([
        referenceFlight.landingX,
        referenceFlight.flightMs,
      ]);
    }

    // What separates the mobiles is the firing envelope, never the arc: nine of them cannot even aim at 40°…
    const cannotAim = MOBILES.filter((mobile) => ANGLE < mobile.angleMin || ANGLE > mobile.angleMax);
    expect(cannotAim).toHaveLength(9);
    expect(new Set(MOBILES.map((mobile) => `${mobile.angleMin}:${mobile.angleMax}`)).size).toBe(20);

    // …the `maxPower` cap moves the reach by hundreds of units at the very same angle…
    const short = shoot("mbl-01", ANGLE, 60);
    const full = shoot("mbl-01", ANGLE, getMobile("mbl-01").maxPower);
    expect(full.landingX - short.landingX).toBeGreaterThan(1_000);

    // …and the shell is the third axis: twenty distinct three-slot loadouts.
    const loadouts = new Set(
      MOBILES.map((mobile) => mobile.weapons.map((weapon) => `${weapon.shotClass}/${weapon.power}/${weapon.radius}`).join("|")),
    );
    expect(loadouts.size).toBe(MOBILES.length);
  });

  it("TC-CORE-925: wind carries no mass term — the same wind drifts every mobile by the same amount", () => {
    const ANGLE = 40;
    const FORCE = 90;
    const MAGNITUDE = 10;
    const east: Wind = { magnitude: MAGNITUDE, directionDeg: 0, sector: 0 };
    const west: Wind = { magnitude: MAGNITUDE, directionDeg: 180, sector: 1 };

    // The wind enters the integrator as a plain acceleration with no mass in it, and GB's wind is horizontal.
    const acceleration = windAcceleration(east);
    expect(acceleration.ax).toBeCloseTo(TUNABLES.windCoefficient * MAGNITUDE, 9);
    expect(acceleration.ay).toBeCloseTo(0, 9);
    expect(windAcceleration(west).ax).toBeCloseTo(-acceleration.ax, 9);
    expect(windAcceleration(CALM).ax).toBe(0);

    // Same angle, same force, same wind ⇒ the same drift on every mobile: nothing about the mobile reaches the
    // wind term, which is what makes a wind reading transferable between mobiles.
    const shooters = MOBILES.filter((mobile) => mobile.angleMin <= ANGLE && ANGLE <= mobile.angleMax);
    expect(shooters).toHaveLength(11);
    const drift = (mobileId: string) => shoot(mobileId, ANGLE, FORCE, east).landingX - shoot(mobileId, ANGLE, FORCE).landingX;
    const [first, ...others] = shooters.map((mobile) => ({ mobileId: mobile.mobileId, drift: drift(mobile.mobileId) }));
    expect(first!.drift).toBeGreaterThan(0);
    for (const other of others) expect(other.drift, `${other.mobileId} drift`).toBe(first!.drift);

    // The drift is `½ · a_x · t²` for the shot's own hang time — hang time, not weight, is the mobile-side input.
    const calmFlight = shoot("mbl-01", ANGLE, FORCE);
    const closedForm = 0.5 * acceleration.ax * (calmFlight.flightMs / 1000) ** 2;
    expect(first!.drift / closedForm).toBeGreaterThan(0.95);
    expect(first!.drift / closedForm).toBeLessThanOrEqual(1.05);

    // A shot that hangs longer drifts further; nothing else about the mobile changes the push.
    const lowerFlight = shoot("mbl-01", ANGLE, 60);
    const lowerDrift = shoot("mbl-01", ANGLE, 60, east).landingX - lowerFlight.landingX;
    expect(lowerFlight.flightMs).toBeLessThan(calmFlight.flightMs);
    expect(first!.drift).toBeGreaterThan(lowerDrift);
  });

  it("TC-CORE-923: the two mobiles in each archetype sit within ten percent on damage per delay", () => {
    const byArchetype = new Map<Archetype, Mobile[]>();
    for (const mobile of MOBILES) {
      byArchetype.set(mobile.archetype, [...(byArchetype.get(mobile.archetype) ?? []), mobile]);
    }
    expect([...byArchetype.values()].every((pair) => pair.length === 2)).toBe(true);
    for (const [archetype, pair] of byArchetype) {
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

  it("TC-CORE-924: every mobile at maxPower lands and hangs where the flat-probe table says", () => {
    const rangeMisses: string[] = [];
    const hangMisses: string[] = [];
    const driftMisses: string[] = [];
    const angleMisses: string[] = [];
    for (const [mobileId, documentedAngle, range, seconds, drift] of FLIGHT) {
      const mobile = getMobile(mobileId);
      const angle = Math.min(mobile.angleMax, Math.max(mobile.angleMin, documentedAngle));
      if (angle !== documentedAngle) angleMisses.push(`${mobileId}: docs ${documentedAngle}°, window max ${mobile.angleMax}°`);
      const result = shoot(mobileId, angle, mobile.maxPower);
      if (result.impact === null || Math.abs(result.landingX - range) > 1) {
        rangeMisses.push(
          `${mobileId}: expected ${range}, got ${result.impact === null ? "no impact" : result.landingX.toFixed(1)}`,
        );
      }
      if (Math.abs(result.flightMs - seconds * 1000) > 100) {
        hangMisses.push(`${mobileId}: expected ${seconds * 1000}, got ${result.flightMs}`);
      }
      const pushed = shoot(mobileId, angle, mobile.maxPower, { magnitude: 10, directionDeg: 0, sector: 0 });
      const measured = pushed.landingX - result.landingX;
      if (Math.abs(measured - drift) > 1) driftMisses.push(`${mobileId}: expected ${drift}, got ${measured.toFixed(1)}`);
    }
    expect.soft(angleMisses, "documented angle must fit the mobile's window").toEqual([]);
    expect.soft(rangeMisses, "landing within ±1 unit of §4").toEqual([]);
    expect.soft(hangMisses, "hang within ±0.1 s of §4").toEqual([]);
    expect.soft(driftMisses, "drift in a 10/0 wind within ±1 unit of §4").toEqual([]);
  });
});
