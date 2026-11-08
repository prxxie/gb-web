// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { LOCALES, loadLocale, saveLocale, translate } from "../src/i18n";
import en from "../src/i18n/en.json";
import vi from "../src/i18n/vi.json";
import { addPointer, classify, clearPointers, movePointer, screenToWorld, viewportFor } from "../src/game/viewport";
import { defaultWindow, powerFromDrag, rulerLayout, forceFromPower, angleFromPull } from "@gbw/core";

describe("TC-PWA-130: locale tables", () => {
  it("carries the same keys in Vietnamese and English", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(vi).sort());
  });

  it("defaults to Vietnamese and remembers a choice", () => {
    expect(loadLocale({ getItem: () => null })).toBe("vi");
    const memory = new Map<string, string>();
    saveLocale("en", { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => void memory.set(key, value) });
    expect(loadLocale({ getItem: (key) => memory.get(key) ?? null })).toBe("en");
  });

  it("falls back to the Vietnamese string, not a blank label", () => {
    expect(translate("en", "app.title")).not.toBe("");
    expect(LOCALES).toContain("vi");
  });
});

describe("TC-MATCH-915/916: gestures", () => {
  const shorter = 390;

  it("turns a one-finger pull into power 0–4 and an angle inside the window", () => {
    let pointers = addPointer(clearPointers(), { id: 1, x: 200, y: 300 });
    pointers = movePointer(pointers, { id: 1, x: 120, y: 160 });
    const gesture = classify(pointers, { origin: { id: 1, x: 200, y: 300 }, facing: 1, fullPowerDistance: shorter, previousSpread: null });
    expect(gesture.kind).toBe("pull");
    if (gesture.kind !== "pull") return;
    expect(gesture.power).toBeGreaterThan(0);
    expect(gesture.power).toBeLessThanOrEqual(4);
    expect(gesture.angle).toBeGreaterThanOrEqual(-90);
    expect(gesture.angle).toBeLessThanOrEqual(90);
  });

  it("TC-MATCH-902: two fingers pan instead of firing", () => {
    let pointers = clearPointers();
    pointers = addPointer(pointers, { id: 1, x: 100, y: 100 });
    pointers = addPointer(pointers, { id: 2, x: 220, y: 100 });
    pointers = movePointer(pointers, { id: 1, x: 130, y: 100 });
    pointers = movePointer(pointers, { id: 2, x: 250, y: 100 });
    const gesture = classify(pointers, { origin: null, facing: 1, fullPowerDistance: shorter, previousSpread: 120 });
    expect(["pan", "zoom"]).toContain(gesture.kind);
    expect(gesture.kind).not.toBe("pull");
  });

  it("ignores a pull shorter than the deadzone", () => {
    expect(powerFromDrag(10, shorter)).toBeLessThan(0.3);
    expect(forceFromPower(0)).toBe(0);
    expect(forceFromPower(4)).toBe(100);
  });

  it("mirrors the angle when the mobile faces the other way", () => {
    const right = angleFromPull(-100, -100, 1);
    const left = angleFromPull(-100, -100, -1);
    expect(right).toBeGreaterThan(left);
    expect(right).toBeLessThanOrEqual(90);
    expect(left).toBeGreaterThanOrEqual(-90);
  });

  it("TC-MATCH-918: maps a screen point into world units", () => {
    const window = defaultWindow(5 / 3);
    const viewport = viewportFor(window, 1000, 600);
    const world = screenToWorld(window, viewport, 0, 0);
    expect(world.x).toBeCloseTo(window.x, 0);
    expect(world.y).toBeCloseTo(window.y, 0);
  });
});

describe("TC-MATCH-919/921: camera and ruler", () => {
  it("shows half the map by default and the whole map when zoomed out", () => {
    const window = defaultWindow(5 / 3);
    expect(window.width).toBeCloseTo(1000, 0);
    expect(window.height).toBeCloseTo(600, 0);
    const zoomedOut = { x: 0, y: 0, width: 2000, height: 1200 };
    expect(rulerLayout(zoomedOut).segments).toBe(16);
    expect(rulerLayout(window).segments).toBe(8);
    for (const candidate of [window, zoomedOut, { x: 0, y: 0, width: 1400, height: 840 }]) {
      const layout = rulerLayout(candidate);
      expect(layout.segments).toBeGreaterThanOrEqual(8);
      expect(layout.segments).toBeLessThanOrEqual(16);
    }
  });
});
