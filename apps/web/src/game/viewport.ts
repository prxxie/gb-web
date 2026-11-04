/**
 * Gesture arbitration for the battlefield (`US-MATCH-002`, `US-MATCH-007`).
 *
 * Everything here is pure: it turns raw pointer events into one of three intents — pull (one finger),
 * pan (two fingers moving together) or zoom (two fingers spreading) — and never touches Phaser. That
 * keeps "what the player meant" testable without a browser, which is the same reason the rules engine
 * is separate (`NFR-22`).
 */
import { powerFromDrag, angleFromPull, pinchTo, panBy, type CameraWindow } from "@gbw/core";

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

export function safePointer(state: PointerState, index: number): Point | null {
  return state.pointers[index] ?? null;
}

/** What the current set of fingers means, given where the pull started and the previous spread. */
export function classify(
  state: PointerState,
  context: {
    readonly origin: Point | null;
    readonly facing: 1 | -1;
    readonly screenShorterEdge: number;
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
    const power = powerFromDrag(travelled, context.screenShorterEdge);
    const angle = angleFromPull(dx, dy, context.facing);
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
