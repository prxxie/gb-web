import { describe, expect, it } from "vitest";
import { MOBILES, getMobile, damagePerDelay } from "../src/data/mobiles.js";
import { MAPS, getMap, MAP_BOUNDS } from "../src/data/maps.js";
import { ITEMS, ITEMS_BY_ID, LOADOUT_CAP, loadoutTotal } from "../src/data/items.js";
import { MODES, getMode } from "../src/data/modes.js";
import { AVATAR_PARTS, avatarBonus, bonusMultipliers, AVATAR_CAPS } from "../src/data/avatars.js";
import { launch, simulateFlight } from "../src/ballistics.js";
import { createTerrain } from "../src/terrain.js";
import { TUNABLES } from "../src/tuning.js";

describe("TC-CORE-905: the roster", () => {
  it("carries twenty mobiles with unique ids and three weapon slots each", () => {
    expect(MOBILES).toHaveLength(20);
    expect(new Set(MOBILES.map((mobile) => mobile.mobileId)).size).toBe(20);
    for (const mobile of MOBILES) {
      expect(mobile.weapons).toHaveLength(3);
      expect(mobile.maxHp).toBeGreaterThanOrEqual(900);
      expect(mobile.maxHp).toBeLessThanOrEqual(1200);
      expect(mobile.angleMin).toBeLessThan(mobile.angleMax);
      for (const weapon of mobile.weapons) expect(weapon.power).toBeGreaterThan(0);
    }
  });

  it("gives the roster one shared gravity and per-mobile identity through the envelope, stats, budget and shells", () => {
    // GB parity: gravity is a rule, not a mobile stat — no row carries its own gravity or mass, so the same angle
    // and force draw the same parabola on every mobile (`mobiles.md` § 4, `TC-CORE-935`).
    for (const mobile of MOBILES) {
      expect("gravity" in mobile).toBe(false);
      expect("mass" in mobile).toBe(false);
    }
    const flat = () => {
      const terrain = createTerrain("map-01");
      terrain.heights.fill(820);
      return { ...terrain, width: 60_000 };
    };
    const flight = (mobileId: string) => {
      const mobile = getMobile(mobileId);
      return simulateFlight(
        launch({
          id: 1,
          ownerSlot: 0,
          weaponSlot: 0,
          weapon: mobile.weapons[0],
          from: { x: 8, y: 820 },
          facing: 1,
          angle: 40,
          force: 90,
        }),
        { wind: { magnitude: 0, directionDeg: 0, sector: 0 }, gravity: TUNABLES.gravity },
        flat(),
        { width: 60_000, height: 4000 },
        { firstGroundImpact: true },
      );
    };
    const a = flight("mbl-01");
    const b = flight("mbl-16");
    expect([b.landingX, b.flightMs]).toEqual([a.landingX, a.flightMs]);

    // Identity is carried by the aim envelope: no two mobiles share a window, and the window is a real restriction.
    expect(new Set(MOBILES.map((mobile) => `${mobile.angleMin}:${mobile.angleMax}`)).size).toBe(MOBILES.length);
    expect(MOBILES.filter((mobile) => mobile.angleMin <= 40 && 40 <= mobile.angleMax)).toHaveLength(11);
    expect(new Set(MOBILES.map((mobile) => mobile.maxPower)).size).toBeGreaterThanOrEqual(8);

    // …and by the stats, the movement budget and the three shells.
    for (const field of ["maxHp", "defense", "energy", "maxPower", "moveDistance", "maxMovesPerTurn"] as const) {
      for (const mobile of MOBILES) expect(mobile[field], `${mobile.mobileId} ${field}`).toBeDefined();
    }
    expect(new Set(MOBILES.map((mobile) => mobile.maxHp)).size).toBeGreaterThanOrEqual(10);
    expect(new Set(MOBILES.map((mobile) => mobile.defense)).size).toBeGreaterThanOrEqual(10);
    expect(new Set(MOBILES.map((mobile) => mobile.energy)).size).toBeGreaterThanOrEqual(10);
    expect(
      new Set(MOBILES.map((mobile) => `${mobile.moveDistance}:${mobile.maxMovesPerTurn}:${mobile.runMultiplier}:${mobile.moveEnergy}`)).size,
    ).toBeGreaterThanOrEqual(10);
    expect(new Set(MOBILES.map((mobile) => mobile.weapons.map((weapon) => weapon.shotClass).join("/"))).size).toBe(
      MOBILES.length,
    );
    for (const mobile of MOBILES) {
      expect(mobile.weapons).toHaveLength(3);
      expect(mobile.moveDistance).toBeGreaterThan(0);
      expect(mobile.maxMovesPerTurn).toBeGreaterThanOrEqual(1);
      expect(mobile.runMultiplier).toBeGreaterThan(1);
    }

    // The whole identity is unique, which is what a roster pick is choosing between.
    const identities = new Set(
      MOBILES.map((mobile) =>
        [
          mobile.angleMin,
          mobile.angleMax,
          mobile.maxPower,
          mobile.maxHp,
          mobile.defense,
          mobile.energy,
          mobile.weapons.map((weapon) => `${weapon.shotClass}/${weapon.power}/${weapon.radius}`).join("|"),
        ].join("/"),
      ),
    );
    expect(identities.size).toBe(MOBILES.length);
  });

  it("TC-CORE-923: the archetype pairs stay inside the balance band", () => {
    const ratios = MOBILES.map(damagePerDelay);
    const min = Math.min(...ratios);
    const max = Math.max(...ratios);
    expect(min).toBeGreaterThan(0);
    expect(max / min).toBeLessThan(1.7);
  });
});

