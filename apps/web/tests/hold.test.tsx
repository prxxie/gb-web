import { describe, expect, it } from "vitest";
import { advance, drag, HOLD_MS, HOLD_SLOP_PX, IDLE, lift, liftsAsShot, press } from "../src/game/hold";

/**
 * `TC-MATCH-911` — one finger has to be able to pan the camera *and* aim, and the two must never be confused.
 *
 * The rule: a press that moves more than the slop before the hold fires is a pan; a press that stays put for `HOLD_MS` is
 * a shot; once armed, the finger aims and the camera stops. Nothing here needs a browser, which is the point — the last
 * version of this logic was inside the Phaser scene and shipped a bug no test could see.
 */
describe("the hold gesture", () => {
  it("starts as a pending press that has not decided yet", () => {
    const state = press({ x: 100, y: 100 }, 0);
    expect(state.phase).toBe("pending");
    expect(liftsAsShot(state)).toBe(false);
    expect(advance(state, HOLD_MS - 1).phase).toBe("pending");
  });

  it("becomes a shot when the press is held still", () => {
    const held = advance(press({ x: 100, y: 100 }, 0), HOLD_MS);
    expect(held.phase).toBe("pulling");
    expect(liftsAsShot(held)).toBe(true);
    // The origin is the centre the pull is measured from, so the shot starts at zero power.
    expect(held.origin).toEqual({ x: 100, y: 100 });
  });

  it("becomes a pan when the finger travels past the slop first, and drags the world the other way", () => {
    const start = press({ x: 100, y: 100 }, 0);
    const small = drag(start, { x: 100 + HOLD_SLOP_PX, y: 100 });
    expect(small.state.phase).toBe("pending");
    expect(small.pan).toBeNull();

    const far = drag(start, { x: 100 + HOLD_SLOP_PX + 20, y: 100 });
    expect(far.state.phase).toBe("panning");
    // A finger moving right shows what is to the left: the window slides the opposite way.
    expect(far.pan?.dx).toBeLessThan(0);
    expect(far.pan?.dy).toBe(0);

    // Once panning, the hold timer no longer matters — this press will never fire.
    const ticked = advance(far.state, HOLD_MS * 4);
    expect(ticked.phase).toBe("panning");
    expect(liftsAsShot(ticked)).toBe(false);
  });

  it("delivers a pan as a delta per move, not from the origin every time", () => {
    const panning = drag(press({ x: 100, y: 100 }, 0), { x: 140, y: 100 }).state;
    const step = drag(panning, { x: 150, y: 110 });
    expect(step.state.phase).toBe("panning");
    expect(step.pan).toEqual({ dx: -10, dy: -10 });
  });

  it("never pans once the shot is armed: the finger is aiming", () => {
    const armed = advance(press({ x: 100, y: 100 }, 0), HOLD_MS);
    const aiming = drag(armed, { x: 300, y: 40 });
    expect(aiming.pan).toBeNull();
    expect(aiming.state.phase).toBe("pulling");
  });

  it("clears completely when the finger lifts", () => {
    expect(lift()).toBe(IDLE);
    expect(liftsAsShot(lift())).toBe(false);
  });
});
