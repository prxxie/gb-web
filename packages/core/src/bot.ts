/**
 * The bot opponent (`US-CORE-005`), firing blind (`US-BAL-006`).
 *
 * The bot decides from `Senses` alone — what its own seat can see — so it cannot read the position of a hull behind
 * the camera, the ground past the window, or a wind it has not been told about. What is left is skill: the difficulty
 * is the size of the error it accepts **in landing distance**, converted back to an angle and a bar by simulating the
 * real integrator, so a hard bot is a better gunner and not merely a smaller random wobble.
 */
import type { FireInput, ItemId, ItemInput, Rng, Wind } from "./types.js";
import { getMobile } from "./data/mobiles.js";
import { getMap } from "./data/maps.js";
import { gravityFor, launch, simulateFlight, windKFor } from "./ballistics.js";
import { TUNABLES } from "./tuning.js";
import { FORCE_FIELD, returnsOffMapShots } from "./gimmicks.js";
import { WEATHER_BANDS } from "./weather.js";
import type { BotMemory, Senses, TargetView } from "./senses.js";

/** The three skill levels a bot seat can be dealt (`glossary`: `Difficulty`). */
export type Difficulty = "easy" | "normal" | "hard";

export interface DifficultyRule {
  /** The aim error the bot accepts, in *parts* of 100 world units (`TUNABLES.partWidth`). */
  readonly landingErrorParts: number;
  /** How many `WEATHER_BANDS` it mis-reads the wind by; `0` reads it exactly. */
  readonly windBands: number;
}

/** `easy` misses by a part and a half, `normal` by three quarters, `hard` by under a third (`US-BAL-006` AC2). */
export const DIFFICULTY_RULES: Readonly<Record<Difficulty, DifficultyRule>> = {
  easy: { landingErrorParts: 1.5, windBands: 1 },
  normal: { landingErrorParts: 0.75, windBands: 0 },
  hard: { landingErrorParts: 0.3, windBands: 0 },
};

export const DEFAULT_DIFFICULTY: Difficulty = "normal";

export interface BotOptions {
  /** Chance to reach for the super shot when a target is nearly finished. */
  readonly superShotChance: number;
  /** Chance to spend one item before the shot, when it is holding a useful one. */
  readonly itemUseChance: number;
  /**
   * The aim error in world units, overriding the difficulty's budget. Used by tests to aim exactly; the shipped bot
   * always takes the difficulty's budget.
   */
  readonly landingError?: number;
  /** The seat's memory. When given, the bot records where its own shell came down for its next turn. */
  readonly memory?: BotMemory;
}

export const DEFAULT_BOT: BotOptions = {
  superShotChance: 0.35,
  itemUseChance: 0.25,
};

/** What a bot's turn amounts to: an item before the shot, and the shot. An empty list means "wait". */
export type BotInput = readonly (ItemInput | FireInput)[];

/**
 * The item a bot reaches for, in the order it prefers them: something that changes the shot before
 * something that changes the map. Only ever returns an item the bot actually holds.
 */
const ITEM_PREFERENCE: readonly ItemId[] = ["itm-power-up", "itm-dual", "itm-dual-plus", "itm-blood"];

/** The bar is `0…4` for every machine (`US-BAL-005` AC3). */
const BAR_MAX = 4;
const BAR_STEP = 0.25;
const ANGLE_STEP = 2;
/** Refinement passes after the coarse grid; each one divides the step by three, so the last is ~0.006°. */
const REFINE_PASSES = 5;
const REFINE_FACTOR = 3;
/** "Out of reach" is measured on the simulated landing, not guessed from the bar (`TC-CORE-927`). */
const ON_TARGET_UNITS = 120;

interface Stage {
  readonly gravity: number;
  readonly windK: number;
  readonly forceX: number;
  readonly returnsOffMap: boolean;
}

interface Aim {
  readonly angle: number;
  readonly bar: number;
  readonly weaponSlot: 0 | 1 | 2;
  readonly landingX: number;
  readonly error: number;
}

function stageOf(senses: Senses): Stage {
  const mobile = getMobile(senses.self.mobileId);
  const map = getMap(senses.mapId);
  return {
    // This machine's own gravity and wind coefficient, bent only by the map (`US-BAL-004`).
    gravity: gravityFor(mobile) * map.gravityModifier,
    windK: windKFor(mobile),
    forceX: map.gimmicks.includes("force") ? FORCE_FIELD : 0,
    returnsOffMap: returnsOffMapShots(map),
  };
}

