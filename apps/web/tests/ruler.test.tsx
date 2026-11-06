// @vitest-environment jsdom
/**
 * TC-MATCH-920: the bottom ruler (`US-MATCH-007` AC5/AC8, `docs/02-reference/screens/match.md`).
 *
 * One division is 125 world units at the default window *and* at the whole-map zoom, which is what
 * makes a wind push readable against a shot distance. The ruler is drawn from the same
 * `CameraWindow` the physics positions are expressed in, so the two cannot drift apart.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TUNABLES, defaultWindow, rulerLayout, type CameraWindow } from "@gbw/core";
import { Ruler } from "../src/components/Ruler";

const UNIT_LABEL = "đơn vị";
const DEFAULT = defaultWindow(5 / 3);
const WHOLE_MAP: CameraWindow = { x: 0, y: 0, width: TUNABLES.mapWidth, height: TUNABLES.mapHeight };

/** World units covered by one division at this zoom — the ruler's own claim. */
function divisionWorlds(window: CameraWindow): number {
  return rulerLayout(window).unitsPerDivision;
}

describe("TC-MATCH-920: the ruler divides the visible window", () => {
  it("draws 8 divisions of 125 units at the default window", () => {
    const layout = rulerLayout(DEFAULT);
    expect(layout.segments).toBe(8);
    expect(layout.unitsPerDivision).toBe(TUNABLES.rulerUnitTarget);
    expect(layout.labels).toEqual([0, 125, 250, 375, 500, 625, 750, 875, 1000]);
  });

  it("draws 16 divisions of 125 units at the whole-map zoom", () => {
    const layout = rulerLayout(WHOLE_MAP);
    expect(layout.segments).toBe(16);
    expect(layout.unitsPerDivision).toBe(TUNABLES.rulerUnitTarget);
    expect(layout.labels[0]).toBe(0);
    expect(layout.labels[layout.labels.length - 1]).toBe(TUNABLES.mapWidth);
  });

  it("reads 125 units per division at both ends of a zoom round trip (AC8)", () => {
    expect(divisionWorlds(DEFAULT)).toBe(TUNABLES.rulerUnitTarget);
    expect(divisionWorlds(WHOLE_MAP)).toBe(TUNABLES.rulerUnitTarget);
    // In between, the reported unit is exactly the visible width split by the segment count.
    for (const width of [1250, 1400, 1600]) {
      const layout = rulerLayout({ ...DEFAULT, width });
      expect(layout.unitsPerDivision).toBeCloseTo(round1(width / layout.segments), 2);
    }
  });

  it("never drops below 8 divisions, even when zoomed in", () => {
    const zoomed = rulerLayout({ x: 900, y: 700, width: TUNABLES.zoomMaxWidth, height: TUNABLES.zoomMaxHeight });
    expect(zoomed.segments).toBe(8);
    expect(zoomed.unitsPerDivision).toBe(round1(TUNABLES.zoomMaxWidth / 8));
  });
});

describe("TC-MATCH-920: a 125-unit step in the simulation is one division", () => {
  it("measures the physics' own world units (the map is 2000 units wide)", () => {
    const layout = rulerLayout(DEFAULT);
    const oneDivision = layout.labels[1]! - layout.labels[0]!;
    expect(oneDivision).toBe(TUNABLES.rulerUnitTarget);
    // A shell that travels 1000 world units crosses the whole default window, i.e. 8 divisions.
    expect(Math.round(1000 / layout.unitsPerDivision)).toBe(8);
    expect(layout.labels[layout.labels.length - 1]).toBe(DEFAULT.width);
  });
});

describe("TC-MATCH-920: the DOM ruler exposes every division", () => {
  it("renders one label per division plus the origin, 9 at the default window", () => {
    const { rerender } = renderRuler(DEFAULT);
    expect(screen.getAllByTitle(new RegExp(UNIT_LABEL))).toHaveLength(9);
    rerender(WHOLE_MAP);
    expect(screen.getAllByTitle(new RegExp(UNIT_LABEL))).toHaveLength(17);
  });

  it("labels each division with its world width (AC5)", () => {
    renderRuler(WHOLE_MAP);
    // The last division sits at the map's right edge: 2000 world units, not "16".
    const labels = screen.getAllByTitle(new RegExp(UNIT_LABEL)).map((node) => node.textContent ?? "");
    expect(labels[labels.length - 1]).toBe(String(TUNABLES.mapWidth));
    expect(labels[1]).toBe(String(TUNABLES.rulerUnitTarget));
  });
});

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function renderRuler(window: CameraWindow): { rerender: (next: CameraWindow) => void } {
  const view = render(<Ruler window={window} unitLabel={UNIT_LABEL} />);
  return { rerender: (next) => view.rerender(<Ruler window={next} unitLabel={UNIT_LABEL} />) };
}
