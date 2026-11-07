// @vitest-environment jsdom
/**
 * The turn clock's whole seconds (`US-MATCH-003` AC2).
 *
 * The host's clock is the authority, and a host whose machine drifted forward must not make a 20 s turn read `24`.
 */
import { describe, expect, it } from "vitest";
import { clockSeconds } from "../src/lib/clock";

const NOW = 1_700_000_000_000;
const TWENTY_S = 20_000;

describe("TC-MATCH-932: the clock reads whole seconds and never more than the turn (US-MATCH-003 AC2)", () => {
  it("counts down from the deadline", () => {
    expect(clockSeconds(NOW + TWENTY_S, NOW, TWENTY_S)).toBe(20);
    expect(clockSeconds(NOW + 12_400, NOW, TWENTY_S)).toBe(13);
    expect(clockSeconds(NOW + 1, NOW, TWENTY_S)).toBe(1);
  });

  it("never reads above the turn duration, however far the deadline drifts", () => {
    expect(clockSeconds(NOW + 24_000, NOW, TWENTY_S)).toBe(20);
    expect(clockSeconds(NOW + 60_000, NOW, TWENTY_S)).toBe(20);
  });

  it("floors at zero once the turn is over", () => {
    expect(clockSeconds(NOW - 1, NOW, TWENTY_S)).toBe(0);
    expect(clockSeconds(NOW - 30_000, NOW, TWENTY_S)).toBe(0);
  });

  it("answers 0 for a broken deadline instead of printing NaN", () => {
    expect(clockSeconds(Number.NaN, NOW, TWENTY_S)).toBe(0);
    expect(clockSeconds(NOW, Number.NaN, TWENTY_S)).toBe(0);
  });
});
