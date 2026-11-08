import { describe, expect, it } from "vitest";
import { ARMOR_MATRIX, applyBlast, armorMultiplier, damageAt, mergeHits, teamStatus, tierOf, tierMultiplier } from "../src/combat.js";
import { MOBILES, getMobile } from "../src/data/mobiles.js";
import { createMatch } from "../src/match.js";
import { toSnapshot } from "../src/snapshot.js";
import type { PlayerState } from "../src/types.js";

function player(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    slot: 1,
    accountId: null,
    displayName: "target",
    mobileId: "mbl-01",
    team: "B",
    x: 0,
    y: 0,
    facing: -1,
    hp: 1_050,
    shield: 150,
    energy: 105,
    delay: 100,
    eliminated: false,
    attack: 1,
    damageDealt: 0,
    shotsFired: 0,
    hits: 0,
    ssCharge: 0,
    items: {},
    ...overrides,
  };
}

const blast = { x: 0, y: 0, radius: 80, power: 400, ownerSlot: 0 };

describe("combat", () => {
  it("TC-CORE-024: blast tiers fall at 0.4 R, 0.7 R and R", () => {
    expect(tierOf(0, 80)).toBe("inner");
    expect(tierOf(31, 80)).toBe("inner");
    expect(tierOf(33, 80)).toBe("mid");
    expect(tierOf(56, 80)).toBe("mid");
    expect(tierOf(70, 80)).toBe("outer");
    expect(tierOf(80, 80)).toBe("outer");
    expect(tierOf(81, 80)).toBe("none");
    expect(tierMultiplier("inner")).toBe(1);
    expect(tierMultiplier("mid")).toBe(0.6);
    expect(tierMultiplier("outer")).toBe(0.3);
  });

  it("TC-CORE-024: power 400 lands 400 / 240 / 120 inside a radius-80 blast and 0 outside it", () => {
    // The tier multipliers are 1 / 0.6 / 0.3 / 0 against a radius-80 blast (`US-CORE-003` AC1).
    expect(damageAt({ power: 400, distance: 20, radius: 80, defense: 1 })).toBe(400);
    expect(damageAt({ power: 400, distance: 50, radius: 80, defense: 1 })).toBe(240);
    // The outer tier is 0.3 × power; `tierOf(81, 80)` is already outside the blast (`TC-CORE-024` tiers).
    expect(damageAt({ power: 400, distance: 79, radius: 80, defense: 1 })).toBe(120);
    expect(damageAt({ power: 400, distance: 81, radius: 80, defense: 1 })).toBe(0);
  });

  it("TC-CORE-025: HP never goes below zero and the unit is eliminated", () => {
    const victim = player({ x: 0, y: 0, hp: 120, shield: 0 });
    const [hit] = applyBlast([victim], blast);
    expect(hit?.player.hp).toBe(0);
    expect(hit?.eliminated).toBe(true);
  });

  it("TC-CORE-026: defense 1.15 reduces an Inner hit of 500", () => {
    const damage = damageAt({ power: 500, distance: 10, radius: 80, defense: 1.15 });
    expect(damage).toBe(435);
    expect(damage).toBeLessThan(500);
  });

  it("TC-CORE-903: shield absorbs first, then HP", () => {
    const victim = player({ hp: 1_200, shield: 300, mobileId: "mbl-03", x: 0, y: 0 });
    const defense = getMobile("mbl-03").defense;
    const [hit] = applyBlast([victim], { ...blast, power: 500 }, { defenseOf: () => defense });
    expect(hit?.damage).toBe(435);
    expect(hit?.absorbed).toBe(300);
    expect(hit?.player.shield).toBe(0);
    expect(hit?.player.hp).toBe(1_200 - 135);
  });

  it("TC-CORE-027: friendly fire hits a team mate and the last unit decides the match", () => {
    const mate = player({ slot: 0, team: "A", x: 40, y: 0, hp: 600, shield: 0 });
    const enemy = player({ slot: 1, team: "B", x: 0, y: 0, hp: 600, shield: 0 });
    const hits = applyBlast([mate, enemy], blast);
    expect(hits).toHaveLength(2);
    const roster = mergeHits([mate, enemy], hits);
    const status = teamStatus(roster);
    expect(status.alive.A).toBe(1);
    expect(status.alive.B).toBe(1);
    expect(status.winner).toBeNull();
    const far = player({ slot: 2, team: "B", x: 900, y: 0 });
    const wiped = mergeHits([mate, far], applyBlast([mate, far], { ...blast, power: 9_000 }));
    expect(wiped[0]?.eliminated).toBe(true);
    expect(teamStatus(wiped).winner).toBe("B");
  });

  it("TC-CORE-914: a radius-80 blast carves the documented mask", () => {
    expect(tierOf(79.9, 80)).toBe("outer");
    expect(tierOf(32, 80)).toBe("inner");
    expect(tierOf(56, 80)).toBe("mid");
  });

  it("TC-CORE-944: an electric mobile's effect never touches the damage formula or the snapshot", () => {
    // `US-CORE-003` AC7: the effect is a drawing hint. It rides in the seat's `mobileId`, and the snapshot
    // deliberately carries no effect field (`docs/02-reference/api/signaling.md` § "Snapshot payload").
    const electric = getMobile("mbl-19");
    expect(electric.effect).toBe("electric");
    const plain = getMobile("mbl-01");
    const withElectric = damageAt({ power: 400, distance: 20, radius: 80, defense: electric.defense });
    const withPlain = damageAt({ power: 400, distance: 20, radius: 80, defense: plain.defense });
    // Same defense would give the same number; the point is that the effect is not part of the formula.
    expect(withElectric).toBe(Math.round(400 / electric.defense));
    expect(withPlain).toBe(Math.round(400 / plain.defense));

    const state = createMatch({
      matchId: "m-effect",
      roomCode: "AAAAAA",
      seed: 11,
      mode: "solo",
      mapId: "map-01",
      seats: [
        { slot: 0, team: "A", accountId: null, displayName: "electric", mobileId: "mbl-19" },
        { slot: 1, team: "B", accountId: null, displayName: "plain", mobileId: "mbl-01" },
      ],
      now: 1_000,
    });
    const snapshot = toSnapshot(state, 0);
    expect(snapshot.players).toHaveLength(2);
    expect(Object.keys(snapshot.players[0]!)).not.toContain("effect");
    // And the seat that carries it is the one the room hands out, not the snapshot.
    expect(state.players[0]!.mobileId).toBe("mbl-19");
  });

  it("credits damage to the owner only", () => {
    const owner = player({ slot: 0, team: "A" });
    const enemy = player({ slot: 1, x: 0, y: 0 });
    const hits = applyBlast([owner, enemy], blast);
    const roster = mergeHits([owner, enemy], hits);
    expect(roster[0]?.damageDealt).toBeGreaterThan(0);
    expect(roster[1]?.damageDealt).toBe(0);
  });
});

