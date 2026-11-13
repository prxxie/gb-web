import { describe, expect, it } from "vitest";
import {
  carve,
  createTerrain,
  deserializeTerrain,
  groundY,
  heightAt,
  isUnderGround,
  serializeTerrain,
  type Terrain,
} from "../src/terrain.js";
import { gravityFor, launch, simulateFlight, windKFor } from "../src/ballistics.js";
import { getMap } from "../src/data/maps.js";
import { getMobile } from "../src/data/mobiles.js";
import { applyInput, createMatch, terrainOf, type Seat } from "../src/match.js";
import type { MatchState } from "../src/types.js";
import { TUNABLES } from "../src/tuning.js";

const NOW = 1_700_000_000_000;
const CALM = { magnitude: 0, directionDeg: 0, sector: 0 } as const;

function flat(y = 820): Terrain {
  const terrain = createTerrain("map-01");
  terrain.heights.fill(y);
  return terrain;
}

function seat(slot: number, team: "A" | "B", mobileId: string): Seat {
  return { slot, team, accountId: `acc-${slot}`, displayName: `P${slot}`, mobileId, loadout: {} };
}

describe("TC-CORE-945: a malformed terrain never loads (US-CORE-012 AC5)", () => {
  it("throws on a corrupt RLE token and on a mask of the wrong length", () => {
    // A peer's mask arrives inside a snapshot, so a bad one must fail loudly instead of drawing a broken map.
    expect(() => deserializeTerrain("map-01", "not-a-run")).toThrow(/corrupt terrain RLE/);
    expect(() => deserializeTerrain("map-01", "100x0")).toThrow(/corrupt terrain RLE/);
    expect(() => deserializeTerrain("map-01", "100x1")).toThrow(/terrain length mismatch/);
    // The same map round-trips, so the guard rejects only what it should.
    const terrain = createTerrain("map-01");
    const back = deserializeTerrain("map-01", serializeTerrain(terrain));
    expect(back.heights[0]).toBeCloseTo(terrain.heights[0] ?? 0, 2);
  });
});

