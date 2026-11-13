/**
 * The ruleset constants (`tunables.md` § 1.2). One object, imported everywhere, versioned by
 * `rulesetVersion`: a match recorded under one version is never rated under another.
 */
export const RULESET_VERSION = "2026-11-13";

/**
 * The integrator's own constants (`tunables.md` § 1.1, `ADR-0007`).
 *
 * The original's arithmetic: one muzzle law for every machine, gravity from the machine's weight, and a wind push
 * proportional to its drag. They are named constants rather than `TUNABLES` rows because they are the *formula*, not a
 * knob a balance pass turns — `rulesetVersion` is what changes when one of them does.
 */
/** `v0 = bar × BAR_VELOCITY`, u/s per bar; the bar is `0…4` for every machine. */
export const BAR_VELOCITY = 232.335;
/** Gravity at the reference weight, u/s²: `g = BASE_GRAVITY × weight / GRAVITY_WEIGHT`. */
export const BASE_GRAVITY = 390;
/** The weight `BASE_GRAVITY` is quoted at (the middle of the roster). */
export const GRAVITY_WEIGHT = 5.78;
/** `k = WIND_COEFFICIENT × windDrag / WIND_DRAG_REFERENCE²` — proportional to drag. */
export const WIND_COEFFICIENT = 0.222;
/** The drag the coefficient is quoted at: a machine with `0.046` reads `4.826`. */
export const WIND_DRAG_REFERENCE = 0.046;
/** The wind reading is an effective magnitude: `windEff = magnitude × WIND_EFFECT`. */
export const WIND_EFFECT = 0.95;
/** The fixed 25 ms integration step: at 4 bar the muzzle is 929 u/s, and a 50 ms step is half a blast radius. */
export const STEP_MS = 25;

export const TUNABLES = {
  rulesetVersion: RULESET_VERSION,
  /** Fixed simulation step, 40 Hz (`ADR-0007` §5). */
  stepMs: STEP_MS,
  /** The turn clock (`OQ-03`). */
  turnDurationMs: 20_000,
  /** One extension per turn. */
  turnGraceMs: 20_000,
  /**
   * The delay a player pays for thinking (`tunables.md` § 2).
   *
   * GB adds 10 to your delay for every second the turn takes, so a player who deliberates falls down the queue: the
   * clock is not decoration, it is part of the tempo. Ours adds the same, measured from the turn's own start.
   */
  /**
   * Deliberating costs queue position, but not this much: at 10 a full 18 s turn added 180 delay, which is three quarters of a
   * shot — measured in a real match, six turns of careful play put the player 800 delay behind a bot that answers instantly
   * and handed it three extra turns. 4 keeps the pressure and leaves the queue winnable.
   */
  thinkingDelayPerSecond: 4,
  /** The super-shot gauge: full is `100`, and a shot spends all of it (`US-CORE-007`). */
  ssCost: 100,
  /** Gauge points per point of damage dealt / taken — dealing fills it twice as fast as being hit. */
  ssChargeDealt: 0.25,
  ssChargeTaken: 0.12,
  windMax: 26,
  /** GB's wind is horizontal: east or west, nothing else. */
  windSectors: 2,
  /** Blast tiers as a fraction of the radius. */
  tierInner: 0.4,
  tierMid: 0.7,
  tierPowerInner: 1,
  tierPowerMid: 0.6,
  tierPowerOuter: 0.3,
  bounceRestitution: 0.6,
  /** Crater radius as a fraction of the blast radius. */
  terrainCarveRatio: 0.6,
  maxFlightMs: 12_000,
  /**
   * `itm-bunge` — GB's Bunge Shot: the same shell, 25 % more ground carved out of it (`US-CORE-009`). It is not a
   * returning shell; the boomerang arc belongs to a mobile, not to an item.
   */
  bungeCarveBonus: 0.25,
  mapWidth: 2000,
  mapHeight: 1200,
  /** Positions are rounded to this before they enter a snapshot (`NFR-04`). */
  roundTo: 0.1,
  /** Terrain sampling resolution in world units. */
  terrainStep: 2,
  /** Snapshot caps (`NFR-04`). */
  snapshotMaxBytes: 800,
  snapshotHardLimitBytes: 8192,
  /** Client input rate limit (`US-NET-004`). */
  chatPerSecond: 2,
  signalPerSecond: 20,
  /** Room lifecycle (`tunables.md` § 8). */
  roomIdleMs: 10 * 60 * 1000,
  roomGraceMs: 20_000,
  roomMatchCapMs: 24 * 60 * 60 * 1000,
  hostMigrationBudgetMs: 5000,
  reconnectGraceMs: 20_000,
  /** Match rules. */
  scoreTurnCap: 12,
  /** `heal` gimmick: fraction of a 1,200 HP pool restored each round. */
  healFraction: 0.08,
  /**
   * The original's information unit (`US-BAL-001`): one screen is eight parts and the map is 2.5 of them. Every distance
   * the game speaks in is a part of this, and the resting camera shows exactly one.
   */
  manWidth: 800,
  partsPerMan: 8,
  partWidth: 100,
  /**
   * How long a measure zoom stays open before it snaps back to one screen (`US-BAL-002` AC3). 1.5 s was picked first and
   * is too short to count twenty parts with a thumb on a phone — and it made the refusal fire only when the device was idle.
   */
  measureReturnMs: 2500,
  /** Camera (`tunables.md` § 9). */
  viewDefaultWidth: 800,
  viewDefaultHeight: 600,
  zoomMaxWidth: 250,
  zoomMaxHeight: 150,
  pinchThresholdPx: 12,
  powerDragFullRatio: 0.45,
  powerDeadzone: 0.3,
  powerRingRadiusPx: 64,
  powerRingMinPx: 54,
  powerRingMaxPx: 76,
  /** The power bar is `0…4` for every machine, and the bar is exactly what the integrator takes (`US-BAL-005` AC3). */
  powerBarMax: 4,
  padRingPx: 96,
  rulerBaseSegments: 8,
  rulerUnitTarget: 125,
  /** How long the screen takes to catch up to a new state — `US-MATCH-001` AC2 (`tunables.md` § 9). */
  interpolateMs: 100,
  /**
   * Dots per aim-aid preview (`US-BAL-003` AC3): ten equal **time** steps, not a fixed count of dots along a curve. Replaces
   * `previewDots: 24`, whose count said nothing about the flight — a long shot and a short one got the same dots.
   */
  previewSteps: 10,
  /** Ticks closer than this on screen are dropped: at low power a 25 ms step is a smear that reads as one fat dot. */
  previewDotMinPx: 6,
} as const;

export type Tunables = typeof TUNABLES;

/** Round a coordinate to the wire precision. */
export function roundTo(value: number, step: number = TUNABLES.roundTo): number {
  return Math.round(value / step) * step;
}

/** Clamp helper used by every guard in the engine. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
