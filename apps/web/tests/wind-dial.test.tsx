// @vitest-environment jsdom
/**
 * TC-MATCH-923: the wind dial (`docs/02-reference/screens/match.md`, `US-MATCH-003`).
 *
 * Twelve 30° sectors, a longer tick on the four cardinals, the magnitude printed beside the dial,
 * and a needle whose angle is `directionDeg`. The dial is read by both players, so the mapping from
 * the wire's `sector`/`directionDeg` to what is drawn is the contract under test.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Weather } from "@gbw/core";
import { WindDial } from "../src/components/WindDial";

const LABEL = "Gió";

afterEach(cleanup);

function weather(magnitude: number, sector: number, directionDeg = sector * 30): Weather {
  return { wind: { magnitude, directionDeg, sector }, rolledAtRound: 1 };
}

function pointer(line: Element, attribute: "x1" | "y1" | "x2" | "y2"): number {
  return Number(line.getAttribute(attribute));
}

describe("TC-MATCH-923: sector → highlighted tick", () => {
  it("draws twelve ticks and highlights exactly the sector's tick", () => {
    for (const sector of [0, 3, 6, 9, 11]) {
      const { container, unmount } = render(<WindDial weather={weather(12, sector)} label={LABEL} />);
      const ticks = [...container.querySelectorAll("line")].filter(
        (line) => line.getAttribute("stroke") !== "#ff7043",
      );
      expect(ticks).toHaveLength(12);
      const highlighted = ticks.filter((line) => line.getAttribute("stroke-width") === "2");
      expect(highlighted).toHaveLength(1);
      expect(ticks.indexOf(highlighted[0]!)).toBe(sector);
      unmount();
    }
  });

  it("puts tick 0 at the top and tick 3 at the right (12 o'clock, 3 o'clock)", () => {
    const { container } = render(<WindDial weather={weather(10, 0)} label={LABEL} />);
    const ticks = [...container.querySelectorAll("line")].filter(
      (line) => line.getAttribute("stroke") !== "#ff7043",
    );
    const top = ticks[0]!;
    expect(pointer(top, "x1")).toBeCloseTo(22, 1);
    expect(pointer(top, "y1")).toBeCloseTo(8, 1); // 22 − 14, the longer cardinal tick
    const right = ticks[3]!;
    expect(pointer(right, "x1")).toBeCloseTo(36, 1);
    expect(pointer(right, "y1")).toBeCloseTo(22, 1);
  });

  it("keeps the cardinal ticks longer than the others", () => {
    const { container } = render(<WindDial weather={weather(10, 1)} label={LABEL} />);
    const ticks = [...container.querySelectorAll("line")].filter(
      (line) => line.getAttribute("stroke") !== "#ff7043",
    );
    const length = (line: Element): number =>
      Math.hypot(pointer(line, "x2") - pointer(line, "x1"), pointer(line, "y2") - pointer(line, "y1"));
    for (const index of [0, 3, 6, 9]) expect(length(ticks[index]!)).toBeGreaterThan(length(ticks[1]!));
  });
});

describe("TC-MATCH-923: directionDeg → needle angle", () => {
  it("points right at 90°, up at 0°, down at 180° and left at 270°", () => {
    const { container, rerender } = render(<WindDial weather={weather(26, 3, 90)} label={LABEL} />);
    const needle = (): Element => container.querySelector('line[stroke="#ff7043"]')!;
    expect(pointer(needle(), "x2")).toBeCloseTo(40, 1); // 22 + 18
    expect(pointer(needle(), "y2")).toBeCloseTo(22, 1);

    rerender(<WindDial weather={weather(26, 0, 0)} label={LABEL} />);
    expect(pointer(needle(), "x2")).toBeCloseTo(22, 1);
    expect(pointer(needle(), "y2")).toBeCloseTo(4, 1); // 22 − 18

    rerender(<WindDial weather={weather(26, 6, 180)} label={LABEL} />);
    expect(pointer(needle(), "y2")).toBeCloseTo(40, 1);

    rerender(<WindDial weather={weather(26, 9, 270)} label={LABEL} />);
    expect(pointer(needle(), "x2")).toBeCloseTo(4, 1);
  });

  it("shortens the needle as the magnitude falls", () => {
    const { container, rerender } = render(<WindDial weather={weather(26, 3, 90)} label={LABEL} />);
    const length = (): number => pointer(container.querySelector('line[stroke="#ff7043"]')!, "x2") - 22;
    const strong = length();
    rerender(<WindDial weather={weather(13, 3, 90)} label={LABEL} />);
    const half = length();
    rerender(<WindDial weather={weather(2, 3, 90)} label={LABEL} />);
    const faint = length();
    expect(strong).toBeGreaterThan(half);
    expect(half).toBeGreaterThan(faint);
    expect(faint).toBeGreaterThan(0);
  });
});

describe("TC-MATCH-923: calm wind and the printed magnitude", () => {
  it("shows the magnitude as text beside the dial", () => {
    render(<WindDial weather={weather(17, 5)} label={LABEL} />);
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
