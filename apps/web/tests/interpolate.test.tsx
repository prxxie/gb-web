// @vitest-environment jsdom
/**
 * Interpolation between two snapshots (`US-MATCH-001` AC2).
 *
 * The screen draws at 60 Hz while the state arrives in bursts; without a blend the mobiles teleport, and a
 * player cannot judge a shot. The rule the criterion asks for is narrow and worth pinning down: a unit
 * travels the segment between the pose it was drawn at and the newest state, never jumps back to an older
 * place, never leaves that segment, and nothing that is not a position is blended.
 */
import { describe, expect, it } from "vitest";
import { createMatch, type MatchState, type PlayerState } from "@gbw/core";
import {
  INTERPOLATION_MS,
  WRECK_ALPHA,
  clampProgress,
  poseOf,
  poseOfFrames,
  unitFrames,
  unitLook,
} from "../src/game/interpolate";

const NOW = 1_700_000_000_000;

function match(): MatchState {
  return createMatch({
    matchId: "m-1",
    roomCode: "ABC234",
    seed: 42,
    mode: "solo",
    mapId: "map-01",
    seats: [
      { slot: 0, team: "A", accountId: "acc-a", displayName: "A", mobileId: "mbl-01" },
      { slot: 1, team: "B", accountId: "acc-b", displayName: "B", mobileId: "mbl-02" },
    ],
    now: NOW,
  });
}

/** One snapshot where slot 0 sat down and slot 1 has not moved yet. */
function before(): MatchState {
  const state = match();
  return {
    ...state,
    players: state.players.map((player) =>
      player.slot === 0
        ? { ...player, x: 100, y: 600, hp: 100, facing: 1, eliminated: false }
        : { ...player, x: 1800, y: 600, hp: 100, facing: -1, eliminated: false },
    ),
  };
}

function after(patches: Readonly<Record<number, Partial<PlayerState>>>): MatchState {
  const state = before();
  return { ...state, players: state.players.map((player) => ({ ...player, ...(patches[player.slot] ?? {}) })) };
}

function framesOf(from: MatchState | null, to: MatchState, progress: number) {
  return unitFrames(from === null ? null : poseOf(from), to, progress);
}

function frameOf(from: MatchState | null, to: MatchState, progress: number, slot: number) {
  const frame = framesOf(from, to, progress).find((candidate) => candidate.slot === slot);
  if (!frame) throw new Error(`no frame for slot ${slot}`);
  return frame;
}

describe("TC-MATCH-924: the screen blends two snapshots instead of jumping (US-MATCH-001 AC2)", () => {
  it("draws one snapshot behind the newest state", () => {
    expect(INTERPOLATION_MS).toBe(100);
  });

  it("puts a unit halfway along the segment at half the interval", () => {
    const end = after({ 0: { x: 300 } });
    expect(frameOf(before(), end, 0, 0).x).toBe(100);
    expect(frameOf(before(), end, 0.5, 0).x).toBe(200);
    expect(frameOf(before(), end, 1, 0).x).toBe(300);
  });

  it("never moves a unit backwards or off its segment as the progress grows", () => {
    const end = after({ 0: { x: 300, y: 660 } });
    const steps = Array.from({ length: 21 }, (_unused, index) => frameOf(before(), end, index / 20, 0));
    for (let index = 1; index < steps.length; index += 1) {
      const previous = steps[index - 1]!;
      const current = steps[index]!;
      expect(current.x).toBeGreaterThanOrEqual(previous.x);
      expect(current.y).toBeGreaterThanOrEqual(previous.y);
    }
    for (const step of steps) {
      expect(step.x).toBeGreaterThanOrEqual(100);
      expect(step.x).toBeLessThanOrEqual(300);
      expect(step.y).toBeGreaterThanOrEqual(600);
      expect(step.y).toBeLessThanOrEqual(660);
    }
  });

  it("stays inside the segment when the unit travels backwards", () => {
    const end = after({ 0: { x: 40 } });
    const steps = Array.from({ length: 21 }, (_unused, index) => frameOf(before(), end, index / 20, 0));
    for (let index = 1; index < steps.length; index += 1) {
      expect(steps[index]!.x).toBeLessThanOrEqual(steps[index - 1]!.x);
    }
    expect(steps[0]!.x).toBe(100);
    expect(steps[20]!.x).toBe(40);
    expect(Math.min(...steps.map((step) => step.x))).toBe(40);
  });

  it("starts the next segment where the screen already is, so a state landing mid-blend does not jump", () => {
    const mid = after({ 0: { x: 300 } });
    // Halfway to x=300 the screen is at x=200. A new state arrives that puts the unit at 340.
    const drawn = framesOf(before(), mid, 0.5);
    const restart = poseOfFrames(drawn);
    const next = after({ 0: { x: 340 } });
    const resumed = unitFrames(restart, next, 0).find((frame) => frame.slot === 0);
    expect(resumed?.x).toBe(200);
    expect(unitFrames(restart, next, 1).find((frame) => frame.slot === 0)?.x).toBe(340);
  });

  it("takes hp, facing and elimination from the newest snapshot, never a blend", () => {
    const end = after({ 0: { hp: 40, facing: -1 } });
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      const frame = frameOf(before(), end, progress, 0);
      expect(frame.hp).toBe(40);
      expect(frame.facing).toBe(-1);
      expect(frame.eliminated).toBe(false);
    }
  });

  it("draws a unit eliminated in the newest snapshot where it died, not sliding into place", () => {
    const end = after({ 0: { x: 140, eliminated: true, hp: 0 } });
    expect(frameOf(before(), end, 0.2, 0).x).toBe(140);
    expect(frameOf(before(), end, 0.2, 0).eliminated).toBe(true);
  });

  it("keeps a mobile that is already eliminated out of the pose, so it never travels again (AC6)", () => {
    const dead = after({ 0: { x: 140, eliminated: true, hp: 0 } });
    expect(poseOf(dead).some((pose) => pose.slot === 0)).toBe(false);
    expect(frameOf(dead, after({ 0: { x: 900 } }), 0.5, 0).x).toBe(900);
  });

  it("has no path to travel on the first frame, so it mounts at the state it was given", () => {
    const end = after({ 0: { x: 300 } });
    expect(frameOf(null, end, 0.25, 0).x).toBe(300);
  });

  it("clamps progress to the segment it was given", () => {
    expect(clampProgress(-3)).toBe(0);
    expect(clampProgress(9)).toBe(1);
    expect(clampProgress(Number.NaN)).toBe(1);
    const end = after({ 0: { x: 300 } });
    expect(frameOf(before(), end, -3, 0).x).toBe(100);
    expect(frameOf(before(), end, 9, 0).x).toBe(300);
  });

  it("fades an eliminated unit and leaves every other one opaque (AC6)", () => {
    expect(unitLook({ slot: 0, x: 0, y: 0, hp: 0, facing: 1, eliminated: true })).toEqual({
      kind: "wreck",
      alpha: WRECK_ALPHA,
    });
    expect(unitLook({ slot: 0, x: 0, y: 0, hp: 100, facing: 1, eliminated: false })).toEqual({
      kind: "mobile",
      alpha: 1,
    });
  });

  it("draws one frame per mobile, in roster order", () => {
    const frames = framesOf(before(), after({ 1: { x: 1700 } }), 0.5);
    expect(frames.map((frame) => frame.slot)).toEqual([0, 1]);
  });
});
