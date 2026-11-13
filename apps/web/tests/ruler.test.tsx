// @vitest-environment jsdom
/**
 * TC-BAL-104: the bottom ruler (`US-BAL-001` AC2, `docs/02-reference/screens/match.md`).
 *
 * One division is **one part of a screen** — 100 world units — at every zoom, and its label is the part's number on the
 * map, so a distance a player learned in one match means the same thing in the next. The ruler is drawn from the same
 * `CameraWindow` the physics positions are expressed in, so the two cannot drift apart.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TUNABLES, defaultWindow, rulerLayout, type CameraWindow } from "@gbw/core";
import { Ruler } from "../src/components/Ruler";

const UNIT_LABEL = "phần";
const DEFAULT = defaultWindow(5 / 3);
const WHOLE_MAP: CameraWindow = { x: 0, y: 0, width: TUNABLES.mapWidth, height: TUNABLES.mapHeight };

/** World units covered by one division at this zoom — the ruler's own claim. */
function divisionWorlds(window: CameraWindow): number {
  return rulerLayout(window).unitsPerDivision;
}

describe("US-BAL-001 AC2: the ruler divides the visible window into parts", () => {
  it("draws 8 divisions of one part each across one screen", () => {
    const layout = rulerLayout(DEFAULT);
    expect(layout.segments).toBe(8);
    expect(layout.unitsPerDivision).toBe(TUNABLES.partWidth);
    // The labels are the parts' numbers on the map, not offsets from the window's left edge.
    expect(layout.labels).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  it("counts every part of the whole map when opened up to measure", () => {
    const layout = rulerLayout(WHOLE_MAP);
    expect(layout.segments).toBe(TUNABLES.mapWidth / TUNABLES.partWidth);
    expect(layout.unitsPerDivision).toBe(TUNABLES.partWidth);
    expect(layout.labels[0]).toBe(0);
    expect(layout.labels[layout.labels.length - 1]).toBe(TUNABLES.mapWidth / TUNABLES.partWidth);
  });

  it("keeps one division equal to one part at any zoom (AC2)", () => {
    expect(divisionWorlds(DEFAULT)).toBe(TUNABLES.partWidth);
    expect(divisionWorlds(WHOLE_MAP)).toBe(TUNABLES.partWidth);
    for (const width of [1250, 1400, 1600]) {
      const layout = rulerLayout({ ...DEFAULT, width });
      expect(layout.unitsPerDivision).toBe(TUNABLES.partWidth);
      expect(layout.segments).toBe(Math.round(width / TUNABLES.partWidth));
    }
  });

  it("never shows fewer than 8 divisions, even zoomed right in", () => {
    const zoomed = rulerLayout({ x: 900, y: 700, width: TUNABLES.zoomMaxWidth, height: TUNABLES.zoomMaxHeight });
    expect(zoomed.segments).toBe(TUNABLES.partsPerMan);
    expect(zoomed.unitsPerDivision).toBe(TUNABLES.partWidth);
  });
});

describe("US-BAL-001 AC2: a part is the unit the simulation is measured in", () => {
  it("measures the map as eight parts to a screen and 2.5 screens across", () => {
    expect(TUNABLES.manWidth).toBe(TUNABLES.partWidth * TUNABLES.partsPerMan);
    expect(TUNABLES.mapWidth / TUNABLES.manWidth).toBe(2.5);
    // A shell that travels one whole screen crosses exactly eight divisions.
    expect(TUNABLES.manWidth / TUNABLES.partWidth).toBe(TUNABLES.partsPerMan);
  });
});

describe("US-BAL-001 AC2: the DOM ruler exposes every division", () => {
  it("renders one label per division plus the origin: 9 at one screen, 21 at the whole map", () => {
    const { rerender } = renderRuler(DEFAULT);
    expect(screen.getAllByTitle(new RegExp(UNIT_LABEL))).toHaveLength(9);
    rerender(WHOLE_MAP);
    expect(screen.getAllByTitle(new RegExp(UNIT_LABEL))).toHaveLength(21);
  });

  it("labels each division with its part number (AC2)", () => {
    renderRuler(WHOLE_MAP);
    const labels = screen.getAllByTitle(new RegExp(UNIT_LABEL)).map((node) => node.textContent ?? "");
    expect(labels[0]).toBe("0");
    expect(labels[labels.length - 1]).toBe(String(TUNABLES.mapWidth / TUNABLES.partWidth));
    expect(labels[1]).toBe("1");
  });
});

function renderRuler(window: CameraWindow): { rerender: (next: CameraWindow) => void } {
  const view = render(<Ruler window={window} unitLabel={UNIT_LABEL} />);
  return { rerender: (next) => view.rerender(<Ruler window={next} unitLabel={UNIT_LABEL} />) };
}
