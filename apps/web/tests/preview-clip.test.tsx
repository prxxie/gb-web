/**
 * `US-BAL-003`: the aim aid shows the truth only inside the player's screen.
 *
 * The aid used to draw the whole flight. On a 2.5-màn map that revealed the landing point of a shot the player could not
 * see, which makes the one-screen rule of `US-BAL-002` decorative whenever the aid is on. These cases pin the three parts
 * of the fix: the arc is clipped to the window, a second arc shows the same shot without wind, and the dots are equal time
 * steps rather than equal distance.
 */
import { describe, expect, it } from "vitest";
import { createMatch } from "@gbw/core";
import type { CameraWindow, MatchState, Vec2 } from "@gbw/core";
import { clipToWindow } from "../src/game/viewport";
import { PREVIEW_STEPS, aimPreview, baselineShot, sampleByTime } from "../src/game/preview";

const NOW = 1_700_000_000_000;

function match(): MatchState {
  return createMatch({
    matchId: "m-1",
    roomCode: "ABC234",
    seed: 42,
    mode: "solo",
    mapId: "map-01",
    seats: [
      { slot: 0, team: "A", accountId: "acc-a", displayName: "A", mobileId: "mbl-01" },
      { slot: 1, team: "B", accountId: "acc-b", displayName: "B", mobileId: "mbl-02" },
    ],
    now: NOW,
  });
}

function onTurn(state: MatchState): MatchState {
  return { ...state, turn: { ...state.turn, activeSlot: 0 } };
}

function windy(state: MatchState, magnitude: number): MatchState {
  return { ...state, weather: { ...state.weather, wind: { ...state.weather.wind, magnitude, sector: 0, directionDeg: 0 } } };
}

const WINDOW: CameraWindow = { x: 0, y: 360, width: 800, height: 480 };

describe("TC-BAL-113: the aid's arc is clipped to what the player may see (AC1)", () => {
  it("leaves a path that is fully inside the window untouched", () => {
    const path: Vec2[] = [
      { x: 100, y: 700 },
      { x: 300, y: 600 },
      { x: 500, y: 620 },
    ];
    expect(clipToWindow(path, WINDOW)).toEqual(path);
  });

  it("trims the last segment at the edge instead of dropping the point", () => {
    const path: Vec2[] = [
      { x: 100, y: 700 },
      { x: 700, y: 600 },
      { x: 1_100, y: 650 },
    ];
    const clipped = clipToWindow(path, WINDOW);
    // Two segments kept: the inside one, and the trimmed one that now ends exactly on the edge.
    expect(clipped).toHaveLength(3);
    // t = (800 - 700) / (1 100 - 700) = 0.25, so the trimmed point sits a quarter of the way down that segment.
    expect(clipped[2]).toEqual({ x: 800, y: 612.5 });
    // Nothing beyond the edge, which is the whole point: the landing point stays the player's calculation.
    for (const point of clipped) expect(point.x).toBeLessThanOrEqual(800);
  });

  it("shows nothing when the muzzle is already outside the window", () => {
    const path: Vec2[] = [
      { x: -40, y: 700 },
      { x: 200, y: 640 },
    ];
    expect(clipToWindow(path, WINDOW)).toEqual([]);
  });

  it("clips the left edge too, and never emits NaN on a vertical segment", () => {
    const leftwards: Vec2[] = [
      { x: 200, y: 700 },
      { x: -100, y: 700 },
    ];
    expect(clipToWindow(leftwards, WINDOW)).toEqual([
      { x: 200, y: 700 },
      { x: 0, y: 700 },
    ]);
    const vertical: Vec2[] = [
      { x: 400, y: 700 },
      { x: 400, y: 400 },
    ];
    expect(clipToWindow(vertical, WINDOW)).toEqual(vertical);
  });
});

describe("TC-BAL-114: a second arc shows the same shot with the wind removed (AC2)", () => {
  it("matches the live flight exactly when there is no wind", () => {
    const state = onTurn(windy(match(), 0));
    const live = aimPreview({ state, localSlot: 0, weaponSlot: 0, angle: 45, power: 2 })!;
    const base = baselineShot(state, 0, 0, live.angle, live.bar)!;
    // The sampled dots are the same flight, so the two arcs overlap and the gap the player reads is zero.
    expect(live.baseline).toEqual(sampleByTime(base.path, null, PREVIEW_STEPS));
    expect(live.path.slice(0, live.baseline.length)).toEqual(live.baseline);
  });

  it("diverges once the wind blows, so the gap between the arcs is the wind", () => {
    const state = onTurn(windy(match(), 22));
    const live = aimPreview({ state, localSlot: 0, weaponSlot: 0, angle: 45, power: 2 })!;
    const base = baselineShot(state, 0, 0, live.angle, live.bar)!;
    expect(live.baseline).not.toEqual(live.path);
    expect(base.path).not.toEqual(live.path.slice(0, base.path.length));
    // Wind is horizontal only (`US-CORE-001`), so the two arcs differ in x and agree in the muzzle they start from.
    expect(base.path[0]).toEqual(live.path[0]);
  });
});

describe("TC-BAL-115: the dots are equal time steps, not equal distance (AC3)", () => {
  it("samples a straight run of 101 frames into eleven evenly spaced ticks", () => {
    const path: Vec2[] = Array.from({ length: 101 }, (_, index) => ({ x: index * 10, y: 0 }));
    const dots = sampleByTime(path, null, PREVIEW_STEPS);
    expect(PREVIEW_STEPS).toBe(10);
    expect(dots).toHaveLength(11);
    expect(dots.map((point) => point.x / 10)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it("collapses to the unique frames when the flight is shorter than the tick count", () => {
    const path: Vec2[] = Array.from({ length: 4 }, (_, index) => ({ x: index * 10, y: 0 }));
    const dots = sampleByTime(path, null, PREVIEW_STEPS);
    expect(dots).toEqual(path);
  });

  it("ends on the impact when the engine found one", () => {
    const state = onTurn(match());
    const preview = aimPreview({ state, localSlot: 0, weaponSlot: 0, angle: 45, power: 2 })!;
    expect(preview.path.length).toBeLessThanOrEqual(PREVIEW_STEPS + 2);
    expect(preview.path.length).toBeGreaterThanOrEqual(PREVIEW_STEPS);
    if (preview.impact) expect(preview.path[preview.path.length - 1]).toEqual(preview.impact);
  });
});
