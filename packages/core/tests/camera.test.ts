import { describe, expect, it } from "vitest";
import {
  angleFromPull,
  clampWindow,
  defaultWindow,
  forceFromPower,
  panBy,
  pinchTo,
  powerFromDrag,
  powerRingRadius,
  rulerLayout,
  windowFromZoom,
  windowOn,
  zoomOf,
} from "../src/camera.js";
import { MAP_BOUNDS } from "../src/data/maps.js";

const WIDE = 5 / 3;

describe("TC-MATCH-918: the window", () => {
  it("opens on one half of the map in each direction", () => {
    const window = defaultWindow(WIDE);
    expect(window.width).toBeCloseTo(MAP_BOUNDS.width / 2, 0);
    expect(window.height).toBeCloseTo(MAP_BOUNDS.height / 2, 0);
  });

  it("keeps a portrait-ish viewport inside the map height", () => {
    const tall = defaultWindow(1);
    expect(tall.height).toBeLessThanOrEqual(MAP_BOUNDS.height / 2);
    expect(tall.width).toBeLessThanOrEqual(MAP_BOUNDS.width / 2);
  });

  it("sits on the ground line so the battlefield is visible, not the sky", () => {
    const window = defaultWindow(WIDE);
    // The bottom edge is the map's ground line, so terrain and mobiles are always in frame.
    expect(window.y + window.height).toBeCloseTo(MAP_BOUNDS.height, 0);
    expect(window.y).toBeGreaterThanOrEqual(MAP_BOUNDS.height / 2);
  });

  it("frames a target horizontally and stays on the ground line", () => {
    const centred = windowOn(MAP_BOUNDS.width / 2, WIDE);
    expect(centred.x + centred.width / 2).toBeCloseTo(MAP_BOUNDS.width / 2, 0);
    expect(centred.y + centred.height).toBeCloseTo(MAP_BOUNDS.height, 0);
    const edge = windowOn(0, WIDE);
    expect(edge.x).toBe(0);
  });

  it("puts the shooter's feet in the lower third when a ground height is given", () => {
    const groundY = MAP_BOUNDS.height * 0.55;
    const framed = windowOn(MAP_BOUNDS.width * 0.3, WIDE, groundY);
    const feetFromTop = (groundY - framed.y) / framed.height;
    expect(feetFromTop).toBeGreaterThan(0.6);
    expect(feetFromTop).toBeLessThan(0.8);
  });

  it("never leaves the map", () => {
    const outside = clampWindow({ x: -400, y: -200, width: 1000, height: 600 });
    expect(outside.x).toBe(0);
    expect(outside.y).toBe(0);
    expect(outside.x + outside.width).toBeLessThanOrEqual(MAP_BOUNDS.width);
    expect(outside.y + outside.height).toBeLessThanOrEqual(MAP_BOUNDS.height);
  });
});

describe("TC-MATCH-919: zoom", () => {
  it("zooms out to the whole map and in to the documented maximum", () => {
    const whole = clampWindow({ x: 0, y: 0, width: 2000, height: 1200 });
    expect(whole.width).toBe(2000);
    // `zoomOf` reports the window width, so a larger number is further out.
    expect(zoomOf(whole)).toBeGreaterThan(zoomOf(defaultWindow(WIDE)));
    const tight = clampWindow(windowFromZoom(100, WIDE, 1000, 600));
    expect(tight.width).toBeGreaterThanOrEqual(250);
    expect(tight.height).toBeGreaterThanOrEqual(150);
  });

  it("a pinch keeps the anchor point still", () => {
    const window = defaultWindow(WIDE);
    const zoomed = pinchTo(window, 2, window.x + window.width / 2, window.y + window.height / 2);
    expect(zoomed.width).toBeLessThan(window.width);
    expect(zoomed.width).toBeCloseTo(window.width / 2, 0);
  });
});

describe("TC-MATCH-920: panning", () => {
  it("a two-finger drag moves the window and stops at the edge", () => {
    const window = defaultWindow(WIDE);
    const moved = panBy(window, -100, 0, 1000);
    expect(moved.x).toBeGreaterThan(window.x);
    const pinned = panBy({ ...window, x: 0 }, 500, 0, 1000);
    expect(pinned.x).toBe(0);
    const rightEdge = panBy({ ...window, x: MAP_BOUNDS.width - window.width }, -500, 0, 1000);
    expect(rightEdge.x).toBe(MAP_BOUNDS.width - window.width);
  });
});

describe("TC-MATCH-921: the ruler", () => {
  it("counts eight divisions at the default window and sixteen at the whole map", () => {
    expect(rulerLayout(defaultWindow(WIDE)).segments).toBe(8);
    expect(rulerLayout({ x: 0, y: 0, width: 2000, height: 1200 }).segments).toBe(16);
    const layout = rulerLayout(defaultWindow(WIDE));
    expect(layout.unitsPerDivision).toBeCloseTo(layout.segments === 8 ? 125 : 250, 0);
  });
});

describe("TC-MATCH-922: power", () => {
  it("maps a drag to a 0–4 power bar and a 0–100 force", () => {
    expect(powerFromDrag(0, 400)).toBe(0);
    expect(powerFromDrag(400 * 0.45, 400)).toBeCloseTo(4, 1);
    expect(powerFromDrag(10_000, 400)).toBe(4);
    expect(forceFromPower(4)).toBe(100);
    expect(forceFromPower(0)).toBe(0);
    expect(forceFromPower(1.5)).toBe(38);
  });

  it("mirrors the angle with the facing direction and stays inside the window", () => {
    expect(angleFromPull(0, -100, 1)).toBe(90);
    expect(angleFromPull(0, -100, -1)).toBe(90);
    expect(angleFromPull(100, 100, 1)).toBe(-45);
    expect(angleFromPull(-100, 100, -1)).toBe(-45);
  });

  it("draws the ring between the two documented radii", () => {
    expect(powerRingRadius(0)).toBeLessThan(powerRingRadius(2));
    expect(powerRingRadius(2)).toBeLessThan(powerRingRadius(4));
    expect(powerRingRadius(4)).toBeLessThanOrEqual(76);
  });
});
