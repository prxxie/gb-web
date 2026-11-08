import { describe, expect, it } from "vitest";
import { botShot, botTurn, botTurnPlan, DEFAULT_BOT, type BotConfig } from "../src/bot.js";
import { launch, simulateFlight } from "../src/ballistics.js";
import { getMap } from "../src/data/maps.js";
import { getMobile, MOBILES } from "../src/data/mobiles.js";
import { ITEMS } from "../src/data/items.js";
import { applyInput, createMatch, passTurn, type Seat } from "../src/match.js";
import { createRng } from "../src/rng.js";
import { createTerrain } from "../src/terrain.js";
import { TUNABLES } from "../src/tuning.js";
import type { FireInput, MatchState } from "../src/types.js";

const NOW = 1_700_000_000_000;
const CALM = { wind: { magnitude: 0, directionDeg: 0, sector: 0 }, rolledAtRound: 1 } as const;
const PERFECT: BotConfig = { ...DEFAULT_BOT, angleNoiseDeg: 0, powerNoise: 0, superShotChance: 0 };

function seat(slot: number, team: "A" | "B", mobileId = "mbl-01", loadout: Record<string, number> = {}): Seat {
  return { slot, team, accountId: `acc-${slot}`, displayName: `P${slot}`, mobileId, loadout };
}

/** Open, flat ground: any legal shot reaches the target without terrain in the way. */
function openField(mobileId = "mbl-01", botX = 300, targetX = 1_300, loadout: Record<string, number> = {}): MatchState {
  const terrain = createTerrain("map-01");
  terrain.heights.fill(820);
  return place(terrain, mobileId, botX, targetX, loadout);
}

/** A wall the arc classes cannot clear but a `piercing` shot passes through (`US-CORE-007`). */
function wallBetween(mobileId: string): MatchState {
  return walledField(mobileId);
}

/**
 * Flat ground with a full-height pillar (`from…to`) between the two mobiles.
 *
 * Nothing an arc shell fires at its own height crosses the pillar: the short shots stop on its face and a
 * lob that does clear it comes down again a long way behind it, so the pillar cuts the reachable set in two.
 */
function walledField(
  mobileId: string,
  botX = 300,
  targetX = 1_300,
  from = 650,
  to = 950,
  loadout: Record<string, number> = {},
): MatchState {
  const terrain = createTerrain("map-01");
  terrain.heights.fill(820);
  for (let index = 0; index < terrain.heights.length; index += 1) {
    const x = index * terrain.step;
    if (x >= from && x <= to) terrain.heights[index] = 0;
  }
  return place(terrain, mobileId, botX, targetX, loadout);
}

function place(
  terrain: { heights: Float64Array },
  mobileId: string,
  botX: number,
  targetX: number,
  loadout: Record<string, number> = {},
): MatchState {
  const base = createMatch({
    matchId: "match-bot",
    roomCode: "ABC234",
    seed: 7,
    mode: "solo",
    mapId: "map-01",
    seats: [seat(0, "A", mobileId, loadout), seat(1, "B")],
    now: NOW,
  });
  return {
    ...base,
    terrain: Array.from(terrain.heights),
    weather: CALM,
    players: base.players.map((player) =>
      player.slot === 0 ? { ...player, x: botX, y: 812 } : { ...player, x: targetX, y: 812 },
    ),
  };
}

function terrainOf(state: MatchState) {
  return { step: state.terrainStep, heights: Float64Array.from(state.terrain), width: TUNABLES.mapWidth };
}

/** Replay a shot through the real integrator, exactly as `resolveShot` would. */
function landingError(state: MatchState, angle: number, force: number, weaponSlot: 0 | 1 | 2): number {
  const bot = state.players[0]!;
  const mobile = getMobile(bot.mobileId);
  const map = getMap(state.mapId);
  const projectile = launch({
    id: 0,
    ownerSlot: bot.slot,
    weaponSlot,
    weapon: mobile.weapons[weaponSlot],
    from: { x: bot.x, y: bot.y },
    facing: bot.facing,
    angle,
    force,
  });
  const flight = simulateFlight(
    projectile,
    { wind: state.weather.wind, gravity: TUNABLES.gravity * map.gravityModifier, stepMs: TUNABLES.stepMs },
    terrainOf(state),
  );
  return Math.abs(flight.landingX - state.players[1]!.x);
}

