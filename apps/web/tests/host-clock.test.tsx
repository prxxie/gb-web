/**
 * Who advances the turn (`US-ROOM-004` AC3, AC7).
 *
 * `decideTurn` is the whole decision table: the host may advance anyone's turn, everyone may advance
 * their own expired one, and an absent player's turn is skipped rather than waited out.
 */
import { describe, expect, it } from "vitest";
import { decideTurn, type TurnAuthority } from "../src/net/host-clock";

const NOW = 1_700_000_000_000;

function authority(overrides: Partial<TurnAuthority> = {}): TurnAuthority {
  return {
    isHost: true,
    localSlot: 0,
    activeSlot: 1,
    deadlineAt: NOW + 5_000,
    absentSlots: [],
    now: NOW,
    ...overrides,
  };
}

describe("TC-ROOM-200: an absent player's turn is skipped, a present one is not (US-ROOM-004 AC3, AC7)", () => {
  it("skips a slot in grace immediately, without waiting out its clock", () => {
    // AC7: a 15 s cellular blip must not hold the match; the grace window itself is not the wait.
    expect(decideTurn(authority({ absentSlots: [1] }))).toEqual({ kind: "skip", reason: "absent" });
  });

  it("skips a slot the room already retired as disconnected", () => {
    // AC3: once the alarm fired, every following turn of that slot is skipped as well.
    expect(decideTurn(authority({ absentSlots: [1], deadlineAt: NOW + 60_000 }))).toEqual({
      kind: "skip",
      reason: "absent",
    });
  });

  it("leaves a present slot alone until its deadline", () => {
    expect(decideTurn(authority())).toEqual({ kind: "wait" });
  });

  it("advances an expired remote turn on the host, so a silent peer cannot freeze the match", () => {
    expect(decideTurn(authority({ deadlineAt: NOW - 1, absentSlots: [] }))).toEqual({ kind: "skip", reason: "clock" });
  });

  it("does not let a guest advance a remote turn", () => {
    expect(decideTurn(authority({ isHost: false, deadlineAt: NOW - 1 }))).toEqual({ kind: "wait" });
  });

  it("lets a guest advance its own expired turn when the host has gone away", () => {
    expect(decideTurn(authority({ isHost: false, localSlot: 1, activeSlot: 1, deadlineAt: NOW - 1 }))).toEqual({
      kind: "skip",
      reason: "clock",
    });
  });

  it("keeps waiting while the guest's own turn still has time on it", () => {
    expect(decideTurn(authority({ isHost: false, localSlot: 1, activeSlot: 1 }))).toEqual({ kind: "wait" });
  });
});
