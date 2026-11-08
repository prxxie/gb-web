import type { ArmorClass, Effect, PlayerState, Team } from "./types.js";
import { TUNABLES, clamp } from "./tuning.js";

/**
 * Damage (`tunables.md` § 2): three blast rings, then defense, then shield.
 *
 * | distance | tier | multiplier |
 * |---|---|---|
 * | `d ≤ 0.4 R` | Inner | `1.0` |
 * | `d ≤ 0.7 R` | Mid | `0.6` |
 * | `d ≤ R` | Outer | `0.3` |
 * | `d > R` | none | `0` |
 */
export type Tier = "inner" | "mid" | "outer" | "none";

/**
 * The weapon-type matchup (`mobiles.md` § 5, `US-CORE-003` AC6).
 *
 * The genre's rule: a weapon type hits one armour class harder and another one softer, so a player counter-picks and the
 * roster is a chart rather than a list of bars. The classes are ours and so are the numbers (`[assumption: OQ-19]`);
 * what comes from the genre is that the rule exists and that it is published.
 *
 * ```
 *               plated  bionic  warded
 * explosive      1.15    0.90    1.00
 * impact         0.90    1.15    1.00
 * laser          1.00    0.90    1.15
 * electric       1.20    1.00    0.90
 * ```
 *
 * Every row is one class at `+15…20 %`, one at `−10 %` and one neutral, and every class is countered by something and
 * soft to something — so a damage type is a choice, never an upgrade.
 */
export const ARMOR_MATRIX: Readonly<Record<Effect, Readonly<Record<ArmorClass, number>>>> = {
  explosion: { plated: 1.15, bionic: 0.9, warded: 1 },
  impact: { plated: 0.9, bionic: 1.15, warded: 1 },
  laser: { plated: 1, bionic: 0.9, warded: 1.15 },
  electric: { plated: 1.2, bionic: 1, warded: 0.9 },
};

/** The multiplier a damage type gets against one armour class, `1` when either side is unknown. */
export function armorMultiplier(damageType: Effect | undefined, armor: ArmorClass | undefined): number {
  if (!damageType || !armor) return 1;
  return ARMOR_MATRIX[damageType]?.[armor] ?? 1;
}

export function tierOf(distance: number, radius: number): Tier {
  if (radius <= 0) return "none";
  if (distance <= radius * TUNABLES.tierInner) return "inner";
  if (distance <= radius * TUNABLES.tierMid) return "mid";
  if (distance <= radius) return "outer";
  return "none";
}

export function tierMultiplier(tier: Tier): number {
  switch (tier) {
    case "inner":
      return TUNABLES.tierPowerInner;
    case "mid":
      return TUNABLES.tierPowerMid;
    case "outer":
      return TUNABLES.tierPowerOuter;
    case "none":
      return 0;
  }
}

export interface DamageOptions {
  readonly power: number;
  readonly distance: number;
  readonly radius: number;
  /** The victim's mobile `defense` × avatar defense multiplier. */
  readonly defense: number;
  /** Attacker's avatar attack multiplier, `1.0` by default. */
  readonly attack?: number;
  /** `itm-blood`: +33 % on the next shot. */
  readonly bloodBonus?: number;
  /** The weapon-type matchup against the victim's armour class (`ARMOR_MATRIX`). */
  readonly armorMultiplier?: number;
}

/** `round(power × tierPower / defense)`, never below zero. */
export function damageAt(options: DamageOptions): number {
  const tier = tierOf(options.distance, options.radius);
  const multiplier = tierMultiplier(tier);
  if (multiplier === 0) return 0;
  const attack = options.attack ?? 1;
  const blood = options.bloodBonus ?? 1;
  const matchup = options.armorMultiplier ?? 1;
  const raw = (options.power * multiplier * attack * blood * matchup) / clamp(options.defense, 0.5, 2);
  return Math.max(0, Math.round(raw));
}

export interface HitResult {
  readonly player: PlayerState;
  readonly damage: number;
  readonly absorbed: number;
  readonly tier: Tier;
  readonly eliminated: boolean;
}

