// @vitest-environment jsdom
/**
 * TC-MATCH-923: the wind dial (`docs/02-reference/screens/match.md`, `US-MATCH-003`).
 *
 * GB's wind is horizontal, so the dial is two ticks — east and west — an **arrow** along the horizontal axis whose
 * direction is `directionDeg` (0° east, 180° west), and the magnitude printed in the **centre** of the ring (owner's
 * layout, 2026-11-09). The dial is read by both players, so the mapping from the wire's `sector`/`directionDeg` to what is
 * drawn is the contract under test.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Weather } from "@gbw/core";
import { WindDial } from "../src/components/WindDial";

const LABEL = "Gió";

afterEach(cleanup);

function weather(magnitude: number, sector: number, directionDeg = sector * 180): Weather {
  return { wind: { magnitude, directionDeg, sector }, rolledAtRound: 1 };
}

function pointer(line: Element, attribute: "x1" | "y1" | "x2" | "y2"): number {
  return Number(line.getAttribute(attribute));
}

function ticks(container: HTMLElement): Element[] {
  return [...container.querySelectorAll("line")].filter((line) => line.getAttribute("stroke") !== "#ff7043");
}

describe("TC-MATCH-923: sector → highlighted tick", () => {
  it("draws two ticks and highlights exactly the sector's tick", () => {
    for (const sector of [0, 1]) {
      const { container, unmount } = render(<WindDial weather={weather(12, sector)} label={LABEL} />);
      const drawn = ticks(container);
      expect(drawn).toHaveLength(2);
      // The active side is both brighter and thicker (3 vs 1.5) — at 64 px a 1 px difference was invisible.
      const highlighted = drawn.filter((line) => line.getAttribute("stroke-width") === "3");
      expect(highlighted).toHaveLength(1);
      expect(drawn.indexOf(highlighted[0]!)).toBe(sector);
      unmount();
    }
  });

  it("puts tick 0 at the right edge and tick 1 at the left edge", () => {
    const { container } = render(<WindDial weather={weather(10, 0)} label={LABEL} />);
    const drawn = ticks(container);
    const east = drawn[0]!;
    expect(pointer(east, "x1")).toBeCloseTo(56, 1); // 32 + 24
    expect(pointer(east, "y1")).toBeCloseTo(32, 1);
    expect(pointer(east, "x2")).toBeCloseTo(62, 1); // 32 + 30
    const west = drawn[1]!;
    expect(pointer(west, "x1")).toBeCloseTo(8, 1); // 32 − 24
    expect(pointer(west, "y1")).toBeCloseTo(32, 1);
    expect(pointer(west, "x2")).toBeCloseTo(2, 1); // 32 − 30
  });
});

describe("TC-MATCH-923: directionDeg → needle angle", () => {
  it("points right at 0° and left at 180°, and never off the horizontal", () => {
    const { container, rerender } = render(<WindDial weather={weather(26, 0, 0)} label={LABEL} />);
    const needle = (): Element => container.querySelector('line[stroke="#ff7043"]')!;
    expect(pointer(needle(), "x2")).toBeCloseTo(59, 1); // 32 + 27
    expect(pointer(needle(), "y2")).toBeCloseTo(32, 1);

    rerender(<WindDial weather={weather(26, 1, 180)} label={LABEL} />);
    expect(pointer(needle(), "x2")).toBeCloseTo(5, 1); // 32 − 27
    expect(pointer(needle(), "y2")).toBeCloseTo(32, 1);
  });

  it("keeps the arrow the same length and fades it as the magnitude falls", () => {
    // The arrow answers "which way" and the centre number answers "how hard": a 2-unit wind must still point clearly,
    // so strength rides on weight and opacity instead of on length.
    const { container, rerender } = render(<WindDial weather={weather(26, 0, 0)} label={LABEL} />);
    const shaft = (): Element => container.querySelector('line[stroke="#ff7043"]')!;
    const strong = { x2: pointer(shaft(), "x2"), weight: Number(shaft().getAttribute("stroke-width")), fade: Number(shaft().getAttribute("stroke-opacity")) };
    rerender(<WindDial weather={weather(13, 0, 0)} label={LABEL} />);
    const half = { x2: pointer(shaft(), "x2"), weight: Number(shaft().getAttribute("stroke-width")), fade: Number(shaft().getAttribute("stroke-opacity")) };
    rerender(<WindDial weather={weather(2, 0, 0)} label={LABEL} />);
    const faint = { x2: pointer(shaft(), "x2"), weight: Number(shaft().getAttribute("stroke-width")), fade: Number(shaft().getAttribute("stroke-opacity")) };

    expect(half.x2).toBeCloseTo(strong.x2, 1);
    expect(faint.x2).toBeCloseTo(strong.x2, 1);
    expect(strong.weight).toBeGreaterThan(half.weight);
    expect(half.weight).toBeGreaterThan(faint.weight);
    expect(strong.fade).toBeGreaterThan(faint.fade);
    expect(faint.fade).toBeGreaterThan(0.3);
  });
});

describe("TC-MATCH-923: calm wind and the printed magnitude", () => {
  it("prints the magnitude in the centre of the ring", () => {
    render(<WindDial weather={weather(17, 1)} label={LABEL} />);
    const value = screen.getByTestId("wind-value");
    expect(value.textContent).toBe("17");
    // Centre of a 64 × 64 viewBox, and inside the svg — not a label parked beside it.
    expect(value.tagName.toLowerCase()).toBe("text");
    expect(Number(value.getAttribute("x"))).toBe(32);
    expect(Number(value.getAttribute("y"))).toBe(32);
    expect(value.closest("svg")).not.toBeNull();
    expect(screen.getByTestId("wind-dial")).toHaveAccessibleName(`${LABEL}: 17`);
  });

  it("draws an arrowhead at the tip of the shaft, pointing the way the wind pushes", () => {
    const { container, rerender } = render(<WindDial weather={weather(26, 0, 0)} label={LABEL} />);
    const head = (): Element => container.querySelector('polygon[fill="#ff7043"]')!;
    expect(head()).not.toBeNull();
    // The head's middle point is the shaft's tip, so the barbs sit behind it and point east.
    const points = head().getAttribute("points")!.split(" ").map((pair) => pair.split(",").map(Number));
    expect(points[1]![0]).toBeCloseTo(59, 0);
    expect(points[0]![0]).toBeLessThan(points[1]![0]!);

    rerender(<WindDial weather={weather(26, 1, 180)} label={LABEL} />);
    const west = head().getAttribute("points")!.split(" ").map((pair) => pair.split(",").map(Number));
    expect(west[1]![0]).toBeCloseTo(5, 0);
    expect(west[0]![0]).toBeGreaterThan(west[1]![0]!);
  });

  it("draws no needle at magnitude 0, just a hollow centre", () => {
    const { container } = render(<WindDial weather={weather(0, 0, 0)} label={LABEL} />);
    expect(container.querySelector('line[stroke="#ff7043"]')).toBeNull();
    expect(container.querySelector('polygon[fill="#ff7043"]')).toBeNull();
    const centre = container.querySelector('circle[fill="#9fb0cc"]');
    expect(centre).not.toBeNull();
    expect(centre?.getAttribute("r")).toBe("2.5");
    expect(screen.getByTestId("wind-value").textContent).toBe("0");
  });
});
