import type { PlayerState, Team } from "./types.js";
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
  /** `itm-blood`: +25 % on the next shot. */
  readonly bloodBonus?: number;
}

/** `round(power × tierPower / defense)`, never below zero. */
export function damageAt(options: DamageOptions): number {
  const tier = tierOf(options.distance, options.radius);
  const multiplier = tierMultiplier(tier);
  if (multiplier === 0) return 0;
  const attack = options.attack ?? 1;
  const blood = options.bloodBonus ?? 1;
  const raw = (options.power * multiplier * attack * blood) / clamp(options.defense, 0.5, 2);
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
  options: { readonly defenseOf?: (player: PlayerState) => number; readonly attack?: number; readonly bloodBonus?: number } = {},
): readonly HitResult[] {
  const results: HitResult[] = [];
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
    results.push({ player: next, damage, absorbed, tier, eliminated: next.eliminated });
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