/**
 * Apply one blast to the whole roster. Friendly fire is **on** (`OQ-02`): the genre punishes a careless
 * team mate, and turning it off makes the outer tier meaningless in team play.
 */
export function applyBlast(
  players: readonly PlayerState[],
  blast: { readonly x: number; readonly y: number; readonly radius: number; readonly power: number; readonly ownerSlot: number },
  options: {
    readonly defenseOf?: (player: PlayerState) => number;
    /** The armour class of each victim, for the weapon-type matchup. */
    readonly armorOf?: (player: PlayerState) => ArmorClass | undefined;
    /** The blast's damage type, i.e. the firing weapon's `effect`. */
    readonly damageType?: Effect;
    readonly attack?: number;
    readonly bloodBonus?: number;
  } = {},
): readonly HitResult[] {
  const results: HitResult[] = [];
  /** Damage this blast dealt to someone else, credited to the shooter at the end (`TC-CORE-915`). */
  let credited = 0;
  for (const player of players) {
    if (player.eliminated) continue;
    const distance = Math.hypot(player.x - blast.x, player.y - blast.y);
    const tier = tierOf(distance, blast.radius);
    if (tier === "none") continue;
    const damage = damageAt({
      power: blast.power,
      distance,
      radius: blast.radius,
      defense: options.defenseOf ? options.defenseOf(player) : 1,
      attack: options.attack ?? 1,
      bloodBonus: options.bloodBonus ?? 1,
      armorMultiplier: armorMultiplier(options.damageType, options.armorOf?.(player)),
    });
    if (damage <= 0) continue;
    const absorbed = Math.min(player.shield, damage);
    const hp = Math.max(0, player.hp - (damage - absorbed));
    const next: PlayerState = {
      ...player,
      hp,
      shield: player.shield - absorbed,
      eliminated: hp <= 0,
      damageDealt: player.slot === blast.ownerSlot ? player.damageDealt + damage : player.damageDealt,
    };
    if (player.slot !== blast.ownerSlot) credited += damage;
    results.push({ player: next, damage, absorbed, tier, eliminated: next.eliminated });
  }
  // The shooter's own row carries the damage its blast did and one hit, or the score screen has no attacker.
  const shooter = players.find((player) => player.slot === blast.ownerSlot);
  if (shooter && credited > 0) {
    const existing = results.findIndex((result) => result.player.slot === shooter.slot);
    const base = existing >= 0 ? (results[existing] as HitResult).player : shooter;
    const creditedPlayer: PlayerState = { ...base, damageDealt: base.damageDealt + credited, hits: base.hits + 1 };
    if (existing >= 0) {
      results[existing] = { ...(results[existing] as HitResult), player: creditedPlayer };
    } else {
      results.push({ player: creditedPlayer, damage: 0, absorbed: 0, tier: "none", eliminated: creditedPlayer.eliminated });
    }
  }
  return results;
}

/** Fold `applyBlast` results back into the roster. */
export function mergeHits(players: readonly PlayerState[], hits: readonly HitResult[]): readonly PlayerState[] {
  const bySlot = new Map(hits.map((hit) => [hit.player.slot, hit.player]));
  return players.map((player) => bySlot.get(player.slot) ?? player);
}

export interface TeamStatus {
  readonly alive: Readonly<Record<Team, number>>;
  readonly winner: Team | null;
}

/** Last team with a living mobile wins; `null` means the match continues (or is a draw). */
export function teamStatus(players: readonly PlayerState[]): TeamStatus {
  const alive = { A: 0, B: 0 };
  for (const player of players) {
    if (!player.eliminated) alive[player.team] += 1;
  }
  if (alive.A > 0 && alive.B === 0) return { alive, winner: "A" };
  if (alive.B > 0 && alive.A === 0) return { alive, winner: "B" };
  return { alive, winner: null };
}

/** Damage totals per team, for the `score` mode. */
export function damageByTeam(players: readonly PlayerState[]): Readonly<Record<Team, number>> {
  const totals = { A: 0, B: 0 };
  for (const player of players) totals[player.team] += player.damageDealt;
  return totals;
}
