/**
 * `US-RANK-002` — the rating table from §4 and the acceptance criteria that name this file.
 *
 * Table-driven on purpose: the story says "a rule I could compute myself", so every expectation below is a
 * number a reader can recompute from the formula in the doc.
 */
import { describe, expect, it } from "vitest";
import {
  INITIAL_RATING,
  K_SETTLED,
  K_START,
  RATING_MAX,
  RATING_MIN,
  SETTLED_MATCHES,
  clampRating,
  delta,
  expectedScore,
  isRanked,
  kFactor,
  rateMatch,
} from "@gbw/core";

describe("the table in US-RANK-002 §4", () => {
  it("TC-RANK-113: expectedScore is 1 / (1 + 10 ** ((opponent - rating) / 400))", () => {
    // Arrange
    const cases: { rating: number; opponent: number; expected: number }[] = [
      { rating: 1200, opponent: 1200, expected: 0.5 },
      { rating: 1400, opponent: 1200, expected: 0.7597469266479578 },
      { rating: 1200, opponent: 1400, expected: 0.2402530733520421 },
    ];

    // Act + Assert
    for (const row of cases) {
      expect(expectedScore(row.rating, row.opponent)).toBeCloseTo(row.expected, 12);
      expect(expectedScore(row.rating, row.opponent) + expectedScore(row.opponent, row.rating)).toBeCloseTo(1, 12);
    }
    expect(INITIAL_RATING).toBe(1200);
    expect(RATING_MIN).toBe(0);
    expect(RATING_MAX).toBe(4000);
  });

  it("TC-RANK-114: K is 32 before thirty rated matches and 16 from the thirtieth", () => {
    // Arrange
    const cases: { matches: number; k: number }[] = [
      { matches: 0, k: 32 },
      { matches: 1, k: 32 },
      { matches: 29, k: 32 },
      { matches: 30, k: 16 },
      { matches: 400, k: 16 },
    ];

    // Act + Assert
    for (const row of cases) expect(kFactor(row.matches)).toBe(row.k);
    expect(K_START).toBe(32);
    expect(K_SETTLED).toBe(16);
    expect(SETTLED_MATCHES).toBe(30);
  });

  it("TC-RANK-113: an equal-team win moves the winner +16 and the loser -16", () => {
    // Arrange — AC1: delta = round(32 × (1 − 0.5))
    const changes = rateMatch({
      teams: [
        { team: "A", total: 1200, count: 1 },
        { team: "B", total: 1200, count: 1 },
      ],
      winner: "A",
    });

    // Act + Assert
    expect(changes).toEqual([
      { team: "A", delta: 16 },
      { team: "B", delta: -16 },
    ]);
    expect(delta(1200, 1200, 1, 0)).toBe(16);
    expect(delta(1200, 1200, 0, 0)).toBe(-16);
  });

  it("TC-RANK-113: a draw moves neither side", () => {
    // Arrange
    const changes = rateMatch({
      teams: [
        { team: "A", total: 1200, count: 1 },
        { team: "B", total: 1200, count: 1 },
      ],
      winner: null,
    });

    // Act + Assert
    expect(changes.map((change) => change.delta)).toEqual([0, 0]);
  });

  it("TC-RANK-113: the favourite gains less than it would against an equal team (AC2)", () => {
    // Arrange — A averages 1400 (two players, 2800 total), B averages 1200
    const favourite = rateMatch({
      teams: [
        { team: "A", total: 2800, count: 2 },
        { team: "B", total: 2400, count: 2 },
      ],
      winner: "A",
    });
    const equal = rateMatch({
      teams: [
        { team: "A", total: 2400, count: 2 },
        { team: "B", total: 2400, count: 2 },
      ],
      winner: "A",
    });

    // Act + Assert
    const [favouriteA, favouriteB] = favourite;
    const [equalA] = equal;
    expect(favouriteA?.delta).toBeLessThan(equalA?.delta ?? 0);
    expect(favouriteA?.delta).toBe(8);
    expect(favouriteB?.delta).toBe(-8);
  });

  it("TC-RANK-114: the settled player's delta uses K = 16, not the opponent's K", () => {
    // Arrange — AC3: this player has 30 rated matches, the opponent has none
    const changes = rateMatch({
      teams: [
        { team: "A", total: 1200, count: 1 },
        { team: "B", total: 1200, count: 1 },
      ],
      winner: "A",
      ratedMatchesByPlayer: { settled: 30, newcomer: 0 },
    });

    // Act + Assert — the settled winner moves by round(16 × 0.5), the newcomer by round(32 × 0.5)
    expect(changes).toEqual([
      { team: "A", delta: 8 },
      { team: "B", delta: -16 },
    ]);
  });

  it("TC-RANK-113: clampRating holds a rating inside [0, 4000] and rounds once", () => {
    // Arrange — AC4: the clamp is visible in rating_history
    const cases: { input: number; expected: number }[] = [
      { input: -40, expected: 0 },
      { input: 0, expected: 0 },
      { input: 1199.5, expected: 1200 },
      { input: 3999.4, expected: 3999 },
      { input: 4100, expected: 4000 },
    ];

    // Act + Assert
    for (const row of cases) expect(clampRating(row.input)).toBe(row.expected);
    expect(clampRating(3999.6)).toBe(4000);
  });

  it("TC-RANK-058: an unranked match changes no rating", () => {
    // Arrange — AC5: `ranked = 0` means no rating_history rows
    const cases = [
      { hasBot: true, abandoned: false, rulesetMismatch: false },
      { hasBot: false, abandoned: true, rulesetMismatch: false },
      { hasBot: false, abandoned: false, rulesetMismatch: true },
    ];

    // Act + Assert
    for (const row of cases) expect(isRanked(row)).toBe(false);
    expect(isRanked({ hasBot: false, abandoned: false, rulesetMismatch: false })).toBe(true);
  });

  it("TC-RANK-113: delta is always an integer", () => {
    // Arrange — the rounding happens once, inside delta()
    const ratings = [1200, 1237, 987, 2400, 3999];

    // Act + Assert
    for (const rating of ratings) {
      for (const opponent of ratings) {
        for (const score of [0, 1] as const) {
          expect(Number.isInteger(delta(rating, opponent, score, 7))).toBe(true);
        }
      }
    }
  });
});
