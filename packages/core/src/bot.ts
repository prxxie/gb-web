import type { FireInput, MatchState, PlayerState, Rng } from "./types.js";
import { getMobile } from "./data/mobiles.js";
import { getMap } from "./data/maps.js";
import { launch, simulateFlight } from "./ballistics.js";
import { TUNABLES } from "./tuning.js";
import type { Terrain } from "./terrain.js";

export interface BotConfig {
  /** Aim error in degrees, drawn per shot. 0 makes the bot perfect (used by tests). */
  readonly angleNoiseDeg: number;
  /** Power error as a fraction of max power. */
  readonly powerNoise: number;
  /** Chance to reach for the super shot when a target is nearly finished. */
  readonly superShotChance: number;
}

export const DEFAULT_BOT: BotConfig = {
  angleNoiseDeg: 1.2,
  powerNoise: 0.015,
  superShotChance: 0.35,
};

function livingEnemies(state: MatchState, bot: PlayerState): readonly PlayerState[] {
  return state.players.filter((player) => !player.eliminated && player.team !== bot.team);
}

function chooseTarget(state: MatchState, bot: PlayerState): PlayerState | undefined {
  const enemies = livingEnemies(state, bot);
  if (enemies.length === 0) return undefined;
  // Prefer the enemy that is cheapest to finish: lowest effective health first.
  return [...enemies].sort((a, b) => a.hp + a.shield - (b.hp + b.shield))[0];
}

interface Aim {
  readonly angle: number;
  readonly force: number;
  readonly error: number;
}

/**
 * Aim at a target by simulating the real integrator.
 *
 * A coarse grid over the mobile's own angle window and power range; deterministic for a given state
 * and RNG, so a replay reproduces the bot's shots (`NFR-28`).
 */
export function botShot(
  state: MatchState,
  slot: number,
  rng: Rng,
  config: BotConfig = DEFAULT_BOT,
): FireInput | null {
  const bot = state.players.find((player) => player.slot === slot);
  if (!bot || bot.eliminated) return null;
  const target = chooseTarget(state, bot);
  if (!target) return null;

  const mobile = getMobile(bot.mobileId);
  const map = getMap(state.mapId);
  const terrain: Terrain = {
    step: state.terrainStep,
    heights: Float64Array.from(state.terrain),
    width: TUNABLES.mapWidth,
  };
  const gravity = mobile.gravity * map.gravityModifier;
  const wind = state.weather.wind;

  const bestFor = (weaponSlot: 0 | 1 | 2): Aim => {
    let bestAngle = (mobile.angleMin + mobile.angleMax) / 2;
    let bestForce = mobile.maxPower * 0.7;
    let bestError = Number.POSITIVE_INFINITY;
    for (let angle = mobile.angleMin; angle <= mobile.angleMax; angle += 2) {
      for (let force = 20; force <= mobile.maxPower; force += 5) {
        const projectile = launch({
          id: 0,
          ownerSlot: slot,
          weaponSlot,
          weapon: mobile.weapons[weaponSlot],
          from: { x: bot.x, y: bot.y },
          facing: bot.facing,
          angle,
          force,
        });
        const flight = simulateFlight(projectile, { wind, gravity, mass: mobile.mass, stepMs: 50 }, terrain);
        const error = Math.abs(flight.landingX - target.x);
        if (error < bestError) {
          bestError = error;
          bestAngle = angle;
          bestForce = force;
        }
      }
    }
    return { angle: bestAngle, force: bestForce, error: bestError };
  };

  const finisher = target.hp + target.shield <= mobile.weapons[2].power * 1.6;
  const weaponSlot: 0 | 1 | 2 = finisher && rng.float(0, 1) < config.superShotChance ? 2 : 0;
  const pick = bestFor(weaponSlot);

  const noiseAngle = (rng.float(0, 1) * 2 - 1) * config.angleNoiseDeg;
  const noisePower = (rng.float(0, 1) * 2 - 1) * config.powerNoise * mobile.maxPower;

  return {
    kind: "fire",
    seq: state.seq,
    slot,
    weaponSlot,
    angle: Math.min(mobile.angleMax, Math.max(mobile.angleMin, Math.round((pick.angle + noiseAngle) * 10) / 10)),
    force: Math.max(0, Math.min(mobile.maxPower, Math.round(pick.force + noisePower))),
  };
}

/** A bot's whole turn: aim, then fire (the caller applies the input). */
export function botTurn(state: MatchState, rng: Rng, config: BotConfig = DEFAULT_BOT): FireInput | null {
  return botShot(state, state.turn.activeSlot, rng, config);
}