/** The best landing error the bot's own grid can reach with one weapon slot. */
function bestError(state: MatchState, weaponSlot: 0 | 1 | 2): number {
  const mobile = getMobile(state.players[0]!.mobileId);
  let best = Number.POSITIVE_INFINITY;
  for (let angle = mobile.angleMin; angle <= mobile.angleMax; angle += 2) {
    for (let force = 20; force <= mobile.maxPower; force += 5) {
      best = Math.min(best, landingError(state, angle, force, weaponSlot));
    }
  }
  return best;
}

describe("bot (US-CORE-005)", () => {
  it("TC-CORE-902: a bot turn picks a legal aim inside the mobile's envelope and fires in time", () => {
    const mobile = getMobile("mbl-01");
    const state = openField();
    const started = performance.now();
    const shot = botShot(state, 0, createRng(11), PERFECT);
    const elapsedMs = performance.now() - started;

    expect(shot).not.toBeNull();
    if (!shot) return;
    expect(elapsedMs).toBeLessThan(3_000);
    expect(shot.kind).toBe("fire");
    expect(shot.slot).toBe(0);
    expect(shot.weaponSlot === 0 || shot.weaponSlot === 1 || shot.weaponSlot === 2).toBe(true);
    expect(shot.angle).toBeGreaterThanOrEqual(mobile.angleMin);
    expect(shot.angle).toBeLessThanOrEqual(mobile.angleMax);
    expect(shot.force).toBeGreaterThanOrEqual(0);
    expect(shot.force).toBeLessThanOrEqual(mobile.maxPower);
    expect(Number.isNaN(shot.angle)).toBe(false);
    expect(Number.isNaN(shot.force)).toBe(false);

    // With a clear line of fire the simulated landing is inside the blast radius: 10 seeds, 10 hits.
    let hits = 0;
    for (let seed = 0; seed < 10; seed += 1) {
      const aimed = botShot(state, 0, createRng(seed), PERFECT);
      if (!aimed) continue;
      if (landingError(state, aimed.angle, aimed.force, aimed.weaponSlot) <= mobile.weapons[aimed.weaponSlot].radius) {
        hits += 1;
      }
    }
    expect(hits).toBe(10);
  });

  it("TC-CORE-902: every mobile keeps its own aim window, with difficulty noise on", () => {
    for (const mobile of MOBILES) {
      for (let seed = 0; seed < 4; seed += 1) {
        const state = openField(mobile.mobileId);
        const shot = botShot(state, 0, createRng(seed), DEFAULT_BOT);
        expect(shot).not.toBeNull();
        if (!shot) continue;
        expect(shot.angle).toBeGreaterThanOrEqual(mobile.angleMin);
        expect(shot.angle).toBeLessThanOrEqual(mobile.angleMax);
        expect(shot.force).toBeGreaterThanOrEqual(0);
        expect(shot.force).toBeLessThanOrEqual(mobile.maxPower);
        expect([0, 1, 2]).toContain(shot.weaponSlot);
      }
    }
  });

  it("TC-CORE-902: the same seed reproduces every bot decision", () => {
    const state = openField();
    const first = botShot(state, 0, createRng(977), DEFAULT_BOT);
    const second = botShot(state, 0, createRng(977), DEFAULT_BOT);
    expect(first).toEqual(second);

    for (let seed = 1; seed <= 6; seed += 1) {
      expect(botShot(state, 0, createRng(seed), DEFAULT_BOT)).toEqual(botShot(state, 0, createRng(seed), DEFAULT_BOT));
    }

    // The whole turn entry point, not just the aim, is a pure function of (state, seed).
    expect(botTurn({ ...state, turn: { ...state.turn, activeSlot: 0 } }, createRng(977), DEFAULT_BOT)).toEqual(first);
    const replay = botTurn(state, createRng(977), DEFAULT_BOT);
    expect(replay).toEqual(first);
    if (first) expect((replay as FireInput).seq).toBe(state.seq);
  });

  it("TC-CORE-902: the chosen weapon slot is the one with the best simulated outcome", () => {
    // A wall between the two mobiles: the arc slots stop at its face, the piercing slot 1 reaches.
    const state = wallBetween("mbl-15");
    const errors = [bestError(state, 0), bestError(state, 1), bestError(state, 2)];
    const best = errors.indexOf(Math.min(...errors));
    expect(errors[1]).toBeLessThan(errors[0]! - 100); // the case is discriminating

    const shot = botShot(state, 0, createRng(999), PERFECT);
    expect(shot).not.toBeNull();
    if (!shot) return;
    expect(shot.weaponSlot).toBe(best);
  });

  it("TC-CORE-927: a bot spends Power up to finish a target it can already hit", () => {
    // GB's Power up is a damage multiplier, not extra range (`data/items.md`), so the condition inverted with the
    // item: the bot spends it on a shot that lands and whose extra third is what kills. Open ground, so the best shot
    // is genuinely on target — in a trench the shell lands in the pit and the bot keeps the item for a shot it can
    // actually take.
    const state = openField("mbl-02", 300, 1_300, { "itm-power-up": 1 });
    const active: MatchState = { ...state, turn: { ...state.turn, activeSlot: 0 } };
    const wounded: MatchState = {
      ...active,
      players: active.players.map((player) => (player.slot === 1 ? { ...player, hp: 120, shield: 0 } : player)),
    };
    const plan = botTurnPlan(wounded, createRng(5), { ...PERFECT, itemUseChance: 1 });
    expect(plan).toHaveLength(2);
    const [item, fire] = plan as [ItemInput, FireInput];
    expect(item).toMatchObject({ kind: "item", slot: 0, itemId: "itm-power-up" });
    expect(fire.kind).toBe("fire");

    // The item costs its own delay, and the plan is deterministic for a seed.
    const itemCost = ITEMS.find((entry) => entry.itemId === "itm-power-up");
    expect(itemCost?.delayCost).toBe(150);
    expect(botTurnPlan(wounded, createRng(5), { ...PERFECT, itemUseChance: 1 })).toEqual(plan);

    // A healthy target is not a finisher: the bot keeps the item for one.
    const healthy: MatchState = {
      ...active,
      players: active.players.map((player) => (player.slot === 1 ? { ...player, hp: 1_100, shield: 0 } : player)),
    };
    expect(botTurnPlan(healthy, createRng(5), { ...PERFECT, itemUseChance: 1 })).toHaveLength(1);

    // With nothing in the bag, or with the coin flip against it, the bot just fires.
    expect(botTurnPlan({ ...wounded, players: wounded.players.map((p) => (p.slot === 0 ? { ...p, items: {} } : p)) }, createRng(5), { ...PERFECT, itemUseChance: 1 })).toHaveLength(1);
    expect(botTurnPlan(wounded, createRng(5), { ...PERFECT, itemUseChance: 0 })).toHaveLength(1);
  });
});

