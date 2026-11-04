import type { MapDef, MatchState, PlayerState, Weather } from "./types.js";
import { TUNABLES, clamp, roundTo } from "./tuning.js";
import { createRng } from "./rng.js";
import { rollWind } from "./weather.js";

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
  | { readonly kind: "heal"; readonly slot: number; readonly amount: number }
  | { readonly kind: "electric"; readonly slot: number; readonly amount: number }
  | { readonly kind: "tornado"; readonly x: number; readonly magnitude: number };

export const GIMMICK_IDS = ["force", "gust", "electric", "wind", "return", "heal", "fog", "tornado"] as const;

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

  if (map.gimmicks.includes("force") || map.gimmicks.includes("gust")) {
    const rng = gimmickRng(state.seed, round, 1);
    const base = rollWind(rng);
    const wind = map.gimmicks.includes("gust")
      ? { ...base, magnitude: Math.max(base.magnitude, 10), sector: (base.sector + 6) % TUNABLES.windSectors }
      : base;
    weather = {
      wind: { ...wind, directionDeg: wind.sector * (360 / TUNABLES.windSectors) },
      rolledAtRound: round,
    };
  }

  if (map.gimmicks.includes("wind") && weather.wind.magnitude < 8) {
    weather = { ...weather, wind: { ...weather.wind, magnitude: 8 }, rolledAtRound: round };
  }

  if (map.gimmicks.includes("heal")) {
    players = players.map((player) => {
      if (player.eliminated) return player;
      const heal = Math.round(TUNABLES.healFraction * 1200);
      const hp = clamp(player.hp + heal, 0, 1200);
      if (hp !== player.hp) events.push({ kind: "heal", slot: player.slot, amount: hp - player.hp });
      return { ...player, hp };
    });
  }

  if (map.gimmicks.includes("electric")) {
    const living = players.filter((player) => !player.eliminated);
    if (living.length > 0) {
      const rng = gimmickRng(state.seed, round, 2);
      const victim = living[rng.int(0, living.length - 1)];
      if (victim) {
        const damage = 40;
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
    events.push({ kind: "tornado", x, magnitude: weather.wind.magnitude });
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