/** Fly one shot through the real integrator, on the ground the seat can see. */
function fly(
  senses: Senses,
  stage: Stage,
  wind: Wind,
  weaponSlot: 0 | 1 | 2,
  angle: number,
  bar: number,
): number {
  const mobile = getMobile(senses.self.mobileId);
  const projectile = launch({
    id: 0,
    ownerSlot: senses.self.slot,
    weaponSlot,
    weapon: mobile.weapons[weaponSlot],
    from: { x: senses.self.x, y: senses.self.y },
    facing: senses.self.facing,
    angle,
    bar,
  });
  const flight = simulateFlight(
    projectile,
    { wind, gravity: stage.gravity, windK: stage.windK, stepMs: TUNABLES.stepMs, forceX: stage.forceX },
    senses.terrain,
    undefined,
    { returnOffMap: stage.returnsOffMap },
  );
  return flight.landingX;
}

/**
 * Aim at `goalX`: a coarse grid over the mobile's own angle window and the 0–4 bar, then refinement passes that
 * shrink the step until the landing is as close as the integrator can resolve.
 *
 * Deterministic for a given `Senses`, so a replay reproduces the bot's shots (`NFR-28`).
 */
function solve(senses: Senses, stage: Stage, wind: Wind, weaponSlot: 0 | 1 | 2, goalX: number): Aim {
  const mobile = getMobile(senses.self.mobileId);
  const clampAngle = (angle: number) => Math.min(mobile.angleMax, Math.max(mobile.angleMin, angle));
  const clampBar = (bar: number) => Math.min(BAR_MAX, Math.max(0, bar));

  let best: Aim = {
    angle: clampAngle((mobile.angleMin + mobile.angleMax) / 2),
    bar: BAR_MAX * 0.7,
    weaponSlot,
    landingX: 0,
    error: Number.POSITIVE_INFINITY,
  };
  const consider = (angle: number, bar: number) => {
    const landingX = fly(senses, stage, wind, weaponSlot, angle, bar);
    const error = Math.abs(landingX - goalX);
    if (error < best.error) best = { angle, bar, weaponSlot, landingX, error };
  };

  for (let angle = mobile.angleMin; angle <= mobile.angleMax; angle += ANGLE_STEP) {
    for (let bar = BAR_STEP; bar <= BAR_MAX; bar += BAR_STEP) consider(angle, bar);
  }

  let angleStep = ANGLE_STEP / 4;
  let barStep = BAR_STEP / 4;
  for (let pass = 0; pass < REFINE_PASSES; pass += 1) {
    const centre = best;
    for (let a = -2; a <= 2; a += 1) {
      for (let b = -2; b <= 2; b += 1) {
        consider(clampAngle(centre.angle + a * angleStep), clampBar(centre.bar + b * barStep));
      }
    }
    angleStep /= REFINE_FACTOR;
    barStep /= REFINE_FACTOR;
  }
  return best;
}

/** The target the bot prefers: the one cheapest to finish (`US-CORE-005` AC3). */
function chooseTarget(senses: Senses): TargetView | undefined {
  let cheapest: TargetView | undefined;
  for (const target of senses.seen) {
    if (!cheapest || target.hp + target.shield < cheapest.hp + cheapest.shield) cheapest = target;
  }
  return cheapest;
}

/**
 * Where the shot should come down, and how much error the bot accepts on it (`US-BAL-006` § 5, AC2, AC3).
 *
 * A target it can only remember counts double: the estimate is worse, so the aim is worse. With no target at all it
 * fires at the last impact it remembers, and at the middle of the map if it has never landed a shell.
 */
function goalOf(senses: Senses, difficulty: Difficulty, options: BotOptions): { readonly x: number; readonly budget: number } {
  const budget = options.landingError ?? DIFFICULTY_RULES[difficulty].landingErrorParts * TUNABLES.partWidth;
  const target = chooseTarget(senses);
  if (target) return { x: target.x, budget: target.fromMemory ? budget * 2 : budget };
  return { x: senses.lastImpact?.x ?? TUNABLES.mapWidth / 2, budget };
}

/**
 * The wind the bot believes it is shooting into (`US-BAL-006` § 5).
 *
 * `normal` and `hard` read what the HUD shows. `easy` is one `WEATHER_BANDS` band off, in a direction it draws: the
 * band it believes is what it aims for, so on a windy map the error is systematic rather than random.
 */
export function readWind(senses: Senses, difficulty: Difficulty, rng: Rng): Wind {
  const bands = DIFFICULTY_RULES[difficulty].windBands;
  if (bands === 0) return senses.wind;
  const index = WEATHER_BANDS.findIndex((band) => senses.wind.magnitude <= band.max);
  const direction = rng.int(0, 1) === 0 ? -1 : 1;
  // A magnitude past the last band reads as the last band, not as calm.
  const from = index < 0 ? WEATHER_BANDS.length - 1 : index;
  const moved = Math.min(WEATHER_BANDS.length - 1, Math.max(0, from + direction * bands));
  const band = WEATHER_BANDS[moved]!;
  return {
    magnitude: (band.min + band.max) / 2,
    directionDeg: senses.wind.directionDeg,
    sector: senses.wind.sector,
  };
}

