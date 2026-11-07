/**
 * From a finger to a fire input (`US-MATCH-002`).
 *
 * The scene owns the gesture and the ring; this module owns the two decisions that have to be provable without a
 * browser: whether the client may aim at all right now (`canAim`), and what exactly goes on the wire when a finger
 * lifts (`fireFromPull`) — once, with the angle clamped to the mobile's own window and the force on the integrator's
 * 0–100 scale.
 */
import { TUNABLES } from "@gbw/core";
import type { FireInput, MatchState, Mobile } from "@gbw/core";

/** A release below this power cancels instead of firing (`screens/match.md` § 7, `OQ-38`). */
export const DEADZONE_POWER = TUNABLES.powerDeadzone;

/** The wire carries `force`, never the float: `round(power × 25)`, clamped to the integrator's scale. */
export const FORCE_MAX = 100;

/** The ring keeps a fixed screen radius so the number never shrinks when the camera zooms out (`screens/match.md`). */
export const RING_RADIUS = 64;

/** Full power is a full circle; the arc starts at −90° and runs clockwise (`screens/match.md` § 4). */
export const RING_START = -Math.PI / 2;

/** How far the arc has run, in radians, for a power of 0–4. */
export function ringSweep(power: number): number {
  if (!Number.isFinite(power)) return 0;
  return Math.min(1, Math.max(0, power / 4)) * Math.PI * 2;
}

const AMBER = [0xff, 0xb0, 0x20] as const;
const RED = [0xff, 0x3b, 0x30] as const;

/** Amber at an empty pull, red at full power: the gradient the reference calls "amber to red". */
export function ringColor(power: number): number {
  const share = Number.isFinite(power) ? Math.min(1, Math.max(0, power / 4)) : 0;
  const channel = (index: 0 | 1 | 2): number =>
    Math.round(AMBER[index] + (RED[index] - AMBER[index]) * share);
  return (channel(0) << 16) | (channel(1) << 8) | channel(2);
}

export interface Pull {
  /** 0.0–4.0, the number the ring prints. */
  readonly power: number;
  /** Degrees from the pull vector, already mirrored for the mobile's facing. */
  readonly angle: number;
}

export interface FireContext {
  readonly slot: number;
  readonly weaponSlot: 0 | 1 | 2;
  readonly seq: number;
  /** The aiming mobile: its barrel window clamps the angle. */
  readonly mobile: Pick<Mobile, "angleMin" | "angleMax">;
  /** The up/down pad's offset from the gesture angle, applied before the clamp. */
  readonly aimDelta?: number;
  /**
   * The turn this client last fired in (`AC8`). A release in the same turn is dropped here as well as in the scene,
   * so a second shot cannot be produced by a stale callback.
   */
  readonly shot?: { readonly lockedTurn: number | null; readonly turnNumber: number } | undefined;
}

/** `round(power × 25)`, clamped to 0–100. */
export function forceFromPower(power: number): number {
  if (!Number.isFinite(power)) return 0;
  return Math.max(0, Math.min(FORCE_MAX, Math.round(power * 25)));
}

/**
 * The `fire` input for a released pull, or `null` when the finger never left the dead zone (`AC3`/`AC4`).
 *
 * Pure on purpose: the caller cannot send a shot that this function did not produce, so "exactly one `fire` per
 * release, carrying the angle and the active weapon slot" is a unit test rather than a browser observation.
 */
export function fireFromPull(pull: Pull, context: FireContext): FireInput | null {
  if (!Number.isFinite(pull.power) || pull.power < DEADZONE_POWER) return null;
  if (context.shot && context.shot.lockedTurn === context.shot.turnNumber) return null;
  const angle = Math.max(
    context.mobile.angleMin,
    Math.min(context.mobile.angleMax, Math.round(pull.angle + (context.aimDelta ?? 0))),
  );
  return {
    kind: "fire",
    slot: context.slot,
    weaponSlot: context.weaponSlot,
    angle,
    force: forceFromPower(pull.power),
    seq: context.seq,
  };
}

export interface AimContext {
  readonly status: MatchState["status"];
  readonly activeSlot: number;
  readonly localSlot: number;
  readonly eliminated: boolean;
  /** The turn number this client already fired in (`AC8`: a second fire waits for the turn to resolve). */
  readonly lockedTurn: number | null;
  readonly turnNumber: number;
}

/**
 * May this client aim right now? (`AC7`/`AC8`)
 *
 * Not in someone else's turn, not while the match is not playing, not when the local mobile is a wreck, and not twice
 * in one turn — the scene asks before drawing the ring and the page asks before reading a release.
 */
export function canAim(context: AimContext): boolean {
  if (context.status !== "playing") return false;
  if (context.eliminated) return false;
  if (context.activeSlot !== context.localSlot) return false;
  return context.lockedTurn !== context.turnNumber;
}
