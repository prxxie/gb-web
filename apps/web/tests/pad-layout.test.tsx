// @vitest-environment jsdom
/**
 * The pad's position on screen (`US-MATCH-003` AC11).
 *
 * The screen reports where the renderer drew the active mobile; the pad is a 192 px box whose centre sits on that
 * point, clamped so it never leaves the viewport. Without a point the pad stays in its corner.
 */
import { describe, expect, it } from "vitest";
import { PAD_BOX, PAD_MARGIN, padLayout } from "../src/components/pad-layout";

const PHONE = { width: 844, height: 390 };

describe("TC-MATCH-930: the pad hangs on the active mobile (US-MATCH-003 AC11)", () => {
  it("puts the box centre on the mobile", () => {
    const placement = padLayout({ x: 400, y: 200 }, PHONE);
    expect(placement).not.toBeNull();
    expect(placement!.left + PAD_BOX / 2).toBeCloseTo(400, 5);
    expect(placement!.top + PAD_BOX / 2).toBeCloseTo(200, 5);
  });

  it("clamps a mobile near the left edge instead of hanging the pad off screen", () => {
    const placement = padLayout({ x: 20, y: 200 }, PHONE)!;
    expect(placement.left).toBe(PAD_MARGIN);
  });

  it("clamps against the bottom edge too", () => {
    const placement = padLayout({ x: 400, y: 388 }, PHONE)!;
    expect(placement.top).toBe(PHONE.height - PAD_MARGIN - PAD_BOX);
    expect(placement.top + PAD_BOX).toBeLessThanOrEqual(PHONE.height);
  });

  it("keeps the whole box inside the viewport for every point", () => {
    for (let x = -100; x <= 1000; x += 50) {
      for (let y = -100; y <= 500; y += 50) {
        const placement = padLayout({ x, y }, PHONE)!;
        expect(placement.left).toBeGreaterThanOrEqual(0);
        expect(placement.top).toBeGreaterThanOrEqual(0);
        expect(placement.left + PAD_BOX).toBeLessThanOrEqual(PHONE.width);
        expect(placement.top + PAD_BOX).toBeLessThanOrEqual(PHONE.height);
      }
    }
  });

  it("answers null when the renderer has no mobile to hang the pad on", () => {
    expect(padLayout(null, PHONE)).toBeNull();
    expect(padLayout({ x: Number.NaN, y: 10 }, PHONE)).toBeNull();
  });

  it("still places the box when the viewport is smaller than the pad", () => {
    const placement = padLayout({ x: 40, y: 40 }, { width: 120, height: 120 })!;
    expect(placement).toEqual({ left: PAD_MARGIN, top: PAD_MARGIN });
  });
});