describe("terrain carving", () => {
  it("TC-CORE-914: blast radius 80 removes a 0.6 × 80 crater and leaves the rest of the mask alone", () => {
    const mobile = getMobile("mbl-01");
    const weapon = mobile.weapons[0];
    const carveRadius = weapon.radius * TUNABLES.terrainCarveRatio;
    const terrain = flat();
    const x = 1_000;
    const surface = heightAt(terrain, x);

    const span = carve(terrain, x, surface, carveRadius);

    // The returned span is exactly the samples inside the crater radius.
    expect(span.from).toBe(Math.floor((x - carveRadius) / terrain.step));
    expect(span.to).toBe(Math.ceil((x + carveRadius) / terrain.step));

    // The bowl is dug at the centre, its rim is untouched.
    expect(heightAt(terrain, x)).toBeGreaterThan(surface);
    expect(heightAt(terrain, x + carveRadius - terrain.step * 2)).toBeGreaterThan(surface);
    expect(heightAt(terrain, x - carveRadius + terrain.step * 2)).toBeGreaterThan(surface);
    expect(heightAt(terrain, x + carveRadius + terrain.step * 2)).toBe(surface);
    expect(heightAt(terrain, x - carveRadius - terrain.step * 2)).toBe(surface);
  });

  it("TC-CORE-914: carving the same blast twice is idempotent", () => {
    const mobile = getMobile("mbl-01");
    const carveRadius = mobile.weapons[0].radius * TUNABLES.terrainCarveRatio;
    const terrain = flat();
    const x = 1_000;
    const y = heightAt(terrain, x);

    carve(terrain, x, y, carveRadius);
    const once = serializeTerrain(terrain);
    carve(terrain, x, y, carveRadius);

    expect(serializeTerrain(terrain)).toBe(once);
  });

  it("TC-CORE-040: host and peer carve byte-identical masks and the RLE survives a round trip", () => {
    const mobile = getMobile("mbl-01");
    const carveRadius = mobile.weapons[0].radius * TUNABLES.terrainCarveRatio;
    const host = flat();
    const peer = flat();
    const x = 1_320;
    const y = heightAt(host, x);

    carve(host, x, y, carveRadius);
    carve(peer, x, y, carveRadius);

    expect(serializeTerrain(host)).toBe(serializeTerrain(peer));
    const decoded = deserializeTerrain("map-01", serializeTerrain(host));
    expect(serializeTerrain(decoded)).toBe(serializeTerrain(host));
    expect(heightAt(decoded, x)).toBe(heightAt(host, x));
  });

  it("TC-CORE-914: a projectile detonates at first contact, not inside the terrain", () => {
    const mobile = getMobile("mbl-01");
    const terrain = flat();
    const projectile = launch({
      id: 1,
      ownerSlot: 0,
      weaponSlot: 0,
      weapon: mobile.weapons[0],
      from: { x: 8, y: 820 },
      facing: 1,
      angle: 10,
      bar: 2.4,
    });

    // Gravity and the wind coefficient are the machine's own now (`US-BAL-004` AC1/AC2).
    const flight = simulateFlight(
      projectile,
      { wind: CALM, gravity: gravityFor(mobile), windK: windKFor(mobile) },
      terrain,
    );

    expect(flight.impact).not.toBeNull();
    if (!flight.impact) return;
    expect(isUnderGround(terrain, flight.impact.x, flight.impact.y)).toBe(true);
    // Contact is resolved on the surface: the overshoot is at most one terrain sample.
    expect(flight.impact.y - heightAt(terrain, flight.impact.x)).toBeLessThanOrEqual(terrain.step);
  });

  it("TC-CORE-950: a piercing shot crosses a ridge that stops an arc shot", () => {
    const mobile = getMobile("mbl-01");
    const ridge = flat();
    for (let i = 200; i < 260; i += 1) ridge.heights[i] = 700;

    const launchAt = (shotClass: "arc" | "piercing") =>
      launch({
        id: 1,
        ownerSlot: 0,
        weaponSlot: 0,
        weapon: { ...mobile.weapons[0], shotClass },
        from: { x: 8, y: 820 },
        facing: 1,
        angle: 10,
        bar: 3.6,
      });
    const context = { wind: CALM, gravity: gravityFor(mobile), windK: windKFor(mobile) };
    const arc = simulateFlight(launchAt("arc"), context, ridge);
    const piercing = simulateFlight(launchAt("piercing"), context, ridge);

    expect(arc.impact).not.toBeNull();
    expect(arc.landingX).toBeLessThan(520);
    expect(piercing.landingX).toBeGreaterThan(520);
  });

  it("TC-CORE-914: a crater under a unit re-grounds it to the new surface when the shot ends the turn", () => {
    const rolled = createMatch({
      matchId: "m-terrain",
      roomCode: "ABC234",
      seed: 7,
      mode: "solo",
      mapId: "map-01",
      seats: [seat(0, "A", "mbl-01"), seat(1, "B", "mbl-13")],
      now: NOW,
    });
    // The property here is the crater re-grounding a unit, not the weather: with no mass dividing it any
    // rolled wind dominates a lobbed aim, so the wind is pinned to calm and the shot is aimable again.
    const state: MatchState = { ...rolled, weather: { ...rolled.weather, wind: CALM } };
    const shooter = state.players[0];
    const target = state.players[1];
    expect(shooter).toBeDefined();
    expect(target).toBeDefined();
    if (!shooter || !target) return;

    const mobile = getMobile(shooter.mobileId);
    const weapon = mobile.weapons[0];
    const gravity = gravityFor(mobile) * getMap(state.mapId).gravityModifier;
    const windK = windKFor(mobile);
    const terrain = terrainOf(state);

    // Aim the shot so it lands on the target's own ground.
    const missFor = (bar: number): number => {
      const projectile = launch({
        id: 1,
        ownerSlot: 0,
        weaponSlot: 0,
        weapon,
        from: { x: shooter.x, y: shooter.y },
        facing: shooter.facing,
        angle: 45,
        bar,
      });
      const flight = simulateFlight(projectile, { wind: state.weather.wind, gravity, windK }, terrain);
      return Math.abs((flight.impact?.x ?? flight.landingX) - target.x);
    };
    let bestBar = 1;
    let bestMiss = missFor(bestBar);
    for (let bar = 1; bar <= TUNABLES.powerBarMax; bar += 0.1) {
      const miss = missFor(bar);
      if (miss < bestMiss) {
        bestMiss = miss;
        bestBar = bar;
      }
    }
    // Refine around the coarse minimum so the shell lands inside the crater's centre, not its rim.
    const coarse = bestBar;
    for (let bar = coarse - 0.1; bar <= coarse + 0.1; bar += 0.005) {
      if (bar < 0 || bar > TUNABLES.powerBarMax) continue;
      const miss = missFor(bar);
      if (miss < bestMiss) {
        bestMiss = miss;
        bestBar = bar;
      }
    }
    expect(bestMiss).toBeLessThan(terrain.step);

    // The lower base delay would otherwise hand the first turn to the target.
    const ready = { ...state, turn: { ...state.turn, activeSlot: 0 } };
    const after = applyInput(
      ready,
      { kind: "fire", slot: 0, weaponSlot: 0, angle: 45, bar: bestBar, seq: ready.seq },
      NOW,
    );
    expect(after.events[0]?.kind).toBe("shot");
    const carvedTerrain = terrainOf(after.state);
    const targetAfter = after.state.players[1];
    expect(targetAfter).toBeDefined();
    if (!targetAfter) return;

    // The blast dug the ground under the target, so the unit must fall with it.
    expect(groundY(carvedTerrain, target.x)).toBeGreaterThan(groundY(terrain, target.x));
    expect(targetAfter.y).toBeCloseTo(groundY(carvedTerrain, targetAfter.x) - 8, 6);
  });
});

describe("TC-CORE-948: the same blast leaves the same mask on host and peer (US-CORE-006 AC4)", () => {
  it("carves two independently created terrains into byte-identical RLE", () => {
    const carveInto = (): Terrain => {
      const terrain = flat();
      carve(terrain, 1_000, 700, 48);
      return terrain;
    };

    const host = carveInto();
    const peer = carveInto();

    expect(serializeTerrain(peer)).toBe(serializeTerrain(host));
    // The peer rebuilds its mask from the bytes the host sent, so the wire form must be lossless.
    expect(deserializeTerrain("map-01", serializeTerrain(host)).heights).toEqual(host.heights);
  });
});
