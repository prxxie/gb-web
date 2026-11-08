import type { FireInput, ItemId, ItemInput, MatchState, PlayerState, Rng } from "./types.js";
import { getMobile } from "./data/mobiles.js";
import { getMap } from "./data/maps.js";
import { launch, simulateFlight } from "./ballistics.js";
import { TUNABLES } from "./tuning.js";
import { FORCE_FIELD, returnsOffMapShots } from "./gimmicks.js";
import type { Terrain } from "./terrain.js";

export interface BotConfig {
  /** Aim error in degrees, drawn per shot. 0 makes the bot perfect (used by tests). */
  readonly angleNoiseDeg: number;
  /** Power error as a fraction of max power. */
  readonly powerNoise: number;
  /** Chance to reach for the super shot when a target is nearly finished. */
  readonly superShotChance: number;
  /** Chance to spend one item before the shot, when it is holding a useful one. */
  readonly itemUseChance: number;
}

export const DEFAULT_BOT: BotConfig = {
  angleNoiseDeg: 1.2,
  powerNoise: 0.015,
  superShotChance: 0.35,
  itemUseChance: 0.25,
};

/**
 * The item a bot reaches for, in the order it prefers them: something that changes the shot before
 * something that changes the map. Only ever returns an item the bot actually holds.
 */
const ITEM_PREFERENCE: readonly ItemId[] = ["itm-power-up", "itm-dual", "itm-dual-plus", "itm-blood"];

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
  // A `force` map pushes the shell sideways and a `return` map bends it back, so the bot has to know.
  const stage = {
    forceX: map.gimmicks.includes("force") ? FORCE_FIELD : 0,
    returnsOffMap: returnsOffMapShots(map),
  };
  const terrain: Terrain = {
    step: state.terrainStep,
    heights: Float64Array.from(state.terrain),
    width: TUNABLES.mapWidth,
  };
  const gravity = TUNABLES.gravity * map.gravityModifier;
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
        const flight = simulateFlight(
          projectile,
          { wind, gravity, stepMs: 50, forceX: stage.forceX },
          terrain,
          undefined,
          { returnOffMap: stage.returnsOffMap },
        );
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

  // AC3: the weapon is the one that actually lands closest, simulated per slot rather than assumed.
  // The super shot is only considered when the target is nearly finished, and never twice.
  const finisher = target.hp + target.shield <= mobile.weapons[2].power * 1.6;
  const wantsSuper = finisher && bot.ssCharge >= TUNABLES.ssCost && rng.float(0, 1) < config.superShotChance;
  const slots: readonly (0 | 1 | 2)[] = wantsSuper ? [0, 1, 2] : [0, 1];
  let weaponSlot: 0 | 1 | 2 = 0;
  let pick = bestFor(0);
  for (const candidate of slots.slice(1)) {
    const aim = bestFor(candidate);
    // A tie keeps the cheaper weapon, so a bot does not burn a limited slot for the same shot.
    if (aim.error < pick.error) {
      pick = aim;
      weaponSlot = candidate;
    }
  }

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

/**
 * The item a bot should spend before firing, or `null` (`US-CORE-005` AC4).
 *
 * Deliberately a separate call rather than a field on `FireInput`: an item is its own input in the
 * engine (`applyItem` charges its delay), so the caller applies this one first and the shot second.
 */
export function botItemUse(
  state: MatchState,
  slot: number,
  rng: Rng,
  config: BotConfig = DEFAULT_BOT,
): ItemInput | null {
  const bot = state.players.find((player) => player.slot === slot);
  // `items` is a quantity map, not a list: an empty bag is "no key with a positive count".
  if (!bot || bot.eliminated || !Object.values(bot.items).some((count) => count > 0)) return null;
  const target = chooseTarget(state, bot);
  if (!target) return null;
  // "Out of reach" is measured, not guessed from `maxPower`: the best shot the bot can take is simulated and
  // the item is only spent when that shot cannot come within 120 units of the target (`TC-CORE-927`).
  const best = botShot(state, slot, rng, config);
  if (!best) return null;
  const mobile = getMobile(bot.mobileId);
  const map = getMap(state.mapId);
  const terrain: Terrain = {
    step: state.terrainStep,
    heights: Float64Array.from(state.terrain),
    width: TUNABLES.mapWidth,
  };
  const flight = simulateFlight(
    launch({
      id: 0,
      ownerSlot: slot,
      weaponSlot: best.weaponSlot,
      weapon: mobile.weapons[best.weaponSlot],
      from: { x: bot.x, y: bot.y },
      facing: bot.facing,
      angle: best.angle,
      force: best.force,
    }),
    {
      wind: state.weather.wind,
      gravity: TUNABLES.gravity * map.gravityModifier,

      stepMs: TUNABLES.stepMs,
      forceX: map.gimmicks.includes("force") ? FORCE_FIELD : 0,
    },
    terrain,
    undefined,
    { returnOffMap: returnsOffMapShots(map) },
  );
  const reachable = Math.abs(flight.landingX - target.x) <= 120;
  // GB's Power up is a damage multiplier, not extra range (`data/items.md`), so the bot spends it on a shot that
  // already lands and whose extra third is what finishes the target. The other items are not range-dependent either,
  // so they stay available whenever the shot is on target.
  const weapon = mobile.weapons[best.weaponSlot];
  const finishing = reachable && target.hp + target.shield <= weapon.power * 1.33;
  if (!reachable) return null;
  if (rng.float(0, 1) >= config.itemUseChance) return null;
  const heldId = ITEM_PREFERENCE.find(
    (itemId) => (bot.items[itemId] ?? 0) > 0 && (itemId !== "itm-power-up" || finishing),
  );
  if (!heldId) return null;
  return { kind: "item", slot, itemId: heldId, seq: state.seq };
}

/** A bot's whole turn: optionally an item, then the shot. The caller applies the inputs in order. */
export function botTurnPlan(
  state: MatchState,
  rng: Rng,
  config: BotConfig = DEFAULT_BOT,
): readonly (ItemInput | FireInput)[] {
  const slot = state.turn.activeSlot;
  const item = botItemUse(state, slot, rng, config);
  const fire = botShot(item ? { ...state, seq: state.seq + 1 } : state, slot, rng, config);
  if (!fire) return [];
  return item ? [item, fire] : [fire];
}
