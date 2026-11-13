import { describe, expect, it } from "vitest";
import {
  angleFromPull,
  clampWindow,
  defaultWindow,
  barFromPower,
  panBy,
  pinchTo,
  powerFromDrag,
  powerRingRadius,
  rulerLayout,
  windowFromZoom,
  windowOn,
  windowMeasuring,
  zoomOf,
  formatParts,
  isMeasuring,
  partsOf,
  unitsOf,
} from "../src/camera.js";
import { TUNABLES } from "../src/tuning.js";
import { MAP_BOUNDS } from "../src/data/maps.js";

const WIDE = 5 / 3;

describe("TC-BAL-105: the window shows exactly one screen", () => {
  it("opens on one screen — 800 units wide — whatever the canvas aspect", () => {
    const window = defaultWindow(WIDE);
    expect(window.width).toBe(TUNABLES.manWidth);
    // The aspect buys height, never width: 800 / (5/3).
    expect(window.height).toBeCloseTo(TUNABLES.manWidth / WIDE, 0);
    expect(window.width / window.height).toBeCloseTo(WIDE, 2);
  });

  it("gives a 2.7:1 phone the same 800 units of width and less sky", () => {
    // The old rule kept 600 units of height and let this phone see 1,620 units across, i.e. two screens: range stopped
    // transferring between devices. Width is now the invariant (`US-BAL-002` AC1).
    const phone = windowOn(MAP_BOUNDS.width * 0.3, 2.7, MAP_BOUNDS.height * 0.55);
    expect(phone.width).toBe(TUNABLES.manWidth);
    expect(phone.height).toBeCloseTo(TUNABLES.manWidth / 2.7, 0);
    expect(phone.width / phone.height).toBeCloseTo(2.7, 2);
  });

  it("falls back to the map height on a canvas taller than the map", () => {
    // Portrait is refused by the orientation gate, but a window must never be wider than one screen *because* of it.
    const tall = windowOn(MAP_BOUNDS.width / 2, 0.5);
    expect(tall.height).toBeLessThanOrEqual(MAP_BOUNDS.height);
    expect(tall.width).toBeLessThanOrEqual(TUNABLES.manWidth);
  });

  it("sits on the ground line so the battlefield is visible, not the sky", () => {
    const window = defaultWindow(WIDE);
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

  it("TC-BAL-106: keeps an opponent more than one screen away off the frame", () => {
    // The spawn gap on the 2,000-unit map is 1,640 units: 2.05 màn. The window is 800 wide, so the target cannot be in it.
    const shooterX = 180;
    const targetX = 1820;
    const window = windowOn(shooterX, WIDE, MAP_BOUNDS.height);
    expect(Math.abs(targetX - shooterX)).toBeGreaterThan(TUNABLES.manWidth);
    expect(targetX).toBeGreaterThan(window.x + window.width);
  });

  it("TC-BAL-101: measures in parts of a screen", () => {
    expect(partsOf(TUNABLES.manWidth)).toBe(8);
    expect(partsOf(250)).toBeCloseTo(2.5, 1);
    expect(unitsOf(2.5)).toBe(250);
    expect(formatParts(120)).toBe("1.2 phần");
    expect(formatParts(-80)).toBe("-0.8 phần");
    expect(formatParts(-0.01)).toBe("0.0 phần");
  });

  it("TC-BAL-104: opens the whole map to measure and recognises the state", () => {
    const measure = windowMeasuring(WIDE);
    expect(measure.width).toBe(TUNABLES.mapWidth);
    expect(isMeasuring(measure)).toBe(true);
    expect(isMeasuring(defaultWindow(WIDE))).toBe(false);
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

describe("TC-BAL-102: the ruler counts parts", () => {
  it("counts eight divisions at one screen and twenty at the whole map, each one a part", () => {
    expect(rulerLayout(defaultWindow(WIDE)).segments).toBe(8);
    expect(rulerLayout(defaultWindow(WIDE)).unitsPerDivision).toBe(100);
    expect(rulerLayout({ x: 0, y: 0, width: 2000, height: 1200 }).segments).toBe(20);
    const layout = rulerLayout(defaultWindow(WIDE));
    expect(layout.unitsPerDivision).toBe(TUNABLES.partWidth);
  });
});

describe("power from a drag", () => {
  it("maps a drag to the 0–4 power bar the shot itself takes", () => {
    expect(powerFromDrag(0, 400)).toBe(0);
    expect(powerFromDrag(400 * 0.45, 400)).toBeCloseTo(4, 1);
    expect(powerFromDrag(10_000, 400)).toBe(4);
    // The bar *is* the wire value now (`US-BAL-004` AC1): no second 0–100 scale to convert.
    expect(barFromPower(4)).toBe(4);
    expect(barFromPower(0)).toBe(0);
    expect(barFromPower(1.5)).toBe(1.5);
    expect(barFromPower(1.567)).toBe(1.57);
    expect(barFromPower(9)).toBe(4);
    expect(barFromPower(-2)).toBe(0);
  });

  it("mirrors the angle with the facing direction and stays inside the window", () => {
    expect(angleFromPull(0, -100, 1)).toBe(90);
    expect(angleFromPull(0, -100, -1)).toBe(90);
    expect(angleFromPull(100, 100, 1)).toBe(-45);
    expect(angleFromPull(-100, 100, -1)).toBe(-45);
  });

  it("keeps the ring at one fixed screen radius whatever the power", () => {
    // `tunables.md` § 9: "always the same size, so the number inside is readable while zooming" — a radius
    // that grew with the pull would turn the ring into a second power bar (`US-MATCH-002` §4).
    for (const power of [0, 2, 4]) expect(powerRingRadius(power)).toBe(64);
  });
});
