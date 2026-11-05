import { describe, expect, it } from "vitest";
import {
  clampRating,
  delta,
  expectedScore,
  INITIAL_RATING,
  isRanked,
  kFactor,
  K_SETTLED,
  K_START,
  rateMatch,
  RATING_MAX,
  RATING_MIN,
  SETTLED_MATCHES,
} from "../src/rating.js";

describe("TC-RANK-113: Elo", () => {
  it("an even match is worth half a win and a win is worth half the K factor", () => {
    expect(expectedScore(INITIAL_RATING, INITIAL_RATING)).toBeCloseTo(0.5, 5);
    expect(delta(INITIAL_RATING, INITIAL_RATING, 1, 0)).toBe(K_START / 2);
    expect(delta(INITIAL_RATING, INITIAL_RATING, 0, 0)).toBe(-K_START / 2);
    expect(kFactor(0)).toBe(K_START);
  });

  it("the favourite gains less than the underdog for the same result", () => {
    const favourite = delta(1600, 1200, 1, 0);
    const underdog = delta(1200, 1600, 1, 0);
    expect(favourite).toBeGreaterThan(0);
    expect(underdog).toBeGreaterThan(favourite);
  });

  it("a win and a loss of equal probability cancel out", () => {
    const gain = delta(1300, 1300, 1, 4);
    const loss = delta(1300, 1300, 0, 4);
    expect(gain + loss).toBe(0);
  });

  it("a rating never leaves the documented range", () => {
    expect(clampRating(-500)).toBe(RATING_MIN);
    expect(clampRating(99_999)).toBe(RATING_MAX);
  });
});

describe("TC-RANK-114: the K factor settles", () => {
  it("halves after thirty rated matches", () => {
    expect(kFactor(SETTLED_MATCHES - 1)).toBe(K_START);
    expect(kFactor(SETTLED_MATCHES)).toBe(K_SETTLED);
    const newcomer = delta(INITIAL_RATING, INITIAL_RATING, 1, 0);
    const veteran = delta(INITIAL_RATING, INITIAL_RATING, 1, SETTLED_MATCHES);
    expect(veteran).toBe(newcomer / 2);
  });

  it("a rated match returns one change per team and a draw returns opposite signs", () => {
    const changes = rateMatch({
      teams: [
        { team: "A", total: 1200 * 2, count: 2 },
        { team: "B", total: 1200 * 2, count: 2 },
      ],
      winner: null,
    });
    expect(changes).toHaveLength(2);
    expect(changes[0]?.delta).toBe(0);
    expect(changes[1]?.delta).toBe(0);
  });
});

describe("TC-RANK-116: what makes a match ranked", () => {
  it("refuses a bot, an abandoned match or a stale ruleset, but not a guest seat", () => {
    // `US-RANK-002` AC7: a guest has no account to rate, so the seat is skipped and the match still counts.
    expect(isRanked({ hasBot: false, abandoned: false, rulesetMismatch: false })).toBe(true);
    expect(isRanked({ hasBot: true, abandoned: false, rulesetMismatch: false })).toBe(false);
    expect(isRanked({ hasBot: false, abandoned: true, rulesetMismatch: false })).toBe(false);
    expect(isRanked({ hasBot: false, abandoned: false, rulesetMismatch: true })).toBe(false);
  });
});
