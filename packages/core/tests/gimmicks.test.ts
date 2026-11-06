import { describe, expect, it } from "vitest";
import { getMap } from "../src/data/maps.js";
import { getMobile } from "../src/data/mobiles.js";
import {
  GIMMICK_IDS,
  HEAL_ZONE_RADIUS,
  HEAL_ZONE_X,
  applyGimmicks,
  returnsOffMapShots,
  visibilityMultiplier,
  type GimmickEffect,
  type GimmickEvent,
} from "../src/gimmicks.js";
import { applyInput, createMatch, terrainOf, type MatchEvent, type Seat } from "../src/match.js";
import { groundY } from "../src/terrain.js";
import { TUNABLES } from "../src/tuning.js";
import { rollWeather } from "../src/weather.js";
import type { MatchState, Weather } from "../src/types.js";

/**
 * Oracle tests for `US-CORE-011` (stage gimmicks) against `docs/02-reference/gameplay/tunables.md`.
 *
 * The gimmicks are pure functions of map, round and seed, so every expectation is deterministic:
 * the same map and round must always produce the same wind, the same strike and the same tornado.
 */

const NOW = 1_700_000_000_000;

function seat(slot: number, team: "A" | "B", mobileId = "mbl-01"): Seat {
  return { slot, team, accountId: null, displayName: `p${slot}`, mobileId };
}

function match(mapId: string, seats: readonly Seat[] = [seat(0, "A"), seat(1, "B")]): MatchState {
  return createMatch({
    matchId: "match-1",
    roomCode: "ABC234",
    seed: 7,
    mode: "solo",
    mapId,
    seats,
    now: NOW,
  });
}

function fire(state: MatchState, slot: number, weaponSlot: 0 | 1 | 2, angle: number, force: number) {
  return applyInput(state, { kind: "fire", slot, weaponSlot, angle, force, seq: state.seq }, NOW);
}

function firstOf<K extends MatchEvent["kind"]>(
  events: readonly MatchEvent[],
  kind: K,
): Extract<MatchEvent, { kind: K }> {
  for (const event of events) {
    if (event.kind === kind) return event as Extract<MatchEvent, { kind: K }>;
  }
  throw new Error(`expected a ${kind} event`);
}

function gimmickOf<K extends GimmickEvent["kind"]>(
  effect: GimmickEffect,
  kind: K,
): Extract<GimmickEvent, { kind: K }> {
  for (const event of effect.events) {
    if (event.kind === kind) return event as Extract<GimmickEvent, { kind: K }>;
  }
  throw new Error(`expected a ${kind} gimmick event`);
}

/** Put the first player on the right edge, facing off the field. */
function atRightEdge(state: MatchState): MatchState {
  const terrain = terrainOf(state);
  const x = TUNABLES.mapWidth - 10;
  return {
    ...state,
    players: state.players.map((player) =>
      player.slot === 0 ? { ...player, x, y: groundY(terrain, x) - 8, facing: 1 } : player,
    ),
  };
}

function weatherOf(effect: GimmickEffect): Weather {
  if (!effect.weather) throw new Error("expected the gimmick to replace the weather");
  return effect.weather;
}

/** First round in the opening weather sequence whose own wind is a usable spike base. */
function gustRound(state: MatchState): number {
  for (let round = 1; round <= 8; round += 1) {
    const magnitude = rollWeather(state.seed, round).wind.magnitude;
    if (magnitude > 0 && magnitude * 4 <= TUNABLES.windMax) return round;
  }
  throw new Error("no calm round in the first eight");
}