describe("TC-CORE-933: the weapon-type matchup (US-CORE-003 AC6)", () => {
  it("gives every damage type one armour it beats and one it is soft against, and none of them a free lunch", () => {
    const types = Object.keys(ARMOR_MATRIX) as (keyof typeof ARMOR_MATRIX)[];
    expect(types.sort()).toEqual(["electric", "explosion", "impact", "laser"]);
    for (const type of types) {
      const row = ARMOR_MATRIX[type];
      const values = Object.values(row);
      expect(values.filter((value) => value >= 1.15), `${type} counter`).toHaveLength(1);
      expect(values.filter((value) => value <= 0.95), `${type} weakness`).toHaveLength(1);
      // The spread is the same everywhere: a damage type is a choice, not an upgrade.
      const mean = values.reduce((total, value) => total + value, 0) / values.length;
      expect(Math.abs(mean - 1), `${type} mean`).toBeLessThanOrEqual(0.05);
    }
    // Every armour class is countered by something and soft to something.
    for (const armor of ["plated", "bionic", "warded"] as const) {
      const column = types.map((type) => ARMOR_MATRIX[type][armor]);
      expect(Math.max(...column), `${armor} best`).toBeGreaterThanOrEqual(1.15);
      expect(Math.min(...column), `${armor} worst`).toBeLessThanOrEqual(0.95);
    }
  });

  it("is the only new factor in the damage formula, and unknown sides are neutral", () => {
    const base = { power: 240, distance: 0, radius: 80, defense: 1 };
    const neutral = damageAt({ ...base, armorMultiplier: 1 });
    expect(damageAt(base)).toBe(neutral);
    expect(damageAt({ ...base, armorMultiplier: 1.15 })).toBe(Math.round(neutral * 1.15));
    expect(damageAt({ ...base, armorMultiplier: 0.9 })).toBe(Math.round(neutral * 0.9));
    // A missing type or a missing class is `1`, never `NaN` and never zero damage.
    expect(armorMultiplier(undefined, "plated")).toBe(1);
    expect(armorMultiplier("explosion", undefined)).toBe(1);
  });

  it("reaches the blast: an explosive shell hurts a plated hull more than a bionic one", () => {
    // Same target mobile and same distance, so the only difference is the armour class the blast is told about.
    const plated = player({ slot: 1, x: 0, y: 0 });
    const bionic = player({ slot: 2, x: 0, y: 0, team: "B" });
    const owner = player({ slot: 0, team: "A", x: 400, y: 0 });
    const hits = applyBlast([owner, plated, bionic], blast, {
      damageType: "explosion",
      armorOf: (victim) => (victim.slot === 1 ? "plated" : "bionic"),
    });
    const toPlated = hits.find((hit) => hit.player.slot === 1)!.damage;
    const toBionic = hits.find((hit) => hit.player.slot === 2)!.damage;
    expect(toPlated).toBeGreaterThan(toBionic);
    expect(toPlated / toBionic).toBeCloseTo(ARMOR_MATRIX.explosion.plated / ARMOR_MATRIX.explosion.bionic, 1);
  });

  it("gives every mobile in the roster a class, and all three are used", () => {
    const classes = new Set(MOBILES.map((mobile) => mobile.armor));
    expect([...classes].sort()).toEqual(["bionic", "plated", "warded"]);
    for (const mobile of MOBILES) {
      expect(["plated", "bionic", "warded"]).toContain(mobile.armor);
    }
  });
});
