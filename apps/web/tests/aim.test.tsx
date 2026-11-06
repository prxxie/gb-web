// @vitest-environment jsdom
/**
 * TC-MATCH-914: drag to aim (`US-MATCH-002`).
 *
 * The drag→power mapping, the power→force conversion and the aim angle live in `@gbw/core`
 * (`camera.ts`) and the gesture arbitration lives in `game/viewport.ts`; both are pure, so the
 * behaviour is tested here without a canvas.
 *
 * KNOWN GAP (recorded, not fixed): `apps/web/src/game/aim.ts` — the `AimController` state machine
 * the story's contract names (attach / setEnabled / getPull / onFire / onCancel) — does not exist,
 * so "release fires exactly once" and "cancel restores the pre-drag state" can only be observed
 * through the Phaser scene (`game/scene.ts`), which cannot run in jsdom.
 */
import { describe, expect, it } from "vitest";
import { TUNABLES, angleFromPull, forceFromPower, powerFromDrag } from "@gbw/core";
import { addPointer, classify, clearPointers } from "../src/game/viewport";

const SHORT_EDGE = 600; // a landscape phone's shorter screen edge, logical px
const FULL_DRAG = SHORT_EDGE * TUNABLES.powerDragFullRatio; // 270 px

describe("TC-MATCH-914: the pull maps drag distance to power", () => {
  it("grows with the drag and reads 4.0 at 45 % of the shorter edge", () => {
    expect(powerFromDrag(0, SHORT_EDGE)).toBe(0);
    expect(powerFromDrag(FULL_DRAG, SHORT_EDGE)).toBe(TUNABLES.powerBarMax);

    let previous = -1;
    for (const distance of [0, 20, 60, 120, 180, 240, FULL_DRAG]) {
      const power = powerFromDrag(distance, SHORT_EDGE);
      expect(power, `power at ${distance}px`).toBeGreaterThan(previous);
      previous = power;
    }
  });

  it("half of a full drag reads 2.0 ± 0.1 (AC1)", () => {
    const power = powerFromDrag(FULL_DRAG / 2, SHORT_EDGE);
    expect(Math.abs(power - TUNABLES.powerBarMax / 2)).toBeLessThanOrEqual(0.1);
  });

  it("never exceeds the bar maximum, however far the finger travels", () => {
    expect(powerFromDrag(SHORT_EDGE * 4, SHORT_EDGE)).toBe(TUNABLES.powerBarMax);
    expect(powerFromDrag(SHORT_EDGE * 10, SHORT_EDGE)).toBe(TUNABLES.powerBarMax);
  });

  it("a drag under the deadzone stays below it, so the release sends nothing (AC4)", () => {
    const deadzoneDrag = (TUNABLES.powerDeadzone / TUNABLES.powerBarMax) * FULL_DRAG;
    expect(powerFromDrag(deadzoneDrag / 2, SHORT_EDGE)).toBeLessThan(TUNABLES.powerDeadzone);
  });
});

describe("TC-MATCH-914: the release converts the held power to force", () => {
  it("force is round(power × 25) on the integrator's 0–100 scale (AC3)", () => {
    for (const power of [0, 0.3, 1, 1.5, 2, 2.6, 3.2, 4]) {
      expect(forceFromPower(power)).toBe(Math.round(power * 25));
    }
  });

  it("is clamped to 0–100 and never negative", () => {
    expect(forceFromPower(-1)).toBe(0);
    expect(forceFromPower(9)).toBe(100);
    expect(forceFromPower(forceFromPower(2) / 25)).toBe(50);
  });

  it("the same drag always produces the same power and force (one shot per release)", () => {
    const power = powerFromDrag(200, SHORT_EDGE);
    expect(powerFromDrag(200, SHORT_EDGE)).toBe(power);
    expect(forceFromPower(power)).toBe(forceFromPower(power));
  });
});

describe("TC-MATCH-914: the aim angle comes from the pull vector", () => {
  it("points up for an upward drag and down for a downward one (AC6)", () => {
    expect(angleFromPull(0, -100, 1)).toBe(90);
    expect(angleFromPull(0, 100, 1)).toBe(-90);
  });

  it("is mirrored for a mobile facing the other way", () => {
    expect(angleFromPull(100, 0, 1)).toBeCloseTo(0);
    // A drag straight backwards is clamped to the barrel's half-plane, never behind the mobile.
    expect(angleFromPull(-100, 0, 1)).toBe(-90);
    expect(angleFromPull(100, 0, -1)).toBe(-90);
  });

  it("stays inside the barrel's ±90° half-plane", () => {
    expect(angleFromPull(-50, -50, 1)).toBe(90);
    expect(angleFromPull(-50, 50, 1)).toBe(-90);
    expect(angleFromPull(50, -50, 1)).toBe(45);
  });
});

describe("TC-MATCH-916: a second finger cancels the pull instead of firing (AC5)", () => {
  it("classifies two fingers as pan or zoom, never as a pull", () => {
    const one = addPointer(clearPointers(), { id: 1, x: 100, y: 100 });
    const two = addPointer(one, { id: 2, x: 300, y: 100 });
    const gesture = classify(
      two,
      { origin: { id: 1, x: 100, y: 100 }, facing: 1, screenShorterEdge: SHORT_EDGE, previousSpread: 200 },
    );
    expect(gesture.kind).not.toBe("pull");
    expect(["pan", "zoom"]).toContain(gesture.kind);
  });

  it("a single finger that never dragged is not a pull (a tap does nothing)", () => {
    const one = addPointer(clearPointers(), { id: 1, x: 100, y: 100 });
    const gesture = classify(one, { origin: null, facing: 1, screenShorterEdge: SHORT_EDGE, previousSpread: null });
    expect(gesture.kind).toBe("none");
  });
});
