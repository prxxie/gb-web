// @vitest-environment jsdom
/**
 * TC-MATCH-918 / TC-MATCH-919: the camera window (`docs/02-reference/screens/match.md`, `US-MATCH-007`).
 *
 * The zoom maths, the pan clamp and the default window are pure (`packages/core/src/camera.ts`), so
 * this file checks the numbers behind the camera. The `CameraController` class the story's contract
 * names does not exist — the Phaser scene calls these functions directly.
 */
import { describe, expect, it } from "vitest";
import { RING_RADIUS as RING_PX } from "../src/game/aim";
import {
  TUNABLES,
  clampWindow,
  defaultWindow,
  panBy,
  pinchTo,
  windowOn,
  type CameraWindow,
} from "@gbw/core";
import { MAX_RENDER_SCALE, renderScaleFor, screenConstant } from "../src/game/viewport";

const MAP = { width: TUNABLES.mapWidth, height: TUNABLES.mapHeight };
const SCREEN_WIDTH = 800;

function expectInsideMap(window: CameraWindow): void {
  expect(window.x).toBeGreaterThanOrEqual(0);
  expect(window.y).toBeGreaterThanOrEqual(0);
  expect(window.x + window.width).toBeLessThanOrEqual(MAP.width);
  expect(window.y + window.height).toBeLessThanOrEqual(MAP.height);
}

describe("TC-BAL-105: the opening window shows exactly one screen", () => {
  it("is one screen wide and never wider, whatever the canvas aspect", () => {
    // `US-BAL-002` AC1: the width is the information budget — 800 units, eight parts of 100 — and the aspect buys
    // height. A 16:9 canvas used to show 1,066 units, i.e. a third of a screen more map than a 5:3 one.
    for (const aspect of [5 / 3, 16 / 9, 2.7]) {
      const window = defaultWindow(aspect);
      expect(window.width).toBe(TUNABLES.manWidth);
      expect(window.width / window.height).toBeCloseTo(aspect, 2);
      expectInsideMap(window);
    }
  });

  it("is the same 800 units a 2.7:1 phone and a tablet see", () => {
    const phone = defaultWindow(2.7);
    const tablet = defaultWindow(4 / 3);
    expect(phone.width).toBe(tablet.width);
    expect(phone.height).toBeLessThan(tablet.height);
  });

  it("still shows one screen on a square canvas", () => {
    const window = defaultWindow(1);
    expect(window.width).toBe(TUNABLES.manWidth);
    expect(window.height).toBe(TUNABLES.manWidth);
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

describe("TC-MATCH-922: the aim ring and its dots keep their screen size at any zoom (AC6)", () => {
  it("draws the same 64 px ring at the narrowest and the widest window", () => {
    const screen = { width: 844, height: 313 };
    for (const window of [defaultWindow(screen.width / screen.height), { x: 0, y: 0, width: 2000, height: 1200 }]) {
      const scale = screen.width / window.width;
      // The scene draws in world units: a CSS-pixel length becomes `pixels / scale` world units and back again.
      expect(screenConstant(RING_PX, scale) * scale).toBeCloseTo(RING_PX, 6);
    }
    // Zoomed to 250 units wide the ring must be ~19 world units, at the whole map ~152: it never shrinks on screen.
    expect(screenConstant(RING_PX, 844 / 250)).toBeCloseTo(18.96, 1);
    expect(screenConstant(RING_PX, 844 / 2000)).toBeCloseTo(151.66, 1);
  });

  it("survives a degenerate scale instead of returning Infinity", () => {
    expect(screenConstant(64, 0)).toBe(64);
    expect(screenConstant(64, Number.NaN)).toBe(64);
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

  it("a zoom in and back out returns to the one-screen view (AC3)", () => {
    const start = defaultWindow(5 / 3);
    // Two stops each way: four would hit the 250-unit zoom limit and the round trip could not return (`TC-MATCH-919`).
    const zoomed = pinchTo(start, 2, start.x + start.width / 2, start.y + start.height / 2);
    const back = pinchTo(zoomed, 0.5, zoomed.x + zoomed.width / 2, zoomed.y + zoomed.height / 2);
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

describe("TC-MATCH-957: the battlefield renders at the screen's pixel density", () => {
  it("takes the device ratio, up to the cap", () => {
    expect(renderScaleFor(1)).toBe(1);
    expect(renderScaleFor(2.625)).toBe(MAX_RENDER_SCALE);
    expect(renderScaleFor(3)).toBe(MAX_RENDER_SCALE);
  });

  it("never rasterises below one device pixel per CSS pixel", () => {
    expect(renderScaleFor(0.75)).toBe(1);
    expect(renderScaleFor(0)).toBe(1);
  });

  it("survives a platform that reports no ratio at all", () => {
    expect(renderScaleFor(undefined)).toBe(1);
    expect(renderScaleFor(Number.NaN)).toBe(1);
    expect(renderScaleFor(Number.POSITIVE_INFINITY)).toBe(1);
  });
});
