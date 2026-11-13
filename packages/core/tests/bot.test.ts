import { describe, expect, it } from "vitest";
import { botShot, botTurn, DEFAULT_BOT, DIFFICULTY_RULES, readWind, type BotOptions, type Difficulty } from "../src/bot.js";
import { gravityFor, launch, simulateFlight, windKFor } from "../src/ballistics.js";
import { getMap } from "../src/data/maps.js";
import { getMobile, MOBILES } from "../src/data/mobiles.js";
import { ITEMS } from "../src/data/items.js";
import { applyInput, createMatch, passTurn, type Seat } from "../src/match.js";
import { createRng } from "../src/rng.js";
import { createTerrain } from "../src/terrain.js";
import { TUNABLES } from "../src/tuning.js";
import { createBotMemory, sensesFor, type BotMemory, type Senses } from "../src/senses.js";
import { isMeasuring, windowMeasuring, windowOnOneScreen } from "../src/camera.js";
import { WEATHER_BANDS, weatherKind } from "../src/weather.js";
import type { FireInput, ItemInput, MatchState } from "../src/types.js";

const NOW = 1_700_000_000_000;
const CALM = { wind: { magnitude: 0, directionDeg: 0, sector: 0 }, rolledAtRound: 1 } as const;
/** The one-screen window every seat has drawn since `US-BAL-002`. */
const ASPECT = 4 / 3;
/** No super shot on a coin flip: the shot under test is the only thing that may differ. */
const NO_SUPER: BotOptions = { ...DEFAULT_BOT, superShotChance: 0 };

/** No super shot and no item: one `botTurn` is one shot, which is what an aim assertion wants to read. */
const AIM_ONLY: BotOptions = { ...NO_SUPER, itemUseChance: 0 };
/** Aim with no error drawn at all, so the assertions are about the solver and not the dice. */
const EXACT: BotOptions = { ...NO_SUPER, landingError: 0 };

function seat(slot: number, team: "A" | "B", mobileId = "mbl-01", loadout: Record<string, number> = {}): Seat {
  return { slot, team, accountId: `acc-${slot}`, displayName: `P${slot}`, mobileId, loadout };
}

/** The window a seat is looking at: one screen, framed on it. */
function windowFor(state: MatchState, slot: number) {
  return windowOnOneScreen(state.players.find((player) => player.slot === slot)?.x ?? 0, ASPECT);
}

/** The window the bot's own seat is looking at. */
function windowOf(state: MatchState) {
  return windowFor(state, 0);
}

function sense(state: MatchState, memory: BotMemory = createBotMemory(), window = windowOf(state)): Senses {
  return sensesFor(state, 0, window, memory);
}

/** Open, flat ground: any legal shot reaches the target without terrain in the way. */
/** The same field, read at another turn number. */
function atTurn(state: MatchState, number: number): MatchState {
  return { ...state, turn: { ...state.turn, number } };
}

/** The same field, with the target's hull moved (its whole body, so it is not half in the window). */
function moveTarget(state: MatchState, x: number): MatchState {
  return { ...state, players: state.players.map((player) => (player.slot === 1 ? { ...player, x } : player)) };
}

function openField(mobileId = "mbl-01", botX = 300, targetX = 600, loadout: Record<string, number> = {}): MatchState {
  const terrain = createTerrain("map-01");
  terrain.heights.fill(820);
  return place(terrain, mobileId, botX, targetX, loadout);
}

/**
 * Flat ground with a full-height pillar (`from…to`) between the two mobiles.
 *
 * Nothing an arc shell fires at its own height crosses the pillar: the short shots stop on its face and a lob that
 * does clear it comes down again a long way behind it, so the pillar cuts the reachable set in two.
 */