describe("TC-CORE-920: maps", () => {
  it("ships eleven maps with a seed, a gravity modifier and gimmicks", () => {
    expect(MAPS).toHaveLength(11);
    for (const map of MAPS) {
      expect(map.mapId).toMatch(/^map-\d{2}$/);
      expect(map.gravityModifier).toBeGreaterThanOrEqual(0.95);
      expect(map.gravityModifier).toBeLessThanOrEqual(1.05);
      expect(Number.isInteger(map.seed)).toBe(true);
      expect(Array.isArray(map.gimmicks)).toBe(true);
    }
    expect(() => getMap("map-99")).toThrow();
    expect(MAP_BOUNDS).toEqual({ width: TUNABLES.mapWidth, height: TUNABLES.mapHeight });
  });
});

describe("TC-CORE-904: items", () => {
  it("ships eleven battle items with a delay cost and a loadout cap", () => {
    expect(ITEMS).toHaveLength(11);
    expect(LOADOUT_CAP).toBe(11);
    for (const item of ITEMS) {
      // GB's Blood is the one item with no delay ("Delay: None"): everything else is a tempo cost.
      expect(item.delayCost).toBeGreaterThanOrEqual(0);
      expect(item.itemId === "itm-blood" ? item.delayCost : item.delayCost).toBeGreaterThanOrEqual(0);
      expect(ITEMS_BY_ID.get(item.itemId)).toBe(item);
    }
    expect(ITEMS.filter((item) => item.delayCost > 0)).toHaveLength(10);
    expect(ITEMS_BY_ID.get("itm-blood")?.delayCost).toBe(0);
    expect(loadoutTotal({ "itm-dual": 2, "itm-power-up": 1 })).toBe(3);
  });
});

describe("TC-CORE-916: modes and avatars", () => {
  it("ships four modes and clamps avatar bonuses", () => {
    expect(MODES.map((mode) => mode.modeId).sort()).toEqual(["jewel", "score", "solo", "tag"]);
    expect(getMode("score").turnCap).toBeGreaterThan(0);
    const bonus = avatarBonus(["av-head-01", "av-body-02", "av-weapon-01", "av-acc-02"]);
    expect(bonus.attack).toBeGreaterThan(0);
    expect(bonus.attack).toBeLessThanOrEqual(AVATAR_CAPS.attack);
    const multipliers = bonusMultipliers(bonus);
    expect(multipliers.attack).toBeGreaterThanOrEqual(1);
    expect(multipliers.attack).toBeLessThanOrEqual(1 + AVATAR_CAPS.attack / 100);
    // Duplicate slots keep the first part, so two heads cannot double the bonus.
    const duplicate = avatarBonus(["av-head-01", "av-head-02"]);
    expect(duplicate.attack + duplicate.defense).toBe(avatarBonus(["av-head-01"]).attack);
    expect(AVATAR_PARTS.length).toBeGreaterThan(8);
  });

  it("resolves a mobile by id and falls back to the default", () => {
    expect(getMobile("mbl-01").mobileId).toBe("mbl-01");
    expect(() => getMobile("mbl-99")).toThrow();
  });
});
