import { describe, expect, it } from "vitest";
import { carve, createTerrain, groundY, heightAt, isUnderGround, slopeAt, type Terrain } from "../src/terrain.js";
import { tryMove } from "../src/movement.js";
import { applyInput, createMatch, type Seat } from "../src/match.js";
import { getMobile } from "../src/data/mobiles.js";
import { MAP_BOUNDS } from "../src/data/maps.js";
import { TUNABLES } from "../src/tuning.js";
import type { PlayerState } from "../src/types.js";

const NOW = 1_700_000_000_000;

function flat(y = 820): Terrain {
  const terrain = createTerrain("map-01");
  terrain.heights.fill(y);
  return terrain;
}

function seat(slot: number, team: "A" | "B"): Seat {
  return { slot, team, accountId: `acc-${slot}`, displayName: `P${slot}`, mobileId: "mbl-01", loadout: {} };
}

function player(overrides: Partial<PlayerState> & { mobileId?: string } = {}): PlayerState {
  const mobile = getMobile(overrides.mobileId ?? "mbl-01");
  return {
    slot: 0,
    accountId: null,
    displayName: "walker",
    mobileId: mobile.mobileId,
    team: "A",
    x: 1_000,
    y: 0,
    facing: 1,
    hp: mobile.maxHp,
    shield: mobile.maxShield,
    energy: mobile.energy,
    delay: 0,
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

describe("movement limits", () => {
  it("TC-CORE-904: a walk uses the mobile's own distance and debits energy and queue delay", () => {
    const mobile = getMobile("mbl-01");
    const walker = player({ mobileId: mobile.mobileId });

    const outcome = tryMove(walker, mobile, flat(), 1, false, 0);

    expect(outcome.ok).toBe(true);
    expect(outcome.distance).toBe(mobile.moveDistance);
    expect(outcome.player?.x).toBe(walker.x + mobile.moveDistance);
    expect(outcome.player?.energy).toBe(walker.energy - mobile.moveEnergy);
    expect(outcome.player?.delay).toBe(walker.delay + mobile.moveDelay);
  });

  it("TC-CORE-904: a second move in the same turn is refused once maxMovesPerTurn is spent", () => {
    const mobile = getMobile("mbl-01");
    const walker = player({ mobileId: mobile.mobileId });

    const first = tryMove(walker, mobile, flat(), 1, false, 0);
    expect(first.ok).toBe(true);
    const second = tryMove(first.player!, mobile, flat(), 1, false, mobile.maxMovesPerTurn);

    expect(second).toMatchObject({ ok: false, reason: "no-moves-left" });
    expect(second.player).toBeUndefined();
  });

  it("TC-CORE-904: a walk below moveEnergy is refused and exactly moveEnergy leaves a fixed turret", () => {
    const mobile = getMobile("mbl-01");
    const poor = player({ mobileId: mobile.mobileId, energy: mobile.moveEnergy - 1 });

    expect(tryMove(poor, mobile, flat(), 1, false, 0)).toMatchObject({ ok: false, reason: "not-enough-energy" });
    expect(tryMove({ ...poor, energy: 0 }, mobile, flat(), 1, false, 0)).toMatchObject({
      ok: false,
      reason: "not-enough-energy",
    });

    const exact = player({ mobileId: mobile.mobileId, energy: mobile.moveEnergy });
    const outcome = tryMove(exact, mobile, flat(), 1, false, 0);
    expect(outcome.ok).toBe(true);
    expect(outcome.player?.energy).toBe(0);
  });

  it("TC-CORE-904: a slope above maxIncline blocks the move until the terrain is opened", () => {
    const mobile = getMobile("mbl-01");
    const walker = player({ mobileId: mobile.mobileId });
    const targetX = walker.x + mobile.moveDistance;
    const terrain = flat();
    const targetIndex = Math.round(targetX / terrain.step);
    const dx = terrain.step * 4;
    const rise = Math.tan(((mobile.maxIncline + 15) * Math.PI) / 180) * dx * 2;
    const leftIndex = targetIndex - 4;
    for (let i = leftIndex; i <= targetIndex + 4; i += 1) {
      terrain.heights[i] = 820 - ((i - leftIndex) / 8) * rise;
    }
    expect(Math.abs(slopeAt(terrain, targetX))).toBeGreaterThan(mobile.maxIncline);

    const blocked = tryMove(walker, mobile, terrain, 1, false, 0);
    expect(blocked).toMatchObject({ ok: false, reason: "too-steep" });
    expect(blocked.player).toBeUndefined();

    expect(tryMove(walker, mobile, flat(), 1, false, 0).ok).toBe(true);
  });

  it("TC-CORE-904: a steep cliff between the unit and its destination stops the walk at the slope", () => {
    const mobile = getMobile("mbl-01");
    const walker = player({ mobileId: mobile.mobileId });
    const terrain = flat();
    const targetX = walker.x + mobile.moveDistance;
    const wallX = walker.x + mobile.moveDistance / 2;
    const wallIndex = Math.round(wallX / terrain.step);
    const rise = Math.tan(((mobile.maxIncline + 15) * Math.PI) / 180) * terrain.step * 8;
    for (let i = wallIndex; i < terrain.heights.length; i += 1) terrain.heights[i] = 820 - rise;
    expect(Math.abs(slopeAt(terrain, wallIndex * terrain.step))).toBeGreaterThan(mobile.maxIncline);
    expect(Math.abs(slopeAt(terrain, targetX))).toBeLessThanOrEqual(mobile.maxIncline);

    const outcome = tryMove(walker, mobile, terrain, 1, false, 0);

    // The unit may be refused or stop short of the cliff, but it must not cross it.
    const reached = outcome.player?.x ?? walker.x;
    expect(reached).toBeLessThan(wallIndex * terrain.step);
  });

  it("TC-CORE-904: an outward move at the map bound is refused, not paid for", () => {
    const mobile = getMobile("mbl-01");
    const edge = player({ mobileId: mobile.mobileId, x: 0, energy: mobile.energy });

    // The first outward step from x=0 is clamped to the walkable bound.
    const first = tryMove(edge, mobile, flat(), -1, false, 0);
    expect(first.ok).toBe(true);
    const atBound = first.player!;
    expect(atBound.x).toBeGreaterThanOrEqual(0);
    expect(atBound.x).toBeLessThanOrEqual(MAP_BOUNDS.width);
    expect(atBound.x).toBeLessThan(edge.x + mobile.moveDistance);

    const blocked = tryMove({ ...atBound, energy: mobile.energy }, mobile, flat(), -1, false, 0);
    expect(blocked).toMatchObject({ ok: false, reason: "out-of-map" });
    expect(blocked.player).toBeUndefined();
  });

  it("TC-CORE-904: mbl-13 walks twice, may run as one of the two actions, and a third is refused", () => {
    const mobile = getMobile("mbl-13");
    const walker = player({ mobileId: mobile.mobileId });

    const walk1 = tryMove(walker, mobile, flat(), 1, false, 0);
    expect(walk1.ok).toBe(true);
    const walk2 = tryMove(walk1.player!, mobile, flat(), 1, false, 1);
    expect(walk2.ok).toBe(true);
    expect(tryMove(walk2.player!, mobile, flat(), 1, false, mobile.maxMovesPerTurn)).toMatchObject({
      ok: false,
      reason: "no-moves-left",
    });

    const run = tryMove(walker, mobile, flat(), 1, true, mobile.maxMovesPerTurn - 1);
    expect(run.ok).toBe(true);
    expect(run.distance).toBe(Math.round(mobile.moveDistance * mobile.runMultiplier));
    expect(walker.energy - (run.player?.energy ?? 0)).toBe(mobile.moveEnergy * 2);
  });

  it("TC-CORE-904: two mobiles walk their own moveDistance, never a global constant", () => {
    const heavy = getMobile("mbl-01");
    const fox = getMobile("mbl-13");
    expect(heavy.moveDistance).not.toBe(fox.moveDistance);

    const heavyMove = tryMove(player({ mobileId: heavy.mobileId }), heavy, flat(), 1, false, 0);
    const foxMove = tryMove(player({ mobileId: fox.mobileId }), fox, flat(), 1, false, 0);

    expect(heavyMove.distance).toBe(heavy.moveDistance);
    expect(foxMove.distance).toBe(fox.moveDistance);
  });

  it("TC-CORE-951: a unit walking onto a fresh crater falls to the new ground instead of floating", () => {
    const mobile = getMobile("mbl-01");
    const terrain = flat();
    const walker = player({ mobileId: mobile.mobileId, y: groundY(terrain, 1_000) - 8 });
    const targetX = walker.x + mobile.moveDistance;
    const carveRadius = mobile.weapons[0].radius * TUNABLES.terrainCarveRatio;
    carve(terrain, targetX, heightAt(terrain, targetX), carveRadius);

    const outcome = tryMove(walker, mobile, terrain, 1, false, 0);

    expect(outcome.ok).toBe(true);
    expect(outcome.player?.x).toBe(targetX);
    expect(outcome.player?.y).toBe(groundY(terrain, targetX) - 8);
    expect(outcome.player!.y).toBeGreaterThan(walker.y);
  });

  it("TC-CORE-949: a fully buried unit cannot move until the terrain is opened", () => {
    const mobile = getMobile("mbl-01");
    const terrain = flat();
    const walker = player({ mobileId: mobile.mobileId, y: 812 });
    // Terrain above the unit's own y: it is fully inside the ground.
    for (let i = 480; i <= 520; i += 1) terrain.heights[i] = 700;
    expect(isUnderGround(terrain, walker.x, walker.y)).toBe(true);
    const targetX = walker.x + mobile.moveDistance;
    expect(Math.abs(slopeAt(terrain, targetX))).toBeLessThanOrEqual(mobile.maxIncline);

    const buried = tryMove(walker, mobile, terrain, 1, false, 0);

    expect(buried.ok).toBe(false);
  });

  it("TC-NET-067: a move from a slot that is not the active player is rejected", () => {
    const state = createMatch({
      matchId: "m-move",
      roomCode: "ABC234",
      seed: 7,
      mode: "solo",
      mapId: "map-01",
      seats: [seat(0, "A"), seat(1, "B")],
      now: NOW,
    });
    const idle = state.players[1];
    expect(idle).toBeDefined();
    if (!idle) return;

    const result = applyInput(state, { kind: "move", slot: 1, dir: -1, run: false, seq: state.seq }, NOW);

    expect(result.events[0]).toMatchObject({ kind: "reject", reason: "not-your-turn" });
    expect(result.state.players[1]?.x).toBe(idle.x);
  });
});
