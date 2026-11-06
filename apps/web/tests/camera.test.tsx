// @vitest-environment jsdom
/**
 * TC-MATCH-918 / TC-MATCH-919: the camera window (`docs/02-reference/screens/match.md`, `US-MATCH-007`).
 *
 * The zoom maths, the pan clamp and the default window are pure (`packages/core/src/camera.ts`), so
 * this file checks the numbers behind the camera. The `CameraController` class the story's contract
 * names does not exist — the Phaser scene calls these functions directly.
 */
import { describe, expect, it } from "vitest";
import {
  TUNABLES,
  clampWindow,
  defaultWindow,
  panBy,
  pinchTo,
  windowOn,
  type CameraWindow,
} from "@gbw/core";

const MAP = { width: TUNABLES.mapWidth, height: TUNABLES.mapHeight };
const SCREEN_WIDTH = 800;

function expectInsideMap(window: CameraWindow): void {
  expect(window.x).toBeGreaterThanOrEqual(0);
  expect(window.y).toBeGreaterThanOrEqual(0);
  expect(window.x + window.width).toBeLessThanOrEqual(MAP.width);
  expect(window.y + window.height).toBeLessThanOrEqual(MAP.height);
}

describe("TC-MATCH-918: the opening window", () => {
  it("is 1000 × 600 — half the map each way — and sits inside the bounds (AC2)", () => {
    const window = defaultWindow(5 / 3);
    expect(window.width).toBe(TUNABLES.viewDefaultWidth);
    expect(window.height).toBe(TUNABLES.viewDefaultHeight);
    expectInsideMap(window);
  });

  it("keeps 600 units of height on a wider-than-5:3 screen and shows extra width (AC2)", () => {
    // screens/match.md § 5: "a wider-than-5:3 screen keeps 600 units of height and shows extra
    // width as margin". Height must not drop below half the map.
    const window = defaultWindow(16 / 9);
    expect(window.height).toBe(TUNABLES.viewDefaultHeight);
    expect(window.width).toBeGreaterThanOrEqual(TUNABLES.viewDefaultWidth);
    expectInsideMap(window);
  });

  it("is never smaller than half the map on a narrow screen", () => {
    const window = defaultWindow(1);
    expect(window.width).toBeGreaterThanOrEqual(TUNABLES.viewDefaultWidth);
    expect(window.height).toBeGreaterThanOrEqual(TUNABLES.viewDefaultHeight);
    expectInsideMap(window);
  });
});

describe("TC-MATCH-918: panning is 1:1 and bounded by the map (AC4)", () => {
  it("moves the window by the finger delta scaled to world units", () => {
    const window = defaultWindow(5 / 3);
    const moved = panBy(window, -SCREEN_WIDTH / 4, 0, SCREEN_WIDTH);
    // A quarter of the screen pans a quarter of the window, i.e. half the default 1000 units.
    expect(moved.x).toBeCloseTo(window.x + window.width / 4, 1);
    expect(moved.y).toBe(window.y);
  });

  it("stops at the left/top edge instead of showing void", () => {
    const window = defaultWindow(5 / 3);
    const far = panBy(window, 10_000, 10_000, SCREEN_WIDTH);
    expect(far.x).toBe(0);
    expect(far.y).toBe(0);
    expectInsideMap(far);
  });

  it("stops at the right/bottom edge instead of showing void", () => {
    const window = defaultWindow(5 / 3);
    const far = panBy(window, -10_000, -10_000, SCREEN_WIDTH);
    expect(far.x).toBe(MAP.width - far.width);
    expect(far.y).toBe(MAP.height - far.height);
    expectInsideMap(far);
  });

  it("a repeated pan in every direction still never shows void", () => {
    let window = defaultWindow(5 / 3);
    for (let step = 0; step < 40; step += 1) {
      window = panBy(window, step % 2 === 0 ? 137 : -89, step % 3 === 0 ? -61 : 47, SCREEN_WIDTH);
      expectInsideMap(window);
    }
  });
});

describe("TC-MATCH-919: a pinch zooms about the midpoint, inside the limits (AC3)", () => {
  it("zooms in and never past the 250 × 150 units limit", () => {
    const window = defaultWindow(5 / 3);
    const zoomed = pinchTo(window, 100, 1000, 900);
    expect(zoomed.width).toBe(TUNABLES.zoomMaxWidth);
    expect(zoomed.height).toBeLessThanOrEqual(TUNABLES.zoomMaxHeight);
    expectInsideMap(zoomed);
  });

  it("zooms out no further than the whole map", () => {
    const window = defaultWindow(5 / 3);
    const out = pinchTo(window, 0.01, 1000, 900);
    expect(out.width).toBe(MAP.width);
    expect(out.height).toBe(MAP.height);
    expectInsideMap(out);
  });

  it("keeps the point under the fingers in place", () => {
    const window = defaultWindow(5 / 3);
    const anchorX = window.x + window.width * 0.25;
    const anchorY = window.y + window.height * 0.5;
    const zoomed = pinchTo(window, 2, anchorX, anchorY);
    expect((anchorX - zoomed.x) / zoomed.width).toBeCloseTo(0.25, 2);
    expect((anchorY - zoomed.y) / zoomed.height).toBeCloseTo(0.5, 2);
  });

  it("a zoom in and back out returns to the 125-units-a-division view (AC8)", () => {
    const start = defaultWindow(5 / 3);
    const zoomed = pinchTo(start, 4, start.x + start.width / 2, start.y + start.height / 2);
    const back = pinchTo(zoomed, 0.25, zoomed.x + zoomed.width / 2, zoomed.y + zoomed.height / 2);
    expect(back.width).toBeCloseTo(start.width, 1);
    expect(back.height).toBeCloseTo(start.height, 1);
  });
});

describe("TC-MATCH-918: following a player stays inside the map", () => {
  it("centres on the target horizontally and clamps at both map edges", () => {
    const left = windowOn(0, 5 / 3);
    expect(left.x).toBe(0);
    expectInsideMap(left);

    const right = windowOn(MAP.width, 5 / 3);
    expect(right.x + right.width).toBe(MAP.width);
    expectInsideMap(right);

    const middle = windowOn(MAP.width / 2, 5 / 3);
    expect(middle.x + middle.width / 2).toBeCloseTo(MAP.width / 2, 1);
  });

  it("clampWindow repairs a window that escaped the bounds", () => {
    const stray = clampWindow({ x: -500, y: 5000, width: 4000, height: 4000 });
    expect(stray.width).toBe(MAP.width);
    expect(stray.x).toBe(0);
    expect(stray.y).toBe(MAP.height - stray.height);
  });
});
