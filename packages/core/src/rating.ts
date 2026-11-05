import { clamp } from "./tuning.js";

/**
 * Elo (`OQ-28`, `docs/02-reference/data/matches.md`).
 *
 * K starts at 32 and halves to 16 once a player has 30 rated matches, so a new account finds its level
 * quickly and a settled one is not knocked around by a single bad game. Ratings never go below 0 or
 * above 4000, and only the server computes them.
 */
export const INITIAL_RATING = 1200;
export const K_START = 32;
export const K_SETTLED = 16;
export const SETTLED_MATCHES = 30;
export const RATING_MIN = 0;
export const RATING_MAX = 4000;

export function kFactor(ratedMatches: number): number {
  return ratedMatches < SETTLED_MATCHES ? K_START : K_SETTLED;
}

export function expectedScore(rating: number, opponentAverage: number): number {
  return 1 / (1 + 10 ** ((opponentAverage - rating) / 400));
}

export function delta(rating: number, opponentAverage: number, score: 0 | 1, ratedMatches: number): number {
  const k = kFactor(ratedMatches);
  return Math.round(k * (score - expectedScore(rating, opponentAverage)));
}

export function clampRating(rating: number): number {
  return clamp(Math.round(rating), RATING_MIN, RATING_MAX);
}

export interface TeamRatings {
  readonly team: "A" | "B";
  readonly total: number;
  readonly count: number;
  /**
   * Rated-match counts of this team's members, when the caller knows them. A team's K is the K of its most
   * settled member, so a veteran's win against a newcomer cannot be priced at the newcomer's K (`AC3`).
   */
  readonly ratedMatches?: readonly number[];
}

export interface RatedMatchInput {
  readonly teams: readonly TeamRatings[];
  readonly winner: "A" | "B" | null;
  readonly ratedMatchesByPlayer?: Readonly<Record<number, number>>;
}

export interface RatingChange {
  readonly team: "A" | "B";
  readonly delta: number;
}

/**
 * Rating change per team. A draw (`winner: null`) scores `0.5` for both sides; a team with no rated
 * player is simply absent from `teams`.
 */
export function rateMatch(input: RatedMatchInput): readonly RatingChange[] {
  const [teamA, teamB] = input.teams;
  if (!teamA || !teamB) return [];
  const averageA = teamA.total / Math.max(1, teamA.count);
  const averageB = teamB.total / Math.max(1, teamB.count);
  const scoreA = input.winner === null ? 0.5 : input.winner === "A" ? 1 : 0;
  const scoreB = 1 - scoreA;
  // Per-team K. The flat `ratedMatchesByPlayer` map is the older shape: it carries no team, so its counts are
  // read as one per player and handed out from the most settled down (`A` first), which is what the caller
  // that only has the roster can rely on.
  const flat = Object.values(input.ratedMatchesByPlayer ?? {}).sort((left, right) => right - left);
  const countedA = teamA.ratedMatches ?? flat.filter((_, index) => index % 2 === 0);
  const countedB = teamB.ratedMatches ?? flat.filter((_, index) => index % 2 === 1);
  const settledA = countedA.length > 0 ? Math.max(...countedA) : 0;
  const settledB = countedB.length > 0 ? Math.max(...countedB) : 0;
  return [
    { team: "A", delta: delta(averageA, averageB, scoreA as 0 | 1, settledA) },
    { team: "B", delta: delta(averageB, averageA, scoreB as 0 | 1, settledB) },
  ];
}

/** True when the match may change ratings (`matches.md` § Validation). */
export function isRanked(input: {
  readonly hasGuest: boolean;
  readonly hasBot: boolean;
  readonly abandoned: boolean;
  readonly rulesetMismatch: boolean;
}): boolean {
  return !input.hasGuest && !input.hasBot && !input.abandoned && !input.rulesetMismatch;
}
