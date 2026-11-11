/**
 * Gesture arbitration for the battlefield (`US-MATCH-002`, `US-MATCH-007`).
 *
 * Everything here is pure: it turns raw pointer events into one of three intents — pull (one finger),
 * pan (two fingers moving together) or zoom (two fingers spreading) — and never touches Phaser. That
 * keeps "what the player meant" testable without a browser, which is the same reason the rules engine
 * is separate (`NFR-22`).
 */
import { powerFromDrag, angleFromPull, pinchTo, panBy, type CameraWindow } from "@gbw/core";

/** Vertical travel that turns the barrel one degree: 180 px of drag sweeps 45°, a comfortable thumb arc. */
export const ANGLE_DEG_PER_PX = 0.25;

export interface Point {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

export interface PointerState {
  readonly pointers: readonly Point[];
}

export type Gesture =
  | { readonly kind: "none" }
  | { readonly kind: "pull"; readonly power: number; readonly angle: number; readonly distance: number }
  | { readonly kind: "pan"; readonly dx: number; readonly dy: number }
  | { readonly kind: "zoom"; readonly scale: number };

const empty: Point[] = [];

export function addPointer(state: PointerState, point: Point): PointerState {
  const existing = state.pointers.findIndex((candidate) => candidate.id === point.id);
  const pointers = existing >= 0
    ? state.pointers.map((candidate) => (candidate.id === point.id ? point : candidate))
    : [...state.pointers, point];
  return { pointers };
}

export function movePointer(state: PointerState, point: Point): PointerState {
  return addPointer(state, point);
}

export function removePointer(state: PointerState, id: number): PointerState {
  return { pointers: state.pointers.filter((candidate) => candidate.id !== id) };
}

export function clearPointers(): PointerState {
  return { pointers: empty };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * The angle a pull rotates from.
 *
 * `classify` measures `dy` from the point the finger went down, so it has to be given the angle the barrel had *then*.
 * Feeding it the current barrel angle — which is what `interpret` used to do — re-applies the whole travel on every
 * `pointermove`: a 60 px drag rotated the barrel from 45° to −10° (55°) across twelve events instead of the 15° the
 * constant promises, and the same physical gesture gave a different angle on a device that reported more events. Latch it
 * when the gesture arms, and leave it alone until the finger lifts.
 */
export function pullBaseAngle(pressAngle: number | null, barrelAngle: number): number {
  return pressAngle ?? barrelAngle;
}

export function safePointer(state: PointerState, index: number): Point | null {
  return state.pointers[index] ?? null;
}

/** What the current set of fingers means, given where the pull started and the previous spread. */
export function classify(
  state: PointerState,
  context: {
    readonly origin: Point | null;
    readonly facing: 1 | -1;
    /**
     * How far a finger must travel for full power. Width-based, not the shorter edge: at 844×390 the shorter edge made
     * full power a 175 px throw, so the aimed band lived in the first third of the gesture and every pull read as "max".
     */
    readonly fullPowerDistance: number;
    /**
     * The angle the barrel already had — the previous shot's angle, so the barrel stays where it was left. A held
     * gesture *rotates* it: drag up to raise the barrel, down to lower it (`ANGLE_DEG_PER_PX`). Power comes from the
     * forward travel alone, so pulling further right never changes the angle and raising the barrel never adds power.
     */
    readonly baseAngle: number;
    readonly previousSpread: number | null;
  },
): Gesture {
  const [first, second] = state.pointers;
  if (!first) return { kind: "none" };
  if (!second) {
    if (!context.origin) return { kind: "none" };
    const dx = first.x - context.origin.x;
    const dy = first.y - context.origin.y;
    const travelled = Math.hypot(dx, dy);
    // The two axes are independent: power is how far the finger travelled *sideways* from the touch centre, and the
    // angle is how far it travelled up or down. Sideways is unsigned on purpose — half the roster faces left, and a
    // player dragging towards their own barrel must still get power (the engine aims away from the hull regardless).
    const power = powerFromDrag(Math.abs(dx), context.fullPowerDistance);
    // Up is negative in screen space, so subtracting dy raises the barrel.
    const angle = context.baseAngle - dy * ANGLE_DEG_PER_PX;
    return { kind: "pull", power, angle, distance: travelled };
  }
  const spread = distance(first, second);
  if (context.previousSpread && Math.abs(spread - context.previousSpread) >= 12) {
    return { kind: "zoom", scale: spread / context.previousSpread };
  }
  const mid = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
  const previousMid = context.origin ?? mid;
  return { kind: "pan", dx: mid.x - previousMid.x, dy: mid.y - previousMid.y };
}

/**
 * The most device pixels per CSS pixel the battlefield renders at (`US-MATCH-011`).
 *
 * A 2.6-ratio phone draws at 2 rather than 3 for the same reason a desktop browser caps it: the canvas costs area, and a
 * 2.6x raster is ~7x the pixels of 1x for a difference the eye does not resolve on a 6-inch screen.
 */
export const MAX_RENDER_SCALE = 2;

/**
 * How many device pixels one CSS pixel of battlefield is worth.
 *
 * The game size is the device-pixel size and the canvas is styled back down to its parent (`scale.zoom`), which is what
 * makes the difference between vector art drawn at the screen's real resolution and the same art rasterised at 1x and
 * stretched by the compositor — the aliasing the owner reported as "răng cưa" on production.
 */
export function renderScaleFor(devicePixelRatio: number | undefined): number {
  const ratio = typeof devicePixelRatio === "number" && Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1;
  return Math.min(Math.max(ratio, 1), MAX_RENDER_SCALE);
}

export interface Viewport {
  /** Screen pixels per world unit. */
  readonly scale: number;
  readonly width: number;
  readonly height: number;
}

export function viewportFor(window: CameraWindow, screenWidth: number, screenHeight: number): Viewport {
  const scale = screenWidth / window.width;
  return { scale, width: screenWidth, height: screenHeight };
}

export function worldToScreen(window: CameraWindow, viewport: Viewport, x: number, y: number): Point {
  const zoomedWidth = window.width * viewport.scale;
  const zoomedHeight = window.height * viewport.scale;
  const originX = (viewport.width - zoomedWidth) / 2;
  const originY = (viewport.height - zoomedHeight) / 2;
  return {
    id: 0,
    x: originX + (x - window.x) * viewport.scale,
    y: originY + (y - window.y) * viewport.scale,
  };
}

export function screenToWorld(window: CameraWindow, viewport: Viewport, x: number, y: number): Point {
  const zoomedWidth = window.width * viewport.scale;
  const zoomedHeight = window.height * viewport.scale;
  const originX = (viewport.width - zoomedWidth) / 2;
  const originY = (viewport.height - zoomedHeight) / 2;
  return {
    id: 0,
    x: window.x + (x - originX) / viewport.scale,
    y: window.y + (y - originY) / viewport.scale,
  };
}

export { angleFromPull, panBy, pinchTo, powerFromDrag };

/**
 * A length that must read the same number of CSS pixels at any zoom (`US-MATCH-007` AC6): the scene draws in world
 * units, so a fixed 64 px ring is `64 / scale` world units. Guards a degenerate scale instead of returning `Infinity`.
 */
export function screenConstant(pixels: number, scale: number): number {
  return pixels / (Number.isFinite(scale) && scale > 0 ? scale : 1);
}
