// @vitest-environment jsdom
/**
 * TC-MATCH-914: drag to aim (`US-MATCH-002`).
 *
 * The drag→power mapping, the power→bar conversion and the aim angle live in `@gbw/core`
 * (`camera.ts`) and the gesture arbitration lives in `game/viewport.ts`; both are pure, so the
 * behaviour is tested here without a canvas.
 *
 * KNOWN GAP (recorded, not fixed): `apps/web/src/game/aim.ts` — the `AimController` state machine
 * the story's contract names (attach / setEnabled / getPull / onFire / onCancel) — does not exist,
 * so "release fires exactly once" and "cancel restores the pre-drag state" can only be observed
 * through the Phaser scene (`game/scene.ts`), which cannot run in jsdom.
 */
import { describe, expect, it } from "vitest";
import { TUNABLES, angleFromPull, barFromPower, powerFromDrag } from "@gbw/core";
import { ANGLE_DEG_PER_PX, addPointer, classify, clearPointers, pullBaseAngle } from "../src/game/viewport";

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

describe("TC-MATCH-914: the release hands the held power to the shot as its bar", () => {
  it("the bar is the power, quantised to 0.01 on the 0–4 scale (AC3)", () => {
    for (const power of [0, 0.3, 1, 1.5, 2, 2.6, 3.2, 4]) {
      expect(barFromPower(power)).toBe(Math.round(power * 100) / 100);
    }
  });

  it("is clamped to 0–4 and never negative", () => {
    expect(barFromPower(-1)).toBe(0);
    expect(barFromPower(9)).toBe(4);
    expect(barFromPower(barFromPower(2))).toBe(2);
  });

  it("the same drag always produces the same power and bar (one shot per release)", () => {
    const power = powerFromDrag(200, SHORT_EDGE);
    expect(powerFromDrag(200, SHORT_EDGE)).toBe(power);
    expect(barFromPower(power)).toBe(barFromPower(power));
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

/**
 * TC-MATCH-955: a pull's angle depends on how far the finger travelled, not on how many `pointermove` events reported it.
 *
 * `classify` measures `dy` from the press point, so the angle it is given as a base must be the one the barrel had when
 * the finger went down. Hand-playing a bot match on 2026-11-11 measured the alternative: dragging down 60 px rotated the
 * barrel from 45° to −10° (55°, its whole window) instead of 15°, and the same drag landed on a different angle depending
 * on how the browser coalesced the moves. This models the scene's loop — latch at press, one `classify` per event, carry
 * the result forward — and asserts the two event counts agree.
 */
describe("TC-MATCH-955: the angle does not compound per move event", () => {
  const ORIGIN = { id: 1, x: 400, y: 180 };

  /** What `interpret()` does per `pointermove`: the base is latched, and the running angle follows the latest event. */
  const dragDown = (steps: readonly number[]): number => {
    let barrel = 45;
    const pressAngle = barrel;
    for (const dy of steps) {
      const pointers = addPointer(clearPointers(), { id: 1, x: ORIGIN.x, y: ORIGIN.y + dy });
      const gesture = classify(pointers, {
        origin: ORIGIN,
        facing: 1,
        fullPowerDistance: 380,
        baseAngle: pullBaseAngle(pressAngle, barrel),
        previousSpread: null,
      });
      if (gesture.kind === "pull") barrel = gesture.angle;
    }
    return barrel;
  };

  it("twelve moves of 5 px land where one move of 60 px lands", () => {
    const one = dragDown([60]);
    const twelve = dragDown(Array.from({ length: 12 }, (_, index) => (index + 1) * 5));
    expect(twelve).toBeCloseTo(one, 6);
  });

  it("60 px of downward travel lowers the barrel by 15°, not by its whole window", () => {
    expect(dragDown([60])).toBeCloseTo(45 - 60 * ANGLE_DEG_PER_PX, 6);
  });

  it("dragging up raises it symmetrically, and sideways travel leaves it alone", () => {
    expect(dragDown([-60])).toBeCloseTo(45 + 60 * ANGLE_DEG_PER_PX, 6);
    expect(dragDown([0])).toBeCloseTo(45, 6);
  });
});