describe("gimmicks", () => {
  it("TC-CORE-918: the force map pushes shells with a constant field and announces it", () => {
    const state = match("map-07");
    const effect = applyGimmicks(state, 2, getMap("map-07"));
    const kinds: readonly string[] = effect.events.map((event) => event.kind);
    expect(GIMMICK_IDS).toContain("force");
    expect(kinds).toContain("force");
  });

  it("TC-CORE-918: Gust multiplies the round wind four times for one turn", () => {
    const state = match("map-03");
    const round = gustRound(state);
    const base = rollWeather(state.seed, round).wind;
    const effect = applyGimmicks(state, round, getMap("map-03"));
    const gusted = weatherOf(effect);

    expect(gusted.wind.magnitude).toBe(Math.min(TUNABLES.windMax, base.magnitude * 4));
    expect(gusted.wind.sector).toBe(base.sector);
    expect(gusted.rolledAtRound).toBe(round);
    expect(effect.events.map((event) => event.kind)).toContain("gust");
  });

  it("TC-CORE-918: the gust spike is reverted when the turn is over", () => {
    const state = match("map-03");
    const round = gustRound(state);
    const effect = applyGimmicks(state, round, getMap("map-03"));
    const gusted: MatchState = {
      ...state,
      weather: weatherOf(effect),
      players: effect.players,
      turn: { ...state.turn, round, activeSlot: state.players[0]!.slot },
    };

    const after = applyInput(
      gusted,
      { kind: "skip", slot: gusted.turn.activeSlot, seq: gusted.seq },
      NOW,
    ).state;
    expect(after.weather.wind.magnitude).toBe(rollWeather(state.seed, round).wind.magnitude);
    expect(after.weather.wind.sector).toBe(rollWeather(state.seed, round).wind.sector);
  });

  it("TC-CORE-919: the electric gimmick strikes on every third turn only", () => {
    const map = getMap("map-04");
    const state = match("map-04");

    for (const round of [1, 2, 4, 5]) {
      expect(applyGimmicks(state, round, map).events.map((event) => event.kind)).not.toContain(
        "electric",
      );
    }
    expect(applyGimmicks(state, 3, map).events.map((event) => event.kind)).toContain("electric");
  });

  it("TC-CORE-919: an electric strike deals 150 damage", () => {
    const effect = applyGimmicks(match("map-04"), 3, getMap("map-04"));
    const strike = gimmickOf(effect, "electric");
    expect(strike.amount).toBe(150);
  });

  it("TC-CORE-919: a unit in the heal zone regains 100 HP at turn start", () => {
    const state = match("map-02");
    const wounded: MatchState = {
      ...state,
      players: state.players.map((player) =>
        player.slot === 0 ? { ...player, x: HEAL_ZONE_X, hp: Math.max(1, player.hp - 400) } : player,
      ),
    };

    const effect = applyGimmicks(wounded, 2, getMap("map-02"));
    const heal = gimmickOf(effect, "heal");
    expect(heal.slot).toBe(0);
    expect(heal.amount).toBe(100);
    expect(effect.players.find((player) => player.slot === 0)!.hp).toBe(
      wounded.players.find((player) => player.slot === 0)!.hp + 100,
    );
  });

  it("TC-CORE-919: a unit outside the heal zone gains nothing", () => {
    const state = match("map-02");
    const outside: MatchState = {
      ...state,
      players: state.players.map((player) =>
        player.slot === 0 ? { ...player, x: HEAL_ZONE_X + HEAL_ZONE_RADIUS + 40, hp: 200 } : player,
      ),
    };
    const healed = applyGimmicks(outside, 2, getMap("map-02"));
    expect(healed.events.some((event) => event.kind === "heal")).toBe(false);
    expect(healed.players.find((player) => player.slot === 0)!.hp).toBe(200);
  });

  it("TC-CORE-919: the heal zone never takes a unit above its own maximum health", () => {
    const state = match("map-02");
    const mobile = getMobile("mbl-01");
    const nearFull: MatchState = {
      ...state,
      players: state.players.map((player) =>
        player.slot === 0 ? { ...player, x: HEAL_ZONE_X, hp: mobile.maxHp - 5 } : player,
      ),
    };

    const healed = applyGimmicks(nearFull, 2, getMap("map-02"));
    expect(healed.players.find((player) => player.slot === 0)!.hp).toBe(mobile.maxHp);
  });

  it("TC-CORE-918: a wind map re-rolls twice and plays the second roll", () => {
    const state = match("map-05");
    const played = applyGimmicks(state, 2, getMap("map-05"));
    // The map rolls its weather for the round; the gimmick rolls again and the second roll is the one that
    // stands, so the result is the roll of round × 2 and not the round's own weather.
    expect(played.weather.rolledAtRound).toBe(2);
    expect(played.weather.wind).toEqual(rollWeather(state.seed, 4).wind);
    expect(played.weather.wind).not.toEqual(rollWeather(state.seed, 2).wind);
  });

  it("TC-CORE-931: fog halves the visible window and leaves the battle state alone", () => {
    const state = match("map-08");
    expect(visibilityMultiplier(getMap("map-08"))).toBe(0.5);
    expect(visibilityMultiplier(getMap("map-01"))).toBe(1);

    const effect = applyGimmicks(state, 2, getMap("map-08"));
    expect(effect.weather).toBe(state.weather);
    expect(effect.players).toBe(state.players);
  });

  it("TC-CORE-919: a tornado displaces the units it spawns on by 60 px without burying them", () => {
    const map = getMap("map-06");
    const state = match("map-06");
    const tornado = gimmickOf(applyGimmicks(state, 2, map), "tornado");

    const placed: MatchState = {
      ...state,
      players: state.players.map((player) =>
        player.slot === 0 ? { ...player, x: tornado.x } : player,
      ),
    };
    const after = applyGimmicks(placed, 2, map).players;
    const moved = after.find((player) => player.slot === 0)!;

    expect(Math.abs(moved.x - tornado.x)).toBe(60);
    expect(moved.y).toBeLessThan(groundY(terrainOf(placed), moved.x));
  });

  it("TC-CORE-955: on a return map an off-map shot comes back instead of despawning", () => {
    expect(returnsOffMapShots(getMap("map-09"))).toBe(true);
    expect(returnsOffMapShots(getMap("map-01"))).toBe(false);

    const control = firstOf(fire(atRightEdge(match("map-01")), 0, 0, 45, 98).events, "shot");
    expect(control.impact).toBeNull();
    expect(Math.max(...control.path.map((point) => point.x))).toBeGreaterThan(TUNABLES.mapWidth);

    const returned = firstOf(fire(atRightEdge(match("map-09")), 0, 0, 45, 98).events, "shot");
    expect(returned.impact).not.toBeNull();
    const landing = returned.impact ?? returned.path.at(-1);
    expect(Math.abs(landing?.x ?? 0)).toBeLessThanOrEqual(TUNABLES.mapWidth);
  });
});
