/**
 * The frame the battlefield draws (`US-MATCH-001` AC2, AC6).
 *
 * The host steps the engine on demand and the screen draws at 60 Hz, so the scene keeps the pose it drew last and
 * blends from there toward the newest state over one assumed gap. Only positions are blended: `hp`, `facing` and
 * `eliminated` are facts about the newest state, and drawing a half-dead mobile or a barrel caught between two angles
 * would be a lie about the state the player is acting on.
 *
 * The blend starts from the *drawn* pose, not from the previous state: when a new state lands in the middle of a
 * segment, restarting from the old state would jump forward by however far the screen had already travelled.
 *
 * No Phaser here — the scene calls this and draws the answer, which keeps the blend testable without a canvas.
 */
import { TUNABLES, type MatchState } from "@gbw/core";

/** How far behind the newest state the scene draws, in milliseconds — one assumed engine tick. */
export const INTERPOLATION_MS = TUNABLES.interpolateMs;

/** An eliminated mobile is drawn as a faded wreck rather than removed (`US-MATCH-001` AC6). */
export const WRECK_ALPHA = 0.55;

/** Where one mobile was drawn: the only thing a blend needs to remember. */
export interface UnitPose {
  readonly slot: number;
  readonly x: number;
  readonly y: number;
}

export interface UnitFrame extends UnitPose {
  readonly hp: number;
  readonly facing: -1 | 1;
  readonly eliminated: boolean;
}

export type UnitLook = { readonly kind: "wreck" | "mobile"; readonly alpha: number };

/** Progress along the segment, clamped: a late or clock-skewed frame still draws a sane position. */
export function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 1;
  if (progress < 0) return 0;
  return progress > 1 ? 1 : progress;
}

function blend(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

/** The pose to blend from when nothing has been drawn yet. A dead mobile is not travelling anywhere. */
export function poseOf(state: MatchState): readonly UnitPose[] {
  return state.players
    .filter((player) => !player.eliminated)
    .map((player) => ({ slot: player.slot, x: player.x, y: player.y }));
}

/** The pose a drawn frame represents, ready to become the start of the next blend. */
export function poseOfFrames(frames: readonly UnitFrame[]): readonly UnitPose[] {
  return frames
    .filter((frame) => !frame.eliminated)
    .map((frame) => ({ slot: frame.slot, x: frame.x, y: frame.y }));
}

/**
 * One frame per mobile in the newest state, in roster order.
 *
 * `from` is `null` on the first frame after a mount — there is no path to travel, so the units start where the state
 * says they are. A mobile that appears in the newest state only, or that was or is eliminated, snaps too: a
 * reinforcement must not slide in from nowhere, and a wreck must not slide into its grave.
 */
export function unitFrames(
  from: readonly UnitPose[] | null,
  to: MatchState,
  progress: number,
): readonly UnitFrame[] {
  const t = clampProgress(progress);
  const before = new Map((from ?? []).map((pose) => [pose.slot, pose]));
  return to.players.map((player) => {
    const was = before.get(player.slot);
    const travels = was !== undefined && !player.eliminated;
    return {
      slot: player.slot,
      x: travels ? blend(was.x, player.x, t) : player.x,
      y: travels ? blend(was.y, player.y, t) : player.y,
      hp: player.hp,
      facing: player.facing,
      eliminated: player.eliminated,
    };
  });
}

/** How the scene tints a mobile: the wreck is faded, the rest are opaque. */
export function unitLook(frame: UnitFrame): UnitLook {
  return frame.eliminated ? { kind: "wreck", alpha: WRECK_ALPHA } : { kind: "mobile", alpha: 1 };
}
