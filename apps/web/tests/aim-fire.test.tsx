// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  canAim,
  DEADZONE_POWER,
  fireFromPull,
  forceFromPower,
  RING_RADIUS,
  RING_START,
  ringColor,
  ringSweep,
} from "../src/game/aim";

const MOBILE = { angleMin: 10, angleMax: 80 } as const;

function context(overrides: Partial<Parameters<typeof fireFromPull>[1]> = {}) {
  return { slot: 1, weaponSlot: 0 as const, seq: 7, mobile: MOBILE, ...overrides };
}

describe("TC-MATCH-936: a release becomes exactly one fire input (US-MATCH-002 AC3, AC4, AC6, AC8)", () => {
  it("carries the slot, the active weapon and the sender's own seq", () => {
    const input = fireFromPull({ power: 1.3, angle: 45 }, context({ weaponSlot: 2, seq: 19 }));
    expect(input).toEqual({ kind: "fire", slot: 1, weaponSlot: 2, angle: 45, force: 33, seq: 19 });
  });

  it("sends force = round(power × 25) and never the float", () => {
    expect(fireFromPull({ power: 0.4, angle: 45 }, context())?.force).toBe(10);
    expect(fireFromPull({ power: 1.3, angle: 45 }, context())?.force).toBe(33);
    expect(fireFromPull({ power: 4, angle: 45 }, context())?.force).toBe(100);
    expect(forceFromPower(0)).toBe(0);
    expect(forceFromPower(9)).toBe(100);
    expect(forceFromPower(Number.NaN)).toBe(0);
  });

  it("sends nothing below the dead zone, or for a power that is not a number", () => {
    expect(DEADZONE_POWER).toBe(0.3);
    expect(fireFromPull({ power: 0.29, angle: 45 }, context())).toBeNull();
    expect(fireFromPull({ power: Number.NaN, angle: 45 }, context())).toBeNull();
  });

  it("clamps the angle to the mobile's own window after the pad's offset", () => {
    expect(fireFromPull({ power: 2, angle: 95 }, context())?.angle).toBe(80);
    expect(fireFromPull({ power: 2, angle: 0 }, context())?.angle).toBe(10);
    expect(fireFromPull({ power: 2, angle: 60 }, context({ aimDelta: 30 }))?.angle).toBe(80);
    expect(fireFromPull({ power: 2, angle: 60 }, context({ aimDelta: -45 }))?.angle).toBe(15);
  });

  it("drops a release once this client already fired in the turn (AC8)", () => {
    const shot = { lockedTurn: 4, turnNumber: 4 };
    expect(fireFromPull({ power: 3, angle: 45 }, context({ shot }))).toBeNull();
    expect(fireFromPull({ power: 3, angle: 45 }, context({ shot: { lockedTurn: 4, turnNumber: 5 } }))?.force).toBe(75);
    expect(fireFromPull({ power: 3, angle: 45 }, context({ shot: { lockedTurn: null, turnNumber: 5 } }))?.force).toBe(75);
  });
});

describe("TC-MATCH-937: aiming is refused out of turn, when wrecked and after one shot (US-MATCH-002 AC7, AC8)", () => {
  const base = {
    status: "playing" as const,
    activeSlot: 1,
    localSlot: 1,
    eliminated: false,
    lockedTurn: null,
    turnNumber: 4,
  };

  it("allows a shot in this client's own live turn", () => {
    expect(canAim(base)).toBe(true);
  });

  it("refuses while another slot is to shoot (AC7)", () => {
    expect(canAim({ ...base, activeSlot: 0 })).toBe(false);
    expect(canAim({ ...base, activeSlot: 0, lockedTurn: null })).toBe(false);
  });

  it("refuses a wreck, a finished match and a turn already fired (AC8)", () => {
    expect(canAim({ ...base, eliminated: true })).toBe(false);
    expect(canAim({ ...base, status: "ended" })).toBe(false);
    expect(canAim({ ...base, lockedTurn: 4 })).toBe(false);
    expect(canAim({ ...base, lockedTurn: 3 })).toBe(true);
    // TC-MATCH-961 (`US-MATCH-012`): the previous turn's shell is still on screen, so the sky is not handed over yet.
    expect(canAim({ ...base, cinematic: true })).toBe(false);
    expect(canAim({ ...base, cinematic: false })).toBe(true);
  });
});

describe("TC-MATCH-936: the ring is a gradient arc that fills with the pull (US-MATCH-002 AC2)", () => {
  it("runs clockwise from −90° and fills the circle at full power", () => {
    expect(RING_START).toBeCloseTo(-Math.PI / 2, 5);
    expect(ringSweep(0)).toBe(0);
    expect(ringSweep(2)).toBeCloseTo(Math.PI, 5);
    expect(ringSweep(4)).toBeCloseTo(Math.PI * 2, 5);
    expect(ringSweep(9)).toBeCloseTo(Math.PI * 2, 5);
    expect(ringSweep(Number.NaN)).toBe(0);
  });

  it("goes amber at an empty pull and red at full power, monotonically in between", () => {
    expect(ringColor(0)).toBe(0xffb020);
    expect(ringColor(4)).toBe(0xff3b30);
    const red = (power: number) => (ringColor(power) >> 16) & 0xff;
    const green = (power: number) => (ringColor(power) >> 8) & 0xff;
    expect(red(1)).toBeGreaterThanOrEqual(red(0));
    expect(green(3)).toBeLessThan(green(0));
  });

  it("keeps a fixed screen radius so the number never shrinks with the camera", () => {
    expect(RING_RADIUS).toBe(64);
  });
});
