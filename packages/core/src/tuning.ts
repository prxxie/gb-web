/**
 * The ruleset constants (`tunables.md` § 1.2). One object, imported everywhere, versioned by
 * `rulesetVersion`: a match recorded under one version is never rated under another.
 */
export const RULESET_VERSION = "2026-11-09";

export const TUNABLES = {
  rulesetVersion: RULESET_VERSION,
  /** Fixed simulation step. 20 Hz. */
  stepMs: 50,
  /** The turn clock (`OQ-03`). */
  turnDurationMs: 20_000,
  /** One extension per turn. */
  turnGraceMs: 20_000,
  /**
   * The one gravity every mobile falls under, u/s² (`tunables.md` § 1.1).
   *
   * GB has a single gravity for the whole roster: at the same angle and power every mobile draws the same parabola, and
   * what makes them feel different is the firing envelope and the shell, not the arc. Per-mobile gravity made the angle
   * and power tables untransferable between mobiles, which is the opposite of the genre.
   */
  gravity: 152,
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
  /** `v0 = force * speedK` for every mobile. */
  speedK: 5.9,
  /**
   * `a = windCoefficient * magnitude * (cos θ, sin θ)` — no mass term: GB's wind pushes every mobile alike.
   *
   * `0.8 × 26 = 20.8 u/s²` at full wind, a fifth of gravity: on the ~5.7 s hang of an aimed shot that is a ~340-unit
   * correction, a sixth of the map — decisive, which is what a full-wind reading has to be, and still short of the
   * 27 × gravity that the mass-free coefficient first produced.
   */
  windCoefficient: 1,
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
  /** Camera (`tunables.md` § 9). */
  viewDefaultWidth: 1000,
  viewDefaultHeight: 600,
  zoomMaxWidth: 250,
  zoomMaxHeight: 150,
  pinchThresholdPx: 12,
  powerDragFullRatio: 0.45,
  powerDeadzone: 0.3,
  powerRingRadiusPx: 64,
  powerRingMinPx: 54,
  powerRingMaxPx: 76,
  /** The power bar is 0–4.0, the force the integrator uses is 0–100. */
  powerBarMax: 4,
  padRingPx: 96,
  rulerBaseSegments: 8,
  rulerUnitTarget: 125,
  /** How long the screen takes to catch up to a new state — `US-MATCH-001` AC2 (`tunables.md` § 9). */
  interpolateMs: 100,
  /** How many dots the aim aid samples the resolved flight into (`US-MATCH-005` AC2). */
  previewDots: 24,
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
