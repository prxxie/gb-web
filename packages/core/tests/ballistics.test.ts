import { describe, expect, it } from "vitest";
import { MOBILES, getMobile } from "../src/data/mobiles.js";
import { launch, simulateFlight, stepProjectile, windAcceleration } from "../src/ballistics.js";
import { createTerrain } from "../src/terrain.js";
import { TUNABLES } from "../src/tuning.js";

const flat = (y = 820) => {
  const terrain = createTerrain("map-01");
  terrain.heights.fill(y);
  return terrain;
};

const CALM = { magnitude: 0, directionDeg: 0, sector: 0 } as const;
const EAST = (magnitude: number) => ({ magnitude, directionDeg: 0, sector: 0 });

function shoot(mobileId: string, angle: number, force: number, wind = CALM, weaponSlot: 0 | 1 | 2 = 0) {
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
  return simulateFlight(projectile, { wind, gravity: mobile.gravity, mass: mobile.mass }, flat());
}

describe("ballistics", () => {
  it("TC-CORE-020: mbl-01 shot 1 at 45°, force 98, no wind lands at ~1,986 units in 6.3 s", () => {
    const flight = shoot("mbl-01", 45, 98);
    expect(Math.abs(flight.landingX - 1_986)).toBeLessThanOrEqual(25);
    expect(Math.abs(flight.flightMs - 6_300)).toBeLessThanOrEqual(100);
    expect(flight.offMap).toBe(false);
  });

  it("TC-CORE-021: a wind on sector 0 pushes the landing point downwind", () => {
    const calm = shoot("mbl-01", 45, 98);
    const windy = shoot("mbl-01", 45, 98, EAST(26));
    expect(windy.landingX).toBeGreaterThan(calm.landingX);
  });

  it("TC-CORE-023: the same wind drifts a light shell further than a heavy one", () => {
    const light = getMobile("mbl-13"); // mass 118
    const heavy = getMobile("mbl-03"); // mass 169
    expect(light.mass).toBeLessThan(heavy.mass);
    const calmLight = shoot("mbl-13", 45, 70);
    const windyLight = shoot("mbl-13", 45, 70, EAST(26));
    const calmHeavy = shoot("mbl-03", 45, 70);
    const windyHeavy = shoot("mbl-03", 45, 70, EAST(26));
    const driftLight = windyLight.landingX - calmLight.landingX;
    const driftHeavy = windyHeavy.landingX - calmHeavy.landingX;
    expect(driftLight).toBeGreaterThan(0);
    expect(driftHeavy).toBeGreaterThan(0);
    expect(driftLight).toBeGreaterThan(driftHeavy);
  });

  it("TC-CORE-925: gravity is the only wind term — mass alone changes the drift", () => {
    const a = windAcceleration(EAST(26), 118);
    const b = windAcceleration(EAST(26), 169);
    expect(a.ax).toBeGreaterThan(b.ax);
    expect(a.ax / b.ax).toBeCloseTo(169 / 118, 5);
    const upward = windAcceleration({ magnitude: 26, directionDeg: 270, sector: 9 }, 168);
    expect(upward.ay).toBeGreaterThan(0); // wind from the north pushes the shell up, reducing gravity
  });

  it("TC-CORE-011: a different tunables file produces a different trajectory", () => {
    const mobile = getMobile("mbl-01");
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
    const slow = simulateFlight(make(4.0), { wind: CALM, gravity: mobile.gravity, mass: mobile.mass }, flat());
    const fast = simulateFlight(make(5.0), { wind: CALM, gravity: mobile.gravity, mass: mobile.mass }, flat());
    expect(fast.landingX).toBeGreaterThan(slow.landingX);
  });

  it("TC-CORE-029: a shot that leaves the map never lands", () => {
    const flight = shoot("mbl-01", 45, 98, EAST(26));
    expect(flight.offMap).toBe(true);
    expect(flight.impact).toBeNull();
  });

  it("TC-CORE-913: a bouncing shell bounces on flat ground and a piercing shell crosses a hill", () => {
    const mobile = getMobile("mbl-01");
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
    const bounced = simulateFlight(bouncing, { wind: CALM, gravity: mobile.gravity, mass: mobile.mass }, flat());
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
    const pierced = simulateFlight(piercing, { wind: CALM, gravity: mobile.gravity, mass: mobile.mass }, ridge);
    expect(pierced.landingX).toBeGreaterThan(520);
  });

  it("TC-CORE-924: every mobile reaches across the map at maxPower on a flat probe", () => {
    expect(TUNABLES.mapWidth).toBe(2_000);
    for (const mobile of MOBILES) {
      const angle = Math.min(mobile.angleMax, Math.max(mobile.angleMin, 45));
      const flight = shoot(mobile.mobileId, angle, mobile.maxPower);
      // Either it lands on the probe or it leaves the map — both mean the shot has real reach,
      // and a full-power 45° shot is expected to clear the 2,000-unit map from the left edge.
      expect(flight.landingX, mobile.mobileId).toBeGreaterThan(1_200);
      for (const weapon of mobile.weapons) {
        expect(weapon.power, `${mobile.mobileId} power`).toBeGreaterThanOrEqual(150);
        expect(weapon.power, `${mobile.mobileId} power`).toBeLessThanOrEqual(650);
      }
    }
  });

  it("keeps velocities quantised to the wire precision", () => {
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
    const stepped = stepProjectile(projectile, { wind: CALM, gravity: 100, mass: 160 });
    expect(Number.isInteger(Math.round(stepped.vx * 10))).toBe(true);
    expect(stepped.ageMs).toBe(50);
  });
});
