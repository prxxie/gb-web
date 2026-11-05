import type { MapDef, MatchState, PlayerState, Weather } from "./types.js";
import { getMobile } from "./data/mobiles.js";
import { heightAt, type Terrain } from "./terrain.js";
import { TUNABLES, clamp, roundTo } from "./tuning.js";
import { createRng } from "./rng.js";
import { rollWeather } from "./weather.js";

/**
 * Stage gimmicks (`US-CORE-011`).
 *
 * Every gimmick is a pure function of the map, the round and the seed, so a replay or a late-joining
 * peer reproduces it: nothing here reads a clock, a socket or `Math.random()` (`NFR-28`).
 */
export interface GimmickEffect {
  /** Wind replaced for this round (gust and wind). */
  readonly weather: Weather | null;
  readonly players: readonly PlayerState[];
  readonly events: readonly GimmickEvent[];
}

export type GimmickEvent =
  | { readonly kind: "force"; readonly magnitude: number }
  | { readonly kind: "gust"; readonly magnitude: number }
  | { readonly kind: "heal"; readonly slot: number; readonly amount: number }
  | { readonly kind: "electric"; readonly slot: number; readonly amount: number }
  | { readonly kind: "tornado"; readonly x: number; readonly magnitude: number };

export const GIMMICK_IDS = ["force", "gust", "electric", "wind", "return", "heal", "fog", "tornado"] as const;

/** The constant sideways field a `force` map adds to every projectile, in units/s² (`TC-CORE-918`). */
export const FORCE_FIELD = 60;
/** A `gust` spike multiplies the round's wind by four, capped at `windMax` (`tunables.md` § 6). */
export const GUST_FACTOR = 4;
/** `electric` strikes every third turn (`tunables.md` § 6). */
export const ELECTRIC_EVERY = 3;
/** `electric` damage and `heal` amount, from the reference table, not the AC's placeholder numbers. */
export const ELECTRIC_DAMAGE = 150;
export const HEAL_AMOUNT = 100;
/** A tornado throws the units it covers this far sideways (`TC-CORE-919`). */
export const TORNADO_PUSH = 60;

function gimmickRng(seed: number, round: number, salt: number) {
  return createRng((seed ^ Math.imul(round + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0);
}

/**
 * Apply the map's per-round gimmicks.
 *
 * - `force`: the round starts with a strong wind reroll.
 * - `gust`: the wind direction flips to the opposite sector.
 * - `wind`: a calm round is forced to at least magnitude 8.
 * - `heal`: every unit recovers 8 % of max HP (capped at its maximum).
 * - `electric`: one deterministic unit takes 40 damage.
 * - `tornado`: a tornado spawns and is published as an event; the client draws it and the
 *   `force`-style push is part of the wind.
 * - `fog` and `return` are presentation/rules flags the scene reads (`visibility`, out-of-map shots).
 */
export function applyGimmicks(state: MatchState, round: number, map: MapDef): GimmickEffect {
  const events: GimmickEvent[] = [];
  let weather = state.weather;
  let players = state.players;

  if (map.gimmicks.includes("force")) {
    // The field is constant, so the HUD only has to announce it once per round (`TC-CORE-918`).
    events.push({ kind: "force", magnitude: FORCE_FIELD });
  }

  if (map.gimmicks.includes("gust")) {
    const base = rollWeather(state.seed, round).wind;
    const magnitude = Math.min(TUNABLES.windMax, base.magnitude * GUST_FACTOR);
    weather = { wind: { ...base, magnitude }, rolledAtRound: round };
    events.push({ kind: "gust", magnitude });
  }

  if (map.gimmicks.includes("wind") && weather.wind.magnitude < 8) {
    weather = { ...weather, wind: { ...weather.wind, magnitude: 8 }, rolledAtRound: round };
  }

  if (map.gimmicks.includes("heal")) {
    players = players.map((player) => {
      if (player.eliminated) return player;
      const maxHp = getMobile(player.mobileId as Parameters<typeof getMobile>[0]).maxHp;
      const hp = clamp(player.hp + HEAL_AMOUNT, 0, maxHp);
      if (hp !== player.hp) events.push({ kind: "heal", slot: player.slot, amount: hp - player.hp });
      return { ...player, hp };
    });
  }

  if (map.gimmicks.includes("electric") && round % ELECTRIC_EVERY === 0) {
    const living = players.filter((player) => !player.eliminated);
    if (living.length > 0) {
      const rng = gimmickRng(state.seed, round, 2);
      const victim = living[rng.int(0, living.length - 1)];
      if (victim) {
        const damage = ELECTRIC_DAMAGE;
        const absorbed = Math.min(victim.shield, damage);
        const hp = Math.max(0, victim.hp - (damage - absorbed));
        players = players.map((player) =>
          player.slot === victim.slot ? { ...player, hp, shield: player.shield - absorbed, eliminated: hp <= 0 } : player,
        );
        events.push({ kind: "electric", slot: victim.slot, amount: damage });
      }
    }
  }

  if (map.gimmicks.includes("tornado")) {
    const rng = gimmickRng(state.seed, round, 3);
    const x = roundTo(rng.int(200, TUNABLES.mapWidth - 200));
    const magnitude = weather.wind.magnitude;
    events.push({ kind: "tornado", x, magnitude });
    // Units the funnel covers are thrown sideways, never into the ground (`TC-CORE-919`).
    const terrain: Terrain = {
      step: TUNABLES.terrainStep,
      heights: Float64Array.from(state.terrain),
      width: TUNABLES.mapWidth,
    };
    players = players.map((player) => {
      if (player.eliminated || Math.abs(player.x - x) > magnitude * 8 + TORNADO_PUSH) return player;
      const direction = player.x < x ? -1 : 1;
      const movedX = roundTo(clamp(player.x + direction * TORNADO_PUSH, 0, TUNABLES.mapWidth));
      return { ...player, x: movedX, y: heightAt(terrain, movedX) - 8 };
    });
  }

  return { weather, players, events };
}

/** Fog halves the visible window (`fog` maps); the camera reads this. */
export function visibilityMultiplier(map: MapDef): number {
  return map.gimmicks.includes("fog") ? 0.5 : 1;
}

/** Shots that leave the map come back on `return` maps instead of counting as a miss. */
export function returnsOffMapShots(map: MapDef): boolean {
  return map.gimmicks.includes("return");
}