function walledField(
  mobileId: string,
  botX = 200,
  targetX = 700,
  from = 400,
  to = 600,
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
function landingX(state: MatchState, angle: number, bar: number, weaponSlot: 0 | 1 | 2, facing: -1 | 1 = state.players[0]!.facing): number {
  const bot = state.players[0]!;
  const mobile = getMobile(bot.mobileId);
  const map = getMap(state.mapId);
  const projectile = launch({
    id: 0,
    ownerSlot: bot.slot,
    weaponSlot,
    weapon: mobile.weapons[weaponSlot],
    from: { x: bot.x, y: bot.y },
    facing,
    angle,
    bar,
  });
  const flight = simulateFlight(
    projectile,
    {
      wind: state.weather.wind,
      gravity: gravityFor(mobile) * map.gravityModifier,
      windK: windKFor(mobile),
      stepMs: TUNABLES.stepMs,
    },
    terrainOf(state),
  );
  return flight.landingX;
}

/** How far the landed shell ends up from the target — the aim error the story measures in parts. */
function aimError(state: MatchState, shot: FireInput): number {
  return Math.abs(landingX(state, shot.angle, shot.bar, shot.weaponSlot) - state.players[1]!.x);
}

/** The best landing error the bot's own grid can reach with one weapon slot, on the real terrain. */
function bestError(state: MatchState, weaponSlot: 0 | 1 | 2): number {
  const mobile = getMobile(state.players[0]!.mobileId);
  let best = Number.POSITIVE_INFINITY;
  for (let angle = mobile.angleMin; angle <= mobile.angleMax; angle += 2) {
    for (let bar = 0.25; bar <= TUNABLES.powerBarMax; bar += 0.25) {
      best = Math.min(best, aimError(state, { kind: "fire", slot: 0, weaponSlot, angle, bar, seq: 0 }));
    }
  }
  return best;
}

function fire(state: MatchState, difficulty: Difficulty = "normal", seed = 0, options: BotOptions = NO_SUPER): FireInput {
  const aimed = botShot(sense(state), createRng(seed), difficulty, options);
  expect(aimed).not.toBeNull();
  return aimed as FireInput;
}

describe("bot (US-CORE-005, migrated to Senses by US-BAL-006)", () => {
  it("TC-CORE-902: a bot turn picks a legal aim inside the mobile's envelope and fires in time", () => {
    const mobile = getMobile("mbl-01");
    const state = openField();
    const started = performance.now();
    const shot = botShot(sense(state), createRng(11), "normal", EXACT);
    const elapsedMs = performance.now() - started;

    expect(shot).not.toBeNull();
    if (!shot) return;
    expect(elapsedMs).toBeLessThan(3_000);
    expect(shot.kind).toBe("fire");
    expect(shot.slot).toBe(0);
    expect(shot.weaponSlot === 0 || shot.weaponSlot === 1 || shot.weaponSlot === 2).toBe(true);
    expect(shot.angle).toBeGreaterThanOrEqual(mobile.angleMin);
    expect(shot.angle).toBeLessThanOrEqual(mobile.angleMax);
    expect(shot.bar).toBeGreaterThanOrEqual(0);
    expect(shot.bar).toBeLessThanOrEqual(TUNABLES.powerBarMax);
    // Three decimals, so a replay of the same seed cannot disagree in the last bits (`US-BAL-006` AC5).
    expect(Math.abs(shot.bar * 1_000 - Math.round(shot.bar * 1_000))).toBeLessThan(1e-9);
    expect(Number.isNaN(shot.angle)).toBe(false);
    expect(Number.isNaN(shot.bar)).toBe(false);

    // With a clear line of fire the simulated landing is inside the blast radius: 10 seeds, 10 hits.
    let hits = 0;
    for (let seed = 0; seed < 10; seed += 1) {
      const aimed = fire(state, "normal", seed, EXACT);
      if (aimError(state, aimed) <= mobile.weapons[aimed.weaponSlot].radius) hits += 1;
    }
    expect(hits).toBe(10);
  });

  it("TC-CORE-902: every mobile keeps its own aim window, with difficulty noise on", () => {
    for (const mobile of MOBILES) {
      for (let seed = 0; seed < 4; seed += 1) {
        const state = openField(mobile.mobileId);
        const shot = botShot(sense(state), createRng(seed), "normal", DEFAULT_BOT);
        expect(shot).not.toBeNull();
        if (!shot) continue;
        expect(shot.angle).toBeGreaterThanOrEqual(mobile.angleMin);
        expect(shot.angle).toBeLessThanOrEqual(mobile.angleMax);
        expect(shot.bar).toBeGreaterThanOrEqual(0);
        expect(shot.bar).toBeLessThanOrEqual(TUNABLES.powerBarMax);
        expect([0, 1, 2]).toContain(shot.weaponSlot);
      }
    }
  });

  it("TC-CORE-902: the same seed reproduces every bot decision", () => {
    const state = openField();
    const first = botShot(sense(state), createRng(977), "normal", DEFAULT_BOT);
    const second = botShot(sense(state), createRng(977), "normal", DEFAULT_BOT);
    expect(first).toEqual(second);

    for (let seed = 1; seed <= 6; seed += 1) {
      const a = botShot(sense(state), createRng(seed), "normal", DEFAULT_BOT);
      const b = botShot(sense(state), createRng(seed), "normal", DEFAULT_BOT);
      expect(a).toEqual(b);
    }

    // The whole turn entry point, not just the aim, is a pure function of (senses, seed).
    const replay = botTurn(sense(state), createRng(977), "normal", DEFAULT_BOT);
    expect(replay).toEqual([first]);
    // The core never invents the wire's sequence number: it hands back `0` and the caller stamps it (`AC1` — a
    // counter is not something a seat can see, so two states differing only in it must decide the same shot).
    if (first) expect(first.seq).toBe(0);
  });

  it("TC-CORE-902: the chosen weapon slot is the one with the best simulated outcome", () => {
    // A wall between the two mobiles: the arc slots stop at its face, the piercing slot 1 reaches.
    const state = walledField("mbl-15");
    const errors = [bestError(state, 0), bestError(state, 1), bestError(state, 2)];
    const best = errors.indexOf(Math.min(...errors));
    expect(errors[1]).toBeLessThan(errors[0]! - 100); // the case is discriminating

    const shot = fire(state, "normal", 999, EXACT);
    expect(shot.weaponSlot).toBe(best);
  });

  it("TC-CORE-927: a bot spends Power up to finish a target it can already hit", () => {
    // GB's Power up is a damage multiplier, not extra range (`data/items.md`), so the condition inverted with the
    // item: the bot spends it on a shot that lands and whose extra third is what kills. Open ground, so the best shot
    // is genuinely on target — in a trench the shell lands in the pit and the bot keeps the item for a shot it can
    // actually take.
    const state = openField("mbl-02", 300, 600, { "itm-power-up": 1 });
    const active: MatchState = { ...state, turn: { ...state.turn, activeSlot: 0 } };
    const wounded: MatchState = {
      ...active,
      players: active.players.map((player) => (player.slot === 1 ? { ...player, hp: 120, shield: 0 } : player)),
    };
    const plan = botTurn(sense(wounded), createRng(5), "normal", { ...EXACT, itemUseChance: 1 });
    expect(plan).toHaveLength(2);
    const [item, fired] = plan as [ItemInput, FireInput];
    expect(item).toMatchObject({ kind: "item", slot: 0, itemId: "itm-power-up" });
    expect(fired.kind).toBe("fire");

    // The item costs its own delay, and the plan is deterministic for a seed.
    const itemCost = ITEMS.find((entry) => entry.itemId === "itm-power-up");
    expect(itemCost?.delayCost).toBe(150);
    expect(botTurn(sense(wounded), createRng(5), "normal", { ...EXACT, itemUseChance: 1 })).toEqual(plan);

    // A healthy target is not a finisher: the bot keeps the item for one.
    const healthy: MatchState = {
      ...active,
      players: active.players.map((player) => (player.slot === 1 ? { ...player, hp: 1_100, shield: 0 } : player)),
    };
    expect(botTurn(sense(healthy), createRng(5), "normal", { ...EXACT, itemUseChance: 1 })).toHaveLength(1);

    // With nothing in the bag, or with the coin flip against it, the bot just fires.
    const empty: MatchState = {
      ...wounded,
      players: wounded.players.map((player) => (player.slot === 0 ? { ...player, items: {} } : player)),
    };
    expect(botTurn(sense(empty), createRng(5), "normal", { ...EXACT, itemUseChance: 1 })).toHaveLength(1);
    expect(botTurn(sense(wounded), createRng(5), "normal", { ...EXACT, itemUseChance: 0 })).toHaveLength(1);
  });
});

describe("blind bot (US-BAL-006)", () => {
  it("TC-BAL-140: the landing error stays inside each difficulty's budget", () => {
    const state = openField();
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      const budget = DIFFICULTY_RULES[difficulty].landingErrorParts * TUNABLES.partWidth;
      let worst = 0;
      for (let seed = 0; seed < 100; seed += 1) {
        worst = Math.max(worst, aimError(state, fire(state, difficulty, seed)));
      }
      // The drawn offset is a landing distance, so the miss is the budget plus whatever the solver cannot resolve.
      expect(worst).toBeGreaterThan(budget * 0.5); // the budget is actually spent, not just precision
      expect(worst).toBeLessThanOrEqual(budget + 2);
    }
  });

  it("TC-BAL-141: the budget is a landing distance, not a smaller random angle", () => {
    const state = openField();
    const aimed = fire(state, "normal", 3, EXACT);
    // A zero budget puts the shell on the hull; a 250-unit budget moves the landing by hundreds of units, which no
    // wobble of a couple of degrees on this arc could do at this range.
    expect(aimError(state, aimed)).toBeLessThanOrEqual(2);

    const generous = botShot(sense(state), createRng(3), "normal", { ...EXACT, landingError: 250 }) as FireInput;
    expect(aimError(state, generous)).toBeGreaterThan(200);
  });

  it("TC-BAL-142: a target it can no longer see is fired at where it last was, with the doubled budget", () => {
    const memory = createBotMemory();
    const seen = { ...openField(), turn: { ...openField().turn, number: 1 } };
    sense(seen, memory); // turn 1: the hull is inside the window and is remembered at x 600

    // Turn 2: it has stepped out of the window, so the bot aims at 600 — not at where the hull actually is.
    const hidden = { ...openField(), turn: { ...seen.turn, number: 2 } };
    const movedState: MatchState = {
      ...hidden,
      players: hidden.players.map((player) => (player.slot === 1 ? { ...player, x: 1_900 } : player)),
    };
    const seenBudget = DIFFICULTY_RULES.easy.landingErrorParts * TUNABLES.partWidth;
    const budget = 2 * seenBudget;
    const inSight = { ...movedState, players: movedState.players.map((player) => (player.slot === 1 ? { ...player, x: 600 } : player)) };
    let worstRemembered = 0;
    let worstSeen = 0;
    let closestToHull = Number.POSITIVE_INFINITY;
    for (let seed = 0; seed < 60; seed += 1) {
      const aimed = botTurn(sense(movedState, memory), createRng(seed), "easy", AIM_ONLY)[0] as FireInput;
      const landing = Math.abs(landingX(movedState, aimed.angle, aimed.bar, aimed.weaponSlot) - 600);
      expect(landing).toBeLessThanOrEqual(budget + 2);
      worstRemembered = Math.max(worstRemembered, landing);
      closestToHull = Math.min(closestToHull, aimError(movedState, aimed));

      // The same seeds against a hull that is still in sight stay inside the single budget.
      const visible = botTurn(sense(inSight, createBotMemory()), createRng(seed), "easy", AIM_ONLY)[0] as FireInput;
      const visibleLanding = Math.abs(landingX(inSight, visible.angle, visible.bar, visible.weaponSlot) - 600);
      expect(visibleLanding).toBeLessThanOrEqual(seenBudget + 2);
      worstSeen = Math.max(worstSeen, visibleLanding);
    }
    // The remembered budget really is doubled: a single budget cannot reach past half of two.
    expect(worstRemembered).toBeGreaterThan(seenBudget * 1.4);
    expect(worstSeen).toBeLessThanOrEqual(seenBudget + 2);
    // Never aims at the hidden hull: every shot lands far from where it actually stands.
    expect(closestToHull).toBeGreaterThan(1_000);
  });

  it("TC-BAL-145: with nothing seen and no impact remembered, it fires at the map's middle", () => {
    // The widest spawn gap of the game: 1,640 units apart, one screen is 800 wide, so the bot starts blind.
    const state = openField("mbl-01", 180, 1_820);
    const senses = sense(state);
    expect(senses.seen).toHaveLength(0);
    expect(senses.lastImpact).toBeNull();

    // `normal` reads the (calm) wind exactly, so what is measured here is the aim and not a mis-read gale.
    const budget = DIFFICULTY_RULES.normal.landingErrorParts * TUNABLES.partWidth;
    for (let seed = 0; seed < 40; seed += 1) {
      const aimed = fire(state, "normal", seed);
      const landing = landingX(state, aimed.angle, aimed.bar, aimed.weaponSlot);
      expect(Math.abs(landing - TUNABLES.mapWidth / 2)).toBeLessThanOrEqual(budget + 2);
    }
  });

  it("TC-BAL-145: a remembered impact is the fallback when no hull has ever been seen", () => {
    const state = openField("mbl-01", 180, 1_820);
    const memory = createBotMemory();
    memory.impact = { x: 1_250, turn: 3 };
    const budget = DIFFICULTY_RULES.normal.landingErrorParts * TUNABLES.partWidth;

    for (let seed = 0; seed < 20; seed += 1) {
      const aimed = botShot(sense(state, memory), createRng(seed), "normal", NO_SUPER) as FireInput;
      const landing = landingX(state, aimed.angle, aimed.bar, aimed.weaponSlot);
      expect(Math.abs(landing - 1_250)).toBeLessThanOrEqual(budget + 2);
    }
  });

  it("TC-BAL-143: it never aims at a sky the camera is still measuring", () => {
    const state = openField();
    expect(botTurn(sensesFor(state, 0, windowMeasuring(ASPECT), createBotMemory()), createRng(1), "normal", NO_SUPER)).toEqual([]);
    expect(isMeasuring(windowMeasuring(ASPECT))).toBe(true);
    // A seat's own window is always one screen, so it never measures: today this branch cannot fire in the app, and
    // the case pins that so a window that *can* measure cannot arrive silently.
    expect(isMeasuring(windowFor(state, 0))).toBe(false);
    expect(isMeasuring(windowFor(state, 1))).toBe(false);
    // The same turn with a settled window fires: the wait is the measurement, not the state.
    expect(botTurn(sense(state), createRng(1), "normal", NO_SUPER)).toHaveLength(1);
  });

  it("TC-BAL-144: the same seed and difficulty replay the same shot", () => {
    const state = openField();
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      const a = botTurn(sense(state), createRng(42), difficulty, DEFAULT_BOT);
      const b = botTurn(sense(state), createRng(42), difficulty, DEFAULT_BOT);
      expect(a).toEqual(b);
    }
    // Two fresh memories are the same memory: nothing carries over by module state.
    expect(botTurn(sense(state, createBotMemory()), createRng(42), "normal", DEFAULT_BOT)).toEqual(
      botTurn(sense(state, createBotMemory()), createRng(42), "normal", DEFAULT_BOT),
    );
    const seeds = [1, 2, 3, 4, 5].map((seed) => JSON.stringify(botShot(sense(state), createRng(seed), "easy", DEFAULT_BOT)));
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it("TC-BAL-146: easy mis-reads the wind by one band; normal and hard read it exactly", () => {
    const wind = { magnitude: 10, directionDeg: 0, sector: 0 } as const;
    const windy = { ...openField(), weather: { wind, rolledAtRound: 1 } };
    const senses = sense(windy);

    for (const difficulty of ["normal", "hard"] as const) {
      expect(readWind(senses, difficulty, createRng(4))).toEqual(wind);
    }

    const misread = readWind(senses, "easy", createRng(4));
    const index = WEATHER_BANDS.findIndex((band) => band.kind === weatherKind(wind));
    const misreadIndex = WEATHER_BANDS.findIndex((band) => band.kind === weatherKind(misread));
    expect(Math.abs(misreadIndex - index)).toBe(1);
    const band = WEATHER_BANDS[misreadIndex]!;
    expect(misread.magnitude).toBeGreaterThanOrEqual(band.min);
    expect(misread.magnitude).toBeLessThanOrEqual(band.max);
    expect(misread).not.toEqual(wind);

    // A mis-read wind really moves the shell: the easy aim differs from the aim under the true wind.
    const easyAim = botShot(sense(windy), createRng(4), "easy", NO_SUPER) as FireInput;
    const normalAim = botShot(sense(windy), createRng(4), "normal", NO_SUPER) as FireInput;
    expect(easyAim).not.toEqual(normalAim);
  });

  it("TC-BAL-148: two matches that differ only past the window produce the same shot", () => {
    // The widest spawn gap, so the bot can see nothing at all: only the terrain inside its window and its own hull
    // may reach the decision. Everything else is left free to differ between the two matches.
    const wide = openField("mbl-01", 180, 1_820);
    const other: MatchState = {
      ...wide,
      players: wide.players.map((player) => (player.slot === 1 ? { ...player, x: 1_950, hp: 12 } : player)),
      terrain: wide.terrain.map((height, index) => (index * wide.terrainStep > 1_200 ? 400 : height)),
    };

    const aims: string[] = [];
    for (let seed = 0; seed < 12; seed += 1) {
      const here = botTurn(sensesFor(wide, 0, windowOf(wide), createBotMemory()), createRng(seed), "normal", DEFAULT_BOT);
      const there = botTurn(sensesFor(other, 0, windowOf(other), createBotMemory()), createRng(seed), "normal", DEFAULT_BOT);
      expect(here).toHaveLength(1);
      expect(there).toEqual(here);
      aims.push(JSON.stringify(here));
    }

    // A hull that leaves the window and dies out there is still only the reading the seat has (`AC1`): the flag is
    // out-of-window state, so flipping it may not change the shot or drop the reading.
    const seenAt1 = atTurn(openField(), 1);
    for (let seed = 0; seed < 4; seed += 1) {
      const alive = atTurn(moveTarget(openField(), 1_900), 2);
      const dead: MatchState = {
        ...alive,
        players: alive.players.map((player) => (player.slot === 1 ? { ...player, eliminated: true } : player)),
      };
      const reading = (state: MatchState) =>
        botTurn(
          (() => {
            const memory = createBotMemory();
            sensesFor(seenAt1, 0, windowOf(seenAt1), memory);
            return sensesFor(state, 0, windowOf(state), memory);
          })(),
          createRng(seed),
          "normal",
          DEFAULT_BOT,
        );
      expect(reading(dead)).toEqual(reading(alive));
      // And the reading really is what both decisions use, not the map's middle.
      const left = reading(alive)[0] as FireInput;
      const memory = createBotMemory();
      memory.impact = null;
      expect(landingX(alive, left.angle, left.bar, left.weaponSlot)).toBeLessThan(1_900 - 400);
    }

    // The equivalence above is not vacuous: the one fact the seat does read — the wind — really moves the shot.
    const windy = { ...wide, weather: { wind: { magnitude: 20, directionDeg: 0, sector: 0 }, rolledAtRound: 1 } };
    const gusty = botTurn(sensesFor(windy, 0, windowOf(windy), createBotMemory()), createRng(0), "normal", DEFAULT_BOT);
    expect(JSON.stringify(gusty)).not.toBe(aims[0]);
  });

  it("TC-BAL-148: a match the bot can see ends instead of hanging", () => {
    // The blind bot cannot end a match against an idle human at the spawn gap (§ 5: it fires at the map middle), so
    // the ending is proved where the story's own arithmetic allows it: two hulls inside one screen.
    let state = openField("mbl-02", 300, 600);
    const memory = createBotMemory();
    let turns = 0;
    while (state.status !== "ended" && turns < 240) {
      turns += 1;
      const now = NOW + 60_000 * turns;
      state = passTurn(state, now).state;
      if (state.status === "ended") break;
      const active = state.turn.activeSlot;
      const plan = botTurn(sensesFor(state, active, windowFor(state, active), memory), createRng(7 + turns), "normal", DEFAULT_BOT);
      for (const input of plan) state = applyInput(state, { ...input, seq: state.seq + 1 }, now).state;
    }
    expect(turns).toBeLessThan(240);
    expect(state.status).toBe("ended");
    expect(state.winnerTeam === "A" || state.winnerTeam === "B").toBe(true);
  });
});

describe("TC-CORE-946: a bot keeps playing when the human's clock runs out (US-CORE-005 AC5)", () => {
  it("skips the silent human's turn, fires on its own, and the match reaches an end", () => {
    // Migrated by US-BAL-006: the bot is blind now, so the two hulls are placed inside one screen; at the spawn gap
    // it could fire forever at the map middle without ever meeting the human (see the story's delivery note).
    let state = openField("mbl-01", 300, 600);
    const next = passTurn(state, NOW + 60_000).state;
    expect(next.turn.activeSlot).toBe(1);
    const active = next.turn.activeSlot;
    const memory = createBotMemory();
    const shot = botShot(sensesFor(next, active, windowFor(next, active), memory), createRng(7), "normal", EXACT);
    const bot = getMobile(next.players.find((player) => player.slot === active)!.mobileId);
    expect(shot.kind).toBe("fire");
    expect(shot.slot).toBe(active);
    expect(shot.angle).toBeGreaterThanOrEqual(bot.angleMin);
    expect(shot.angle).toBeLessThanOrEqual(bot.angleMax);
    expect(shot.bar).toBeGreaterThanOrEqual(0);
    expect(shot.bar).toBeLessThanOrEqual(TUNABLES.powerBarMax);
    // Three decimals, so a replay of the same seed cannot disagree in the last bits (`US-BAL-006` AC5).
    expect(Math.abs(shot.bar * 1_000 - Math.round(shot.bar * 1_000))).toBeLessThan(1e-9);

    // Keep skipping the absent human and letting the bot shoot: a match with nobody at the controls must
    // still finish rather than hang on a turn the human will never take.
    state = next;
    let turns = 0;
    while (state.status !== "ended" && turns < 240) {
      turns += 1;
      const skipped = passTurn(state, NOW + 60_000 * (turns + 1)).state;
      state = skipped;
      if (state.status === "ended") break;
      const active = state.turn.activeSlot;
      const answer = botTurn(sensesFor(state, active, windowFor(state, active), memory), createRng(7 + turns), "normal", EXACT);
      for (const input of answer) {
        state = applyInput(state, { ...input, seq: state.seq + 1 }, NOW + 60_000 * (turns + 1)).state;
      }
    }
    expect(state.status).toBe("ended");
    expect(state.winnerTeam === "A" || state.winnerTeam === "B").toBe(true);
  });
});
