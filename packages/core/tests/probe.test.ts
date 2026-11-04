import { describe, it } from "vitest";
import { MOBILES, getMobile } from "../src/data/mobiles.js";
import { launch, simulateFlight } from "../src/ballistics.js";
import { createTerrain } from "../src/terrain.js";
import { applyBlast, tierOf } from "../src/combat.js";
import { MAPS } from "../src/data/maps.js";

const flat = (y = 820) => { const t = createTerrain("map-01"); t.heights.fill(y); return t; };
const zero = { magnitude: 0, directionDeg: 0, sector: 0 } as const;

describe("probe", () => {
  it("numbers", () => {
    const t = flat();
    for (const [id, angle, force, wind] of [
      ["mbl-01", 45, 98, zero],
      ["mbl-01", 45, 98, { magnitude: 26, directionDeg: 0, sector: 0 }],
      ["mbl-19", 45, 98, { magnitude: 26, directionDeg: 0, sector: 0 }],
      ["mbl-03", 45, 98, { magnitude: 26, directionDeg: 0, sector: 0 }],
      ["mbl-13", 45, 98, { magnitude: 26, directionDeg: 0, sector: 0 }],
    ] as const) {
      const m = getMobile(id);
      const p = launch({ id: 1, ownerSlot: 0, weaponSlot: 0, weapon: m.weapons[0], from: { x: 8, y: 820 }, facing: 1, angle, force });
      const f = simulateFlight(p, { wind, gravity: m.gravity * 1, mass: m.mass }, t);
      console.log("SHOT", id, JSON.stringify({ x: Math.round(f.landingX), ms: f.flightMs, off: f.offMap }));
    }
    console.log("MOBILES", JSON.stringify(MOBILES.map(m => [m.mobileId, m.gravity, m.mass, m.maxHp, m.maxShield, m.defense, m.maxPower, m.angleMin, m.angleMax, m.moveDistance, m.maxMovesPerTurn, m.energy, m.baseDelay])));
    console.log("MAPS", JSON.stringify(MAPS.map(m => [m.mapId, m.gravityModifier, m.gimmicks.join("+")])));
    const victim = { slot: 1, accountId: null, displayName: "v", mobileId: "mbl-03", team: "B", x: 0, y: 0, facing: -1, hp: 1200, shield: 300, energy: 100, delay: 100, eliminated: false, attack: 1, damageDealt: 0, shotsFired: 0, hits: 0, items: {} } as const;
    const hits = applyBlast([victim], { x: 0, y: 0, radius: 80, power: 500, ownerSlot: 0 }, { defenseOf: () => getMobile("mbl-03").defense });
    console.log("BLAST", JSON.stringify(hits.map(h => [h.tier, h.damage, h.absorbed, h.player.hp, h.player.shield])), tierOf(30, 80), tierOf(50, 80), tierOf(70, 80));
  });
});