describe("TC-CORE-946: a bot keeps playing when the human's clock runs out (US-CORE-005 AC5)", () => {
  it("skips the silent human's turn, fires on its own, and the match still reaches an end", () => {
    // The offline bot match is local: nothing here waits on the human's socket, only on the turn clock.
    let state = openField();
    const rng = createRng(7);
    const next = passTurn(state, NOW + 60_000).state;
    expect(next.turn.activeSlot).toBe(1);
    const shot = botTurn(next, rng, PERFECT);
    expect(shot?.kind).toBe("fire");
    if (shot?.kind === "fire") {
      expect(Number.isInteger(shot.force)).toBe(true);
      const bot = getMobile(next.players[1]!.mobileId);
      expect(shot.angle).toBeGreaterThanOrEqual(bot.angleMin);
      expect(shot.angle).toBeLessThanOrEqual(bot.angleMax);
    }

    // Keep skipping the absent human and letting the bot shoot: a match with nobody at the controls must
    // still finish rather than hang on a turn the human will never take.
    state = next;
    let turns = 0;
    while (state.status !== "ended" && turns < 240) {
      turns += 1;
      const skipped = passTurn(state, NOW + 60_000 * (turns + 1)).state;
      if (skipped.status === "ended") {
        state = skipped;
        break;
      }
      const answer = botTurn(skipped, createRng(7 + turns), PERFECT);
      const applied = answer ? applyInput(skipped, { ...answer, seq: skipped.seq + 1 }, NOW + 60_000 * (turns + 1)) : null;
      state = applied ? applied.state : skipped;
    }
    expect(state.status).toBe("ended");
    expect(state.winnerTeam === "A" || state.winnerTeam === "B").toBe(true);
  });
});
