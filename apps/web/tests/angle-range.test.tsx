// @vitest-environment jsdom
/**
 * TC-MATCH-952: the angle-range ring around the mobile (`US-MATCH-002` AC2, owner's request 2026-11-09).
 *
 * The power ring says how hard; this one says *where the barrel may point* and where it points right now. It is drawn from
 * the mobile's own `angleMin`/`angleMax`, so the geometry has to follow the hull's facing — a mirrored hull sweeps the other
 * way, and a fan drawn with the wrong `anticlockwise` is a window that reads upside down.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { getMobile } from "@gbw/core";
import { ANGLE_RING_RADIUS, RING_RADIUS, angleArc, anglePoint } from "../src/game/aim";
import { WindDial } from "../src/components/WindDial";

afterEach(cleanup);

const DEG = Math.PI / 180;

describe("TC-MATCH-952: the fan a mobile can fire through", () => {
  it("maps the window onto canvas angles, mirrored by the hull's facing", () => {
    const mobile = getMobile("mbl-01");
    const right = angleArc(mobile.angleMin, mobile.angleMax, 1);
    const left = angleArc(mobile.angleMin, mobile.angleMax, -1);

    // Canvas y grows downwards, so a firing angle of θ is −θ when the hull faces right.
    expect(right.start).toBeCloseTo(-mobile.angleMin * DEG, 6);
    expect(right.end).toBeCloseTo(-mobile.angleMax * DEG, 6);
    // Mirrored: the same window sits at π+θ, and it runs the other way round.
    expect(left.start).toBeCloseTo(Math.PI + mobile.angleMin * DEG, 6);
    expect(left.end).toBeCloseTo(Math.PI + mobile.angleMax * DEG, 6);
    expect(left.anticlockwise).toBe(!right.anticlockwise);
  });

  it("keeps the fan above the horizon and on the hull's own side", () => {
    // Canvas y grows downwards, so "up" is a negative sine at either facing; the horizontal sign is what mirrors.
    for (const facing of [1, -1] as const) {
      for (const degrees of [0, 15, 45, 70]) {
        const radians = anglePoint(degrees, facing);
        const rise = Math.sin(radians);
        const run = Math.cos(radians);
        if (degrees === 0) {
          expect(Math.abs(rise)).toBeLessThan(1e-9);
        } else {
          expect(rise).toBeLessThan(0);
        }
        // A barrel never points backwards: right-facing runs +x, mirrored runs −x.
        expect(facing === 1 ? run >= 0 : run <= 0).toBe(true);
      }
    }
  });

  it("marks 45° where the barrel actually points", () => {
    expect(anglePoint(45, 1)).toBeCloseTo(-Math.PI / 4, 6);
    expect(anglePoint(45, -1)).toBeCloseTo(Math.PI + Math.PI / 4, 6);
  });

  it("is a smaller ring than the power ring, so the two never read as one circle", () => {
    expect(ANGLE_RING_RADIUS).toBeLessThan(RING_RADIUS);
    expect(ANGLE_RING_RADIUS).toBeGreaterThanOrEqual(32);
  });
});

describe("TC-MATCH-952: the wind dial still owns its own ring", () => {
  it("renders without the angle ring leaking into it", () => {
    // Guard against the two circles being confused in one component: the dial takes no angle at all.
    render(<WindDial weather={{ wind: { magnitude: 5, directionDeg: 0, sector: 0 }, rolledAtRound: 1 }} label="Gió" />);
    expect(screen.getByTestId("wind-dial")).toBeTruthy();
    expect(screen.getByTestId("wind-value").textContent).toBe("5");
  });
});
