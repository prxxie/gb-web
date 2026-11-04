import { TUNABLES, clamp, roundTo } from "./tuning.js";

/**
 * The camera and the ruler (`US-MATCH-007`).
 *
 * Kept out of Phaser so the zoom maths, the pan clamp and the ruler segmentation are unit-testable
 * and identical on both sides of the wire (`NFR-22`).
 */

export interface CameraWindow {
  /** Left edge in world units. */
  readonly x: number;
  /** Top edge in world units. */
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RulerLayout {
  readonly segments: number;
  /** World units per ruler division — constant while the window is the default or wider. */
  readonly unitsPerDivision: number;
  readonly labels: readonly number[];
}

/** Default window is half the map in each direction: 1,000 × 600 units. */
export function defaultWindow(aspect: number): CameraWindow {
  const width = TUNABLES.viewDefaultWidth;
  const height = Math.min(TUNABLES.viewDefaultHeight, width / aspect);
  return { x: (TUNABLES.mapWidth - width) / 2, y: (TUNABLES.mapHeight - height) / 2, width, height };
}

/** Zoom is expressed as a window width: 250 (closest) … 2,000 (whole map). */
export function windowFromZoom(zoomWidth: number, aspect: number, anchorX: number, anchorY: number): CameraWindow {
  const width = clamp(zoomWidth, TUNABLES.zoomMaxWidth, TUNABLES.mapWidth);
  const height = Math.min(TUNABLES.viewDefaultHeight, width / aspect);
  return clampWindow({ x: anchorX - width / 2, y: anchorY - height / 2, width, height });
}

export function zoomOf(window: CameraWindow): number {
  return roundTo(window.width);
}

export function clampWindow(window: CameraWindow): CameraWindow {
  const width = clamp(window.width, TUNABLES.zoomMaxWidth, TUNABLES.mapWidth);
  const height = Math.min(TUNABLES.viewDefaultHeight, width / Math.max(0.1, window.width / window.height));
  const x = clamp(window.x, 0, Math.max(0, TUNABLES.mapWidth - width));
  const y = clamp(window.y, 0, Math.max(0, TUNABLES.mapHeight - height));
  return { x: roundTo(x), y: roundTo(y), width: roundTo(width), height: roundTo(height) };
}

/** Two-finger pan: move by a screen delta converted to world units. */
export function panBy(window: CameraWindow, dxScreen: number, dyScreen: number, screenWidth: number): CameraWindow {
  const scale = window.width / Math.max(1, screenWidth);
  return clampWindow({ ...window, x: window.x - dxScreen * scale, y: window.y - dyScreen * scale });
}

/** Pinch: `factor` > 1 zooms in (smaller window). */
export function pinchTo(window: CameraWindow, factor: number, anchorX: number, anchorY: number): CameraWindow {
  const width = clamp(window.width / Math.max(0.2, factor), TUNABLES.zoomMaxWidth, TUNABLES.mapWidth);
  const ratioX = window.width === 0 ? 0.5 : (anchorX - window.x) / window.width;
  const ratioY = window.height === 0 ? 0.5 : (anchorY - window.y) / window.height;
  const height = Math.min(TUNABLES.viewDefaultHeight, width * (window.height / window.width));
  return clampWindow({ x: anchorX - ratioX * width, y: anchorY - ratioY * height, width, height });
}

/**
 * Ruler divisions: eight while the window is the default 1,000 units wide, sixteen at the whole map.
 * Every division is the same 125 world units at both ends, so a player's learned "one tick" never changes.
 */
export function rulerLayout(window: CameraWindow): RulerLayout {
  const segments = clamp(Math.round((8 * window.width) / TUNABLES.viewDefaultWidth), 8, 16);
  const unitsPerDivision = roundTo(window.width / segments);
  const labels: number[] = [];
  for (let i = 0; i <= segments; i += 1) labels.push(roundTo(i * unitsPerDivision));
  return { segments, unitsPerDivision, labels };
}

/** One-finger pull: drag distance as a fraction of the shorter screen edge, 0…4 power. */
export function powerFromDrag(dragDistance: number, shorterEdge: number): number {
  const fraction = clamp(dragDistance / Math.max(1, shorterEdge * TUNABLES.powerDragFullRatio), 0, 1);
  return roundTo(fraction * TUNABLES.powerBarMax);
}

/** Power 0…4 to the force 0…100 the integrator uses. */
export function forceFromPower(power: number): number {
  return clamp(Math.round(power * 25), 0, 100);
}

/** Aim angle from a pull vector in screen space; the segment comes from the mobile's own window. */
export function angleFromPull(dx: number, dy: number, facing: -1 | 1): number {
  const raw = (Math.atan2(-dy, dx * facing) * 180) / Math.PI;
  return roundTo(clamp(raw, -90, 90));
}

/** Ring radius for the power gradient, in screen pixels (constant on screen, not in world units). */
export function powerRingRadius(power: number): number {
  return roundTo(TUNABLES.powerRingMinPx + (TUNABLES.powerRingMaxPx - TUNABLES.powerRingMinPx) * (power / TUNABLES.powerBarMax));
}