/**
 * Aim one shot (`US-BAL-006` AC1–AC3, AC5).
 *
 * Reads `senses` only: two matches that differ outside the seat's window produce the same shot, bit for bit.
 */
export function botShot(
  senses: Senses,
  rng: Rng,
  difficulty: Difficulty = DEFAULT_DIFFICULTY,
  options: BotOptions = DEFAULT_BOT,
): FireInput {
  const stage = stageOf(senses);
  const wind = readWind(senses, difficulty, rng);
  const goal = goalOf(senses, difficulty, options);

  // The error is drawn as a landing distance and converted to an aim by the solver below (AC2): a hard bot is not a
  // smaller random angle, it is a better gunner.
  const offset = rng.float(-goal.budget, goal.budget);
  const mobile = getMobile(senses.self.mobileId);
  // AC3: the weapon is the one that actually lands closest, simulated per slot rather than assumed.
  // The super shot is only considered when the target is nearly finished, and never twice.
  const target = chooseTarget(senses);
  const finisher = Boolean(target && target.hp + target.shield <= mobile.weapons[2].power * 1.6);
  const wantsSuper =
    finisher && senses.self.ssCharge >= TUNABLES.ssCost && rng.float(0, 1) < options.superShotChance;
  const slots: readonly (0 | 1 | 2)[] = wantsSuper ? [0, 1, 2] : [0, 1];

  let pick = solve(senses, stage, wind, 0, goal.x + offset);
  for (const candidate of slots.slice(1)) {
    const aim = solve(senses, stage, wind, candidate, goal.x + offset);
    // A tie keeps the cheaper weapon, so a bot does not burn a limited slot for the same shot.
    if (aim.error < pick.error) pick = aim;
  }

  if (options.memory) options.memory.impact = { x: pick.landingX, turn: senses.turn };

  return {
    kind: "fire",
    // The caller stamps its own sequence: a sequence number is the client's bookkeeping, not something a seat can see
    // (`US-BAL-006` AC1 — two states differing only in the wire's counters decide the same shot).
    seq: 0,
    slot: senses.self.slot,
    weaponSlot: pick.weaponSlot,
    // The solver already clamped both to this machine's window, so only the wire precision is left to do.
    angle: pick.angle,
    bar: Math.round(pick.bar * 1_000) / 1_000,
  };
}

/**
 * The item a bot should spend before firing, or `null` (`US-CORE-005` AC4).
 *
 * Deliberately a separate call rather than a field on `FireInput`: an item is its own input in the engine
 * (`applyItem` charges its delay), so the caller applies this one first and the shot second.
 */
export function botItemUse(
  senses: Senses,
  rng: Rng,
  difficulty: Difficulty = DEFAULT_DIFFICULTY,
  options: BotOptions = DEFAULT_BOT,
): ItemInput | null {
  const self = senses.self;
  // `items` is a quantity map, not a list: an empty bag is "no preferred item with a positive count".
  if (!ITEM_PREFERENCE.some((itemId) => (self.items[itemId] ?? 0) > 0)) return null;
  const target = chooseTarget(senses);
  if (!target) return null;

  const stage = stageOf(senses);
  const wind = readWind(senses, difficulty, rng);
  // Gated on the intended aim, not on the shot's drawn error: a bot does not get to know its own wobble in advance.
  const aim = solve(senses, stage, wind, 0, target.x);
  const reachable = Math.abs(aim.landingX - target.x) <= ON_TARGET_UNITS;
  if (!reachable) return null;
  // GB's Power up is a damage multiplier, not extra range (`data/items.md`), so the bot spends it on a shot that
  // already lands and whose extra third is what finishes the target. The other items are not range-dependent either,
  // so they stay available whenever the shot is on target.
  const weapon = getMobile(self.mobileId).weapons[aim.weaponSlot];
  const finishing = target.hp + target.shield <= weapon.power * 1.33;
  if (rng.float(0, 1) >= options.itemUseChance) return null;
  const heldId = ITEM_PREFERENCE.find(
    (itemId) => (self.items[itemId] ?? 0) > 0 && (itemId !== "itm-power-up" || finishing),
  );
  if (!heldId) return null;
  return { kind: "item", slot: self.slot, itemId: heldId, seq: 0 };
}

/**
 * A bot's whole turn: wait if the sky is busy or the window is being measured (AC4), otherwise an item and a shot.
 *
 * The caller applies the inputs in order. `[]` means the bot deliberately does nothing this frame.
 */
export function botTurn(
  senses: Senses,
  rng: Rng,
  difficulty: Difficulty = DEFAULT_DIFFICULTY,
  options: BotOptions = DEFAULT_BOT,
): BotInput {
  if (senses.measuring) return [];
  const item = botItemUse(senses, rng, difficulty, options);
  const shot = botShot(senses, rng, difficulty, options);
  return item ? [item, shot] : [shot];
}
