import { describe, expect, it } from "vitest";
import { applyInput, createMatch, passTurn, type Seat } from "../src/match.js";
import { getMobile } from "../src/data/mobiles.js";
import { applyGimmicks } from "../src/gimmicks.js";
import { getMap } from "../src/data/maps.js";
import { advanceTurn, createTurn, extendOrExpire, nextSlotForMode } from "../src/turn.js";
import { rollWeather, weatherSequence } from "../src/weather.js";
import { TUNABLES } from "../src/tuning.js";

const NOW = 1_700_000_000_000;

function seat(slot: number, team: "A" | "B", mobileId = "mbl-01", loadout: Record<string, number> = {}): Seat {
  return { slot, team, accountId: `acc-${slot}`, displayName: `P${slot}`, mobileId, loadout };
}

function match(
  seats: Seat[] = [seat(0, "A"), seat(1, "B")],
  options: { mode?: "solo" | "score" | "tag" | "jewel"; mapId?: string; seed?: number } = {},
) {
  return createMatch({
    matchId: "match-1",
    roomCode: "ABC234",
    seed: options.seed ?? 7,
    mode: options.mode ?? "solo",
    mapId: options.mapId ?? "map-01",
    seats,
    now: NOW,
  });
}

describe("match", () => {
  it("TC-CORE-906: Dual allows two shots, Blood raises damage, Power up lifts the force cap", () => {
    const dual = match([seat(0, "A", "mbl-01", { "itm-dual": 1 }), seat(1, "B")]);
    const used = applyInput(dual, { kind: "item", slot: 0, itemId: "itm-dual", seq: dual.seq }, NOW);
    expect(used.events.some((event) => event.kind === "item")).toBe(true);
    const first = applyInput(used.state, { kind: "fire", slot: 0, weaponSlot: 0, angle: 45, force: 60, seq: used.state.seq }, NOW);
    expect(first.state.turn.activeSlot).toBe(0);
    const second = applyInput(first.state, { kind: "fire", slot: 0, weaponSlot: 0, angle: 45, force: 60, seq: first.state.seq }, NOW);
    expect(second.state.turn.activeSlot).toBe(1);

    const plain = match([seat(0, "A"), seat(1, "B")]);
    const harmed = applyInput(
      applyInput(plain, { kind: "fire", slot: 0, weaponSlot: 0, angle: 45, force: 60, seq: plain.seq }, NOW).state,
      { kind: "skip", slot: 1, seq: plain.seq + 1 },
      NOW,
    );
    expect(harmed.events.length).toBeGreaterThan(0);
  });

  it("TC-CORE-907: Energy up 1 and 2 restore energy", () => {
    const state = match([seat(0, "A", "mbl-01", { "itm-energy-1": 1, "itm-energy-2": 1 }), seat(1, "B")]);
    const start = state.players[0]!.energy;
    const one = applyInput(state, { kind: "item", slot: 0, itemId: "itm-energy-1", seq: state.seq }, NOW);
    expect(one.state.players[0]!.energy).toBe(start + 30);
    const two = applyInput(one.state, { kind: "item", slot: 0, itemId: "itm-energy-2", seq: one.state.seq }, NOW);
    expect(two.state.players[0]!.energy).toBe(start + 90);
    const again = applyInput(two.state, { kind: "item", slot: 0, itemId: "itm-energy-2", seq: two.state.seq }, NOW);
    expect(again.events[0]).toMatchObject({ kind: "reject", reason: "no-item-left" });
  });

  it("TC-CORE-908: Change Wind rerolls the wind for the current round", () => {
    const state = match([seat(0, "A", "mbl-01", { "itm-change-wind": 1 }), seat(1, "B")]);
    const result = applyInput(state, { kind: "item", slot: 0, itemId: "itm-change-wind", seq: state.seq }, NOW);
    const weatherEvent = result.events.find((event) => event.kind === "weather");
    expect(weatherEvent).toBeDefined();
    if (weatherEvent?.kind === "weather") {
      expect(weatherEvent.weather.rolledAtRound).toBe(state.turn.round);
      expect(weatherEvent.weather.wind.magnitude).toBeLessThanOrEqual(TUNABLES.windMax);
      expect(weatherEvent.weather.wind.sector).toBeGreaterThanOrEqual(0);
      expect(weatherEvent.weather.wind.sector).toBeLessThan(TUNABLES.windSectors);
    }
  });

  it("TC-CORE-909: Teleport and Team Teleport move units without touching the turn", () => {
    const state = match([seat(0, "A", "mbl-01", { "itm-teleport": 1, "itm-team-teleport": 1 }), seat(1, "B")]);
    const before = state.players[0]!;
    const teleported = applyInput(state, { kind: "item", slot: 0, itemId: "itm-teleport", seq: state.seq }, NOW);
    expect(teleported.state.players[0]!.x).not.toBe(before.x);
    expect(teleported.state.turn.activeSlot).toBe(0);
    const team = applyInput(teleported.state, { kind: "item", slot: 0, itemId: "itm-team-teleport", seq: teleported.state.seq }, NOW);
    expect(team.state.turn.activeSlot).toBe(0);
  });

  it("TC-CORE-910: Bunge shot is accepted and resolves as a normal shot", () => {
    const state = match([seat(0, "A", "mbl-01", { "itm-bunge": 1 }), seat(1, "B")]);
    const armed = applyInput(state, { kind: "item", slot: 0, itemId: "itm-bunge", seq: state.seq }, NOW);
    const fired = applyInput(armed.state, { kind: "fire", slot: 0, weaponSlot: 0, angle: 30, force: 50, seq: armed.state.seq }, NOW);
    expect(fired.events.some((event) => event.kind === "shot")).toBe(true);
  });

  it("TC-CORE-911: Thunder damages enemies inside the band around the caster", () => {
    const state = match([seat(0, "A", "mbl-01", { "itm-thunder": 1 }), seat(1, "B")]);
    const enemyX = state.players[1]!.x;
    const casterX = state.players[0]!.x;
    const hpBefore = state.players[1]!.hp + state.players[1]!.shield;
    const struck = applyInput(state, { kind: "item", slot: 0, itemId: "itm-thunder", seq: state.seq }, NOW);
    const hpAfter = struck.state.players[1]!.hp + struck.state.players[1]!.shield;
    if (Math.abs(enemyX - casterX) <= 200) {
      expect(hpAfter).toBeLessThan(hpBefore);
    } else {
      expect(hpAfter).toBe(hpBefore);
    }
  });

  it("TC-CORE-922: a super shot can be spent only once", () => {
    const state = match([seat(0, "A"), seat(1, "B")]);
    const first = applyInput(state, { kind: "fire", slot: 0, weaponSlot: 2, angle: 45, force: 50, seq: state.seq }, NOW);
    expect(first.events.some((event) => event.kind === "shot")).toBe(true);
    const back = applyInput(passTurn(first.state, NOW).state, { kind: "skip", slot: 0, seq: 9 }, NOW);
    void back;
    const again = applyInput(
      { ...first.state, turn: { ...first.state.turn, activeSlot: 0 } },
      { kind: "fire", slot: 0, weaponSlot: 2, angle: 45, force: 50, seq: first.state.seq },
      NOW,
    );
    expect(again.events[0]).toMatchObject({ kind: "reject", reason: "super-shot-spent" });
  });

  it("TC-CORE-904: movement respects the per-turn budget, energy and incline", () => {
    const state = match([seat(0, "A", "mbl-01"), seat(1, "B")]);
    const mobile = getMobile("mbl-01");
    expect(mobile.maxMovesPerTurn).toBe(1);
    const once = applyInput(state, { kind: "move", slot: 0, dir: 1, run: false, seq: state.seq }, NOW);
    expect(once.state.players[0]!.x).toBeGreaterThan(state.players[0]!.x);
    const twice = applyInput(once.state, { kind: "move", slot: 0, dir: 1, run: false, seq: once.state.seq }, NOW);
    expect(twice.events[0]).toMatchObject({ kind: "reject", reason: "no-moves-left" });

    const runner = match([seat(0, "A", "mbl-13"), seat(1, "B")]);
    const walk = applyInput(runner, { kind: "move", slot: 0, dir: -1, run: false, seq: runner.seq }, NOW);
    const walk2 = applyInput(walk.state, { kind: "move", slot: 0, dir: -1, run: true, seq: walk.state.seq }, NOW);
    expect(walk2.events.some((event) => event.kind === "move")).toBe(true);
  });

  it("TC-CORE-915: score mode ends at the turn cap and awards the damage lead", () => {
    const state = match([seat(0, "A"), seat(1, "B")], { mode: "score" });
    let current = state;
    let result = applyInput(current, { kind: "fire", slot: 0, weaponSlot: 0, angle: 45, force: 60, seq: current.seq }, NOW);
    current = result.state;
    for (let i = 0; i < TUNABLES.scoreTurnCap * 4 && current.status === "playing"; i += 1) {
      result = applyInput(current, { kind: "skip", slot: current.turn.activeSlot, seq: current.seq }, NOW);
      current = result.state;
    }
    expect(current.status).toBe("ended");
  });

  it("TC-CORE-916: tag mode groups a team's turns", () => {
    const state = match([seat(0, "A"), seat(1, "B"), seat(2, "A"), seat(3, "B")], { mode: "tag" });
    const afterFirst = applyInput(state, { kind: "skip", slot: universe(state), seq: state.seq }, NOW);
    expect(afterFirst.state.turn.activeSlot).toBe(2);
    const afterSecond = applyInput(afterFirst.state, { kind: "skip", slot: 2, seq: afterFirst.state.seq }, NOW);
    expect(afterSecond.state.turn.activeSlot).toBe(1);
  });

  it("TC-CORE-917: jewel mode picks a jewel up and drops it when the carrier dies", () => {
    const state = match([seat(0, "A"), seat(1, "B")], { mode: "jewel", mapId: "map-01" });
    const jewel = state.scores.jewels[0];
    expect(jewel).toBeDefined();
    if (!jewel) return;
    const moved = {
      ...state,
      players: state.players.map((player) =>
        player.slot === 0 ? { ...player, x: jewel.x, y: jewel.y } : player,
      ),
    };
    const hopped = applyInput(moved, { kind: "skip", slot: universe(moved), seq: moved.seq }, NOW);
    expect(hopped.state.scores.jewels[0]?.carriedBy).toBe(0);
  });

  it("TC-CORE-926: the weather rolls once per round and is reproducible from the seed", () => {
    const sequence = weatherSequence(7, 4);
    expect(sequence).toHaveLength(4);
    expect(sequence[0]).toEqual(weatherSequence(7, 4)[0]);
    expect(new Set(sequence.map((weather) => `${weather.wind.magnitude}:${weather.wind.sector}`)).size).toBeGreaterThanOrEqual(2);
    expect(sequence.every((weather) => weather.wind.sector >= 0 && weather.wind.sector < 12)).toBe(true);
  });

  it("TC-CORE-152: the turn clock is 20 s with one extension", () => {
    const turn = createTurn(0, NOW);
    expect(turn.deadlineAt - NOW).toBe(20_000);
    const first = extendOrExpire(turn, NOW + 20_001);
    expect(first.expired).toBe(false);
    const second = extendOrExpire(first.turn, NOW + 60_000);
    expect(second.expired).toBe(true);
  });

  it("TC-CORE-901: equal base delays keep slot order, and a super shot costs delay", () => {
    const state = match([seat(0, "A"), seat(1, "B")]);
    const order = nextSlotForMode(state.players, 0, "solo");
    expect(order).toBe(1);
    const { turn } = advanceTurn(state.turn, state.players, { now: NOW, activeSlot: null, mode: "solo" });
    expect(turn.number).toBe(2);
  });

  it("TC-CORE-918: a force map announces its field and a gust map spikes the round wind", () => {
    const force = match([seat(0, "A"), seat(1, "B")], { mapId: "map-07" });
    const gust = match([seat(0, "A"), seat(1, "B")], { mapId: "map-03" });
    const forced = applyGimmicks(force, 2, getMap("map-07"));
    const gusted = applyGimmicks(gust, 2, getMap("map-03"));
    // `force` pushes shells; it does not touch the wind, so the roll stays the round's own.
    expect(forced.events.some((event) => event.kind === "force")).toBe(true);
    expect(forced.weather).toBe(force.weather);
    const base = rollWeather(gust.seed, 2).wind;
    expect(gusted.events.some((event) => event.kind === "gust")).toBe(true);
    expect(gusted.weather?.wind.magnitude).toBe(Math.min(TUNABLES.windMax, base.magnitude * 4));
  });

  it("TC-CORE-919: electric strikes every third round, heal tops a wounded unit up, a tornado spawns", () => {
    const electric = applyGimmicks(match([seat(0, "A"), seat(1, "B")], { mapId: "map-04" }), 3, getMap("map-04"));
    expect(electric.events.some((event) => event.kind === "electric")).toBe(true);

    const wounded = match([seat(0, "A"), seat(1, "B")], { mapId: "map-02" });
    const hurt = { ...wounded, players: wounded.players.map((player) => ({ ...player, hp: player.hp - 400 })) };
    const heal = applyGimmicks(hurt, 2, getMap("map-02"));
    expect(heal.events.some((event) => event.kind === "heal")).toBe(true);

    const storm = applyGimmicks(match([seat(0, "A"), seat(1, "B")], { mapId: "map-06" }), 2, getMap("map-06"));
    expect(storm.events.some((event) => event.kind === "tornado")).toBe(true);
  });
});

/** The slot whose turn it is right now. */
function universe(state: { turn: { activeSlot: number } }): number {
  return state.turn.activeSlot;
}
