import { describe, expect, it } from "vitest";
import { applyBlast, damageAt, mergeHits, teamStatus, tierOf, tierMultiplier } from "../src/combat.js";
import { getMobile } from "../src/data/mobiles.js";
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
    superShotUsed: false,
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

  it("credits damage to the owner only", () => {
    const owner = player({ slot: 0, team: "A" });
    const enemy = player({ slot: 1, x: 0, y: 0 });
    const hits = applyBlast([owner, enemy], blast);
    const roster = mergeHits([owner, enemy], hits);
    expect(roster[0]?.damageDealt).toBeGreaterThan(0);
    expect(roster[1]?.damageDealt).toBe(0);
  });
});
