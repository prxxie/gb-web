// @vitest-environment jsdom
/**
 * TC-MATCH-960: the hand-over after a shot (`US-MATCH-012`).
 *
 * The engine resolves a shot instantly — path, landing and damage all come back in one tick — so the turn has already
 * moved on while the renderer is still animating the shell. These helpers are what stops the next seat firing into that
 * sky, and they are pure, so the arithmetic is pinned here rather than inferred from a screenshot.
 */
import { describe, expect, it } from "vitest";
import type { MatchEvent } from "@gbw/core";
import {
  IMPACT_MS,
  MAX_FLIGHT_MS,
  MIN_FLIGHT_MS,
  clampFlightMs,
  remainingFlightMs,
  shotLockUntil,
  shotWaitMs,
} from "../src/game/flight";

const NOW = 1_700_000_000_000;

function shot(flightMs: number, slot = 0): MatchEvent {
  return {
    kind: "shot",
    slot,
    weaponSlot: 0,
    shotClass: "normal",
    power: 4,
    path: [{ x: 0, y: 0 }],
    impact: { x: 10, y: 10 },
    flightMs,
    hits: [],
    carved: false,
  };
}

describe("TC-MATCH-960: a resolved shot keeps the sky until its animation ends", () => {
  it("locks for the engine's flight plus the impact settle", () => {
    expect(shotLockUntil([shot(2_400)], NOW)).toBe(NOW + 2_400 + IMPACT_MS);
  });

  it("locks on the last shell when a step launches more than one", () => {
    expect(shotLockUntil([shot(900), shot(2_400), shot(1_200)], NOW)).toBe(NOW + 2_400 + IMPACT_MS);
  });

  it("locks nothing when the step launched no shell", () => {
    expect(shotLockUntil([], NOW)).toBe(0);
    expect(shotLockUntil([{ kind: "turn", turn: { number: 3 } as never }], NOW)).toBe(0);
  });

  it("holds the flight inside the window the renderer can afford", () => {
    expect(clampFlightMs(2_400)).toBe(2_400);
    expect(clampFlightMs(undefined)).toBe(700);
    expect(clampFlightMs(0)).toBe(700);
    expect(clampFlightMs(20)).toBe(MIN_FLIGHT_MS);
    expect(clampFlightMs(60_000)).toBe(MAX_FLIGHT_MS);
  });

  it("counts a remaining lock down to zero and never past it", () => {
    expect(remainingFlightMs(NOW + 900, NOW)).toBe(900);
    expect(remainingFlightMs(NOW - 900, NOW)).toBe(0);
    expect(remainingFlightMs(0, NOW)).toBe(0);
  });

  it("makes a waiting seat watch the shell land and then think", () => {
    // The shell has 3 000 ms to run, and the seat thinks for 1 400 ms after that.
    expect(shotWaitMs(1_400, NOW + 3_000, NOW)).toBe(4_400);
    // Nothing in the air: the thinking time alone.
    expect(shotWaitMs(1_400, 0, NOW)).toBe(1_400);
    // A lock that already expired cannot make the wait negative.
    expect(shotWaitMs(1_400, NOW - 5_000, NOW)).toBe(1_400);
    // A negative thinking time cannot shorten the wait below the flight.
    expect(shotWaitMs(-500, NOW + 1_000, NOW)).toBe(1_000);
  });
});
