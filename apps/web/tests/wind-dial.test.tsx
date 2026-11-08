// @vitest-environment jsdom
/**
 * TC-MATCH-923: the wind dial (`docs/02-reference/screens/match.md`, `US-MATCH-003`).
 *
 * GB's wind is horizontal, so the dial is two ticks — east and west — the magnitude printed beside them, and a needle
 * along the horizontal axis whose direction is `directionDeg` (0° east, 180° west). The dial is read by both players, so
 * the mapping from the wire's `sector`/`directionDeg` to what is drawn is the contract under test.
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
      const highlighted = drawn.filter((line) => line.getAttribute("stroke-width") === "2");
      expect(highlighted).toHaveLength(1);
      expect(drawn.indexOf(highlighted[0]!)).toBe(sector);
      unmount();
    }
  });

  it("puts tick 0 at the right edge and tick 1 at the left edge", () => {
    const { container } = render(<WindDial weather={weather(10, 0)} label={LABEL} />);
    const drawn = ticks(container);
    const east = drawn[0]!;
    expect(pointer(east, "x1")).toBeCloseTo(36, 1); // 22 + 14
    expect(pointer(east, "y1")).toBeCloseTo(22, 1);
    expect(pointer(east, "x2")).toBeCloseTo(42, 1); // 22 + 20
    const west = drawn[1]!;
    expect(pointer(west, "x1")).toBeCloseTo(8, 1); // 22 − 14
    expect(pointer(west, "y1")).toBeCloseTo(22, 1);
    expect(pointer(west, "x2")).toBeCloseTo(2, 1); // 22 − 20
  });
});

describe("TC-MATCH-923: directionDeg → needle angle", () => {
  it("points right at 0° and left at 180°, and never off the horizontal", () => {
    const { container, rerender } = render(<WindDial weather={weather(26, 0, 0)} label={LABEL} />);
    const needle = (): Element => container.querySelector('line[stroke="#ff7043"]')!;
    expect(pointer(needle(), "x2")).toBeCloseTo(40, 1); // 22 + 18
    expect(pointer(needle(), "y2")).toBeCloseTo(22, 1);

    rerender(<WindDial weather={weather(26, 1, 180)} label={LABEL} />);
    expect(pointer(needle(), "x2")).toBeCloseTo(4, 1); // 22 − 18
    expect(pointer(needle(), "y2")).toBeCloseTo(22, 1);
  });

  it("shortens the needle as the magnitude falls", () => {
    const { container, rerender } = render(<WindDial weather={weather(26, 0, 0)} label={LABEL} />);
    const length = (): number => pointer(container.querySelector('line[stroke="#ff7043"]')!, "x2") - 22;
    const strong = length();
    rerender(<WindDial weather={weather(13, 0, 0)} label={LABEL} />);
    const half = length();
    rerender(<WindDial weather={weather(2, 0, 0)} label={LABEL} />);
    const faint = length();
    expect(strong).toBeGreaterThan(half);
    expect(half).toBeGreaterThan(faint);
    expect(faint).toBeGreaterThan(0);
  });
});

describe("TC-MATCH-923: calm wind and the printed magnitude", () => {
  it("shows the magnitude as text beside the dial", () => {
    render(<WindDial weather={weather(17, 1)} label={LABEL} />);
    expect(screen.getByTestId("wind-value").textContent).toBe("17");
    expect(screen.getByTestId("wind-dial")).toHaveAccessibleName(`${LABEL}: 17`);
  });

  it("draws no needle at magnitude 0, just a hollow centre", () => {
    const { container } = render(<WindDial weather={weather(0, 0, 0)} label={LABEL} />);
    expect(container.querySelector('line[stroke="#ff7043"]')).toBeNull();
    const centre = container.querySelector('circle[fill="#9fb0cc"]');
    expect(centre).not.toBeNull();
    expect(centre?.getAttribute("r")).toBe("2");
    expect(screen.getByTestId("wind-value").textContent).toBe("0");
  });
});
