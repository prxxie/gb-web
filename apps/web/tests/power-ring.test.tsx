// @vitest-environment jsdom
/**
 * TC-MATCH-915: the power indicator (`US-MATCH-002` AC1/AC2, `docs/02-reference/screens/match.md`).
 *
 * The arc/ring itself is drawn by the Phaser scene, which cannot mount in jsdom, so this file pins
 * the numbers the drawing reads: `forceFromPower` (what the shot uses) and `powerRingRadius` (the
 * screen radius of the ring).
 *
 * KNOWN GAP (recorded, not fixed): there is no `apps/web/src/game/hud/PowerRing.tsx` (or `.ts`).
 * The story's contract names it, and the numeric readout lives inline in `MatchPage` (`power-value`).
 */
import { describe, expect, it } from "vitest";
import { TUNABLES, forceFromPower, powerRingRadius } from "@gbw/core";

describe("TC-MATCH-915: the numeric power readout runs 0.0–4.0", () => {
  it("maps the bar value to the integrator's 0–100 force", () => {
    expect(forceFromPower(0)).toBe(0);
    expect(forceFromPower(1)).toBe(25);
    expect(forceFromPower(2)).toBe(50);
    expect(forceFromPower(TUNABLES.powerBarMax)).toBe(100);
  });

  it("keeps the force monotonic across the whole bar", () => {
    let previous = -1;
    for (let power = 0; power <= TUNABLES.powerBarMax; power += 0.1) {
      const force = forceFromPower(power);
      expect(force).toBeGreaterThanOrEqual(previous);
      previous = force;
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
