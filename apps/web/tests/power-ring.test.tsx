// @vitest-environment jsdom
/**
 * TC-MATCH-915: the power indicator (`US-MATCH-002` AC1/AC2, `docs/02-reference/screens/match.md`).
 *
 * The arc/ring itself is drawn by the Phaser scene, which cannot mount in jsdom, so this file pins
 * the numbers the drawing reads: the bar itself (what the shot uses) and `powerRingRadius` (the
 * screen radius of the ring).
 *
 * KNOWN GAP (recorded, not fixed): there is no `apps/web/src/game/hud/PowerRing.tsx` (or `.ts`).
 * The story's contract names it, and the numeric readout lives inline in `MatchPage` (`power-value`).
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TUNABLES, barFromPower, powerRingRadius } from "@gbw/core";
import { LocaleProvider } from "../src/app/providers";
import { MatchAimOverlays } from "../src/match/MatchAimOverlays";

describe("TC-MATCH-915: the numeric power readout runs 0.0–4.0", () => {
  it("carries the bar value straight to the integrator, 0–4", () => {
    expect(barFromPower(0)).toBe(0);
    expect(barFromPower(1)).toBe(1);
    expect(barFromPower(2)).toBe(2);
    expect(barFromPower(TUNABLES.powerBarMax)).toBe(4);
  });

  it("keeps the bar monotonic across the whole wheel", () => {
    let previous = -1;
    for (let power = 0; power <= TUNABLES.powerBarMax; power += 0.1) {
      const value = barFromPower(power);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe("TC-MATCH-915: the ring keeps its fixed screen radius", () => {
  it("is the documented 64 px at every power — the ring never scales with the world", () => {
    // screens/match.md: "64 px screen radius, clockwise from −90°"; `powerRingRadiusPx` is the
    // tunable that states it. A radius that changes with power turns the ring into a second bar.
    for (const power of [0, 0.5, 1, 2, 3, TUNABLES.powerBarMax]) {
      expect(powerRingRadius(power), `radius at power ${power}`).toBe(TUNABLES.powerRingRadiusPx);
    }
  });
});

describe("TC-BAL-135: the HUD prints the bar, 0.0–4.0, not a 0–100 force", () => {
  it("renders one decimal of the bar for the whole travel of the ring", () => {
    const props = {
      items: [],
      itemsEnabled: false,
      wheelAt: null,
      onUseItem: () => undefined,
      onCloseWheel: () => undefined,
      aimAngle: 45,
      focus: { x: 100, y: 200 },
    };
    for (const [power, text] of [
      [0, "0.0"],
      [1.25, "1.3"],
      [2, "2.0"],
      [4, "4.0"],
    ] as const) {
      const { container, unmount } = render(
        <LocaleProvider>
          <MatchAimOverlays {...props} power={power} />
        </LocaleProvider>,
      );
      expect(container.querySelector(".match__power-number")?.textContent).toBe(text);
      unmount();
    }
  });
});
