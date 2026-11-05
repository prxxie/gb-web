import { describe, expect, it } from "vitest";
import { MOBILES, damagePerDelay, getMobile } from "../src/data/mobiles.js";
import { launch, simulateFlight, splitCluster } from "../src/ballistics.js";
import { createTerrain } from "../src/terrain.js";
import { TUNABLES } from "../src/tuning.js";
import type { Archetype, Effect, Mobile, ShotClass, TrajectoryProfile, Wind } from "../src/types.js";

const CALM: Wind = { magnitude: 0, directionDeg: 0, sector: 0 };

function flat(width: number = TUNABLES.mapWidth, height = 820) {
  const terrain = createTerrain("map-01");
  terrain.heights.fill(height);
  return { ...terrain, width };
}

type StatRow = readonly [
  mobileId: string,
  name: string,
  archetype: Archetype,
  trajectory: TrajectoryProfile,
  angleMin: number,
  angleMax: number,
  gravity: number,
  mass: number,
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
  ["mbl-01", "Stone Sentinel", "balanced", "standard", -10, 45, 100, 168, 1050, 150, 20, 1.0, 105, 100, 98, 88, 1, 1.5, 12, 12, 35, "explosion"],
  ["mbl-02", "River Warden", "support", "lobber", 38, 82, 112, 150, 1000, 300, 40, 0.9, 100, 110, 94, 85, 2, 1.7, 9, 10, 32, "impact"],
  ["mbl-03", "Iron Tortoise", "tank", "skimmer", -8, 38, 118, 169, 1200, 200, 20, 1.15, 80, 120, 92, 60, 1, 1.5, 14, 14, 25, "explosion"],
  ["mbl-04", "Glacier Mammoth", "tank", "lobber", 30, 88, 115, 155, 1150, 250, 30, 1.12, 85, 118, 90, 65, 1, 1.6, 12, 13, 22, "impact"],
  ["mbl-05", "Storm Falcon", "sniper", "direct", -20, 25, 86, 132, 925, 0, 0, 0.9, 120, 95, 100, 100, 2, 1.7, 10, 9, 40, "laser"],
  ["mbl-06", "Silver Ibex", "sniper", "direct", -15, 30, 92, 145, 950, 50, 0, 0.92, 125, 93, 100, 105, 2, 1.8, 9, 9, 42, "laser"],
  ["mbl-07", "Ash Behemoth", "bombardier", "mortar", 45, 88, 128, 165, 1100, 100, 0, 1.0, 90, 115, 96, 70, 1, 1.5, 13, 13, 30, "explosion"],
  ["mbl-08", "Volcano Toad", "bombardier", "mortar", 40, 85, 122, 160, 1075, 150, 10, 0.98, 88, 113, 95, 72, 1, 1.6, 12, 12, 28, "explosion"],
  ["mbl-09", "Moon Hare", "bouncer", "skimmer", -5, 45, 98, 128, 975, 100, 10, 0.95, 115, 105, 98, 95, 2, 1.8, 8, 9, 38, "impact"],
  ["mbl-10", "Coral Crab", "bouncer", "skimmer", 0, 42, 106, 152, 990, 120, 10, 0.96, 112, 103, 97, 92, 2, 1.6, 9, 10, 36, "laser"],
  ["mbl-11", "Pale Stag", "all-rounder", "standard", -12, 42, 102, 160, 1020, 280, 40, 0.92, 102, 108, 94, 86, 2, 1.7, 9, 10, 33, "impact"],
  ["mbl-12", "Sacred Crane", "support", "standard", -8, 48, 96, 140, 980, 260, 30, 0.9, 104, 106, 95, 88, 2, 1.7, 10, 10, 34, "laser"],
  ["mbl-13", "Cinder Fox", "glass", "direct", -18, 28, 84, 118, 900, 0, 0, 0.85, 130, 90, 100, 110, 2, 1.9, 8, 8, 42, "explosion"],
  ["mbl-14", "Sky Serpent", "glass", "direct", -16, 32, 90, 126, 920, 0, 0, 0.86, 128, 92, 100, 108, 2, 1.9, 8, 8, 44, "laser"],
  ["mbl-15", "Jade Dragon", "balanced", "standard", -10, 50, 99, 158, 1050, 150, 20, 1.05, 105, 100, 98, 88, 2, 1.7, 10, 10, 35, "explosion"],
  ["mbl-16", "Sun Lion", "all-rounder", "standard", -6, 46, 104, 169, 1060, 180, 20, 1.06, 103, 101, 97, 90, 2, 1.7, 10, 11, 34, "explosion"],
  ["mbl-17", "Sand Wyrm", "zoner", "mortar", 48, 88, 126, 168, 1025, 150, 10, 1.0, 100, 110, 95, 80, 1, 1.6, 12, 12, 33, "impact"],
  ["mbl-18", "Frost Hydra", "zoner", "mortar", 42, 86, 124, 162, 1040, 120, 10, 1.02, 98, 112, 96, 78, 1, 1.6, 12, 13, 31, "impact"],
  ["mbl-19", "Shadow Cat", "trickster", "skimmer", -8, 44, 94, 120, 950, 100, 10, 0.95, 125, 95, 96, 105, 2, 1.8, 8, 9, 40, "electric"],
  ["mbl-20", "Mist Raven", "trickster", "direct", -20, 35, 88, 136, 940, 80, 10, 0.94, 128, 93, 95, 108, 2, 1.8, 8, 9, 41, "electric"],
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

type FlightRow = readonly [mobileId: string, angle: number, range: number, seconds: number];

/** `docs/02-reference/data/mobiles.md` § 4: maxPower, dead calm, flat probe. */
const FLIGHT: readonly FlightRow[] = [
  ["mbl-01", 45, 1986, 6.3],
  ["mbl-02", 45, 1624, 5.3],
  ["mbl-03", 38, 1433, 4.3],
  ["mbl-04", 45, 1455, 5],
  ["mbl-05", 25, 1830, 4.5],
  ["mbl-06", 30, 1937, 4.9],
  ["mbl-07", 45, 1479, 4.8],
  ["mbl-08", 45, 1526, 5],
  ["mbl-09", 45, 2026, 6.4],
  ["mbl-10", 42, 1819, 5.5],
  ["mbl-11", 42, 1777, 5.6],
  ["mbl-12", 45, 1941, 6.3],
  ["mbl-13", 28, 2032, 5],
  ["mbl-14", 32, 2058, 5.3],
  ["mbl-15", 45, 2005, 6.3],
  ["mbl-16", 45, 1864, 6],
  ["mbl-17", 48, 1472, 5],
  ["mbl-18", 45, 1528, 5],
  ["mbl-19", 44, 2020, 6.5],
  ["mbl-20", 35, 1986, 5.6],
];

function shoot(mobileId: string, angle: number, force: number, wind = CALM, weaponSlot: 0 | 1 | 2 = 0, mass?: number) {
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
  return simulateFlight(projectile, { wind, gravity: mobile.gravity, mass: mass ?? mobile.mass }, flat());
}

describe("mobiles", () => {
  it("TC-CORE-905: the twenty documented mobiles load with the exact stats", () => {
    expect(MOBILES).toHaveLength(20);
    expect(MOBILES.map((mobile) => mobile.mobileId)).toEqual(STATS.map((row) => row[0]));
    for (const row of STATS) {
      const [mobileId, name, archetype, trajectory, angleMin, angleMax, gravity, mass] = row;
      const mobile = getMobile(mobileId);
      expect(
        [mobile.mobileId, mobile.name, mobile.archetype, mobile.trajectory, mobile.angleMin, mobile.angleMax],
        `${mobileId} identity`,
      ).toEqual([mobileId, name, archetype, trajectory, angleMin, angleMax]);
      expect([mobile.gravity, mobile.mass], `${mobileId} flight`).toEqual([gravity, mass]);
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
      ).toEqual(row.slice(8, 15));
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

  it("TC-CORE-905: every mobile stays inside the documented schema clamps", () => {
    for (const mobile of MOBILES) {
      expect(mobile.gravity, `${mobile.mobileId} gravity`).toBeGreaterThanOrEqual(84);
      expect(mobile.gravity, `${mobile.mobileId} gravity`).toBeLessThanOrEqual(128);
      expect(mobile.mass, `${mobile.mobileId} mass`).toBeGreaterThanOrEqual(118);
      expect(mobile.mass, `${mobile.mobileId} mass`).toBeLessThanOrEqual(169);
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

  it("TC-CORE-925: a lighter mobile is pushed further by the same wind", () => {
    const calm = shoot("mbl-13", 30, 90, CALM);
    const windy = shoot("mbl-13", 30, 90, { magnitude: 10, directionDeg: 0, sector: 0 });
    const heavyWindy = shoot("mbl-13", 30, 90, { magnitude: 10, directionDeg: 0, sector: 0 }, 0, 169);
    const drift = windy.landingX - calm.landingX;
    const heavyDrift = heavyWindy.landingX - calm.landingX;
    expect(drift).toBeGreaterThan(0);
    expect(drift).toBeGreaterThan(heavyDrift);

    for (const mobile of MOBILES) {
      const lightShot = shoot(mobile.mobileId, 45, 90, CALM, 0, 118);
      const heavyShot = shoot(mobile.mobileId, 45, 90, CALM, 0, 169);
      const lightWind = shoot(mobile.mobileId, 45, 90, { magnitude: 10, directionDeg: 0, sector: 0 }, 0, 118);
      const heavyWind = shoot(mobile.mobileId, 45, 90, { magnitude: 10, directionDeg: 0, sector: 0 }, 0, 169);
      expect(lightWind.landingX - lightShot.landingX, `${mobile.mobileId} drift`).toBeGreaterThan(
        heavyWind.landingX - heavyShot.landingX,
      );
    }
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
    const probe = flat(6000);
    const rangeMisses: string[] = [];
    const hangMisses: string[] = [];
    const angleMisses: string[] = [];
    for (const [mobileId, documentedAngle, range, seconds] of FLIGHT) {
      const mobile = getMobile(mobileId);
      const angle = Math.min(mobile.angleMax, Math.max(mobile.angleMin, documentedAngle));
      if (angle !== documentedAngle) angleMisses.push(`${mobileId}: docs ${documentedAngle}°, window max ${mobile.angleMax}°`);
      const bounds = { width: 6000, height: 4000 };
      const result = simulateFlight(
        launch({
          id: 1,
          ownerSlot: 0,
          weaponSlot: 0,
          weapon: mobile.weapons[0],
          from: { x: 8, y: 820 },
          facing: 1,
          angle,
          force: mobile.maxPower,
        }),
        { wind: CALM, gravity: mobile.gravity, mass: mobile.mass },
        probe,
        bounds,
        // `mobiles.md` § 4 measures the first ground contact; a `bounce` shell rebounds after it.
        { firstGroundImpact: true },
      );
      if (result.impact === null || Math.abs(result.landingX - range) > 1) {
        rangeMisses.push(`${mobileId}: expected ${range}, got ${result.impact === null ? "no impact" : result.landingX.toFixed(1)}`);
      }
      if (result.impact !== null && Math.abs(result.flightMs - seconds * 1000) > 100) {
        hangMisses.push(`${mobileId}: expected ${seconds * 1000}, got ${result.flightMs}`);
      }
    }
    expect.soft(angleMisses, "documented angle must fit the mobile's window").toEqual([]);
    expect.soft(rangeMisses, "landing within ±1 unit of §4").toEqual([]);
    expect.soft(hangMisses, "hang within ±0.1 s of §4").toEqual([]);
  });
});
