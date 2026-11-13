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
/**
 * The opening view: half the map wide, half the map tall, **anchored to the ground line**.
 *
 * Centring vertically would frame empty sky and cut the terrain off — the ground band sits at the
 * bottom of the map, so the window sits on the bottom edge (`docs/02-reference/gameplay/tunables.md` § 9).
 */
/** A window is drawn from an aspect the canvas reports; a canvas that reports nothing must not make it `NaN`. */
function safeAspect(aspect: number): number {
  return Number.isFinite(aspect) ? Math.max(0.1, aspect) : TUNABLES.viewDefaultWidth / TUNABLES.viewDefaultHeight;
}

export function defaultWindow(aspect: number): CameraWindow {
  // One screen is the whole information budget (`US-BAL-002`): the width is fixed and the canvas aspect buys height,
  // never width, so two phones with different screens play the same game.
  return windowOnOneScreen(TUNABLES.mapWidth / 2, aspect);
}

/** How far below the target's feet the frame extends, as a fraction of the window height. */
const GROUND_MARGIN = 0.3;

/**
 * The frame that shows **exactly one screen** (`US-BAL-002` AC1).
 *
 * The width is the information budget and it is not negotiable: 800 units, eight parts of 100 (`US-BAL-001`). The canvas
 * aspect buys **height**, never width, because a wider phone seeing more of the map would make range untransferable
 * between devices — the opposite of what the ruler is for. A canvas taller than the map (a portrait window, which the
 * orientation gate refuses anyway) falls back to the map's height and takes the width it can.
 *
 * The frame is anchored just under the target's feet: the ground band sits at the bottom of the map, and framing it
 * vertically centred would spend half the screen on empty sky (`docs/02-reference/screens/match.md` § Camera and zoom).
 */
export function windowOnOneScreen(
  targetX: number,
  aspect: number,
  groundY: number = TUNABLES.mapHeight,
): CameraWindow {
  const safe = safeAspect(aspect);
  let width = Math.min(TUNABLES.manWidth, TUNABLES.mapWidth);
  let height = width / safe;
  if (height > TUNABLES.mapHeight) {
    height = TUNABLES.mapHeight;
    width = Math.min(TUNABLES.mapWidth, height * safe);
  }
  const bottom = Math.min(TUNABLES.mapHeight, groundY + height * GROUND_MARGIN);
  return clampWindow({ x: targetX - width / 2, y: bottom - height, width, height });
}

/** Follow a player on one screen. Kept as the name the renderer and the tests already use. */
export function windowOn(
  targetX: number,
  aspect: number,
  groundY: number = TUNABLES.mapHeight,
): CameraWindow {
  return windowOnOneScreen(targetX, aspect, groundY);
}

/** The window a measure zoom opens to: the whole map, so a player can count parts to the far edge (`US-BAL-002` AC3). */
export function windowMeasuring(aspect: number, anchorX: number = TUNABLES.mapWidth / 2): CameraWindow {
  const safe = safeAspect(aspect);
  const width = TUNABLES.mapWidth;
  const height = Math.min(TUNABLES.mapHeight, width / safe);
  const bottom = Math.min(TUNABLES.mapHeight, TUNABLES.mapHeight);
  return clampWindow({ x: anchorX - width / 2, y: bottom - height, width, height });
}

/** Whether a window is still showing one screen, or has been opened up to measure (`US-BAL-002` AC4). */
export function isMeasuring(window: CameraWindow, tolerance: number = 1.05): boolean {
  return window.width > TUNABLES.manWidth * tolerance;
}

/** A distance in parts of a screen, which is the unit the game is spoken in (`US-BAL-001`). */
export function partsOf(units: number): number {
  return roundTo(units / TUNABLES.partWidth);
}

/** The inverse of `partsOf`, for a number a player typed. */
export function unitsOf(parts: number): number {
  return roundTo(parts * TUNABLES.partWidth);
}

/** `1.2 phần` — one decimal, no `-0.0`, because the HUD prints it verbatim. */
export function formatParts(units: number): string {
  const parts = Math.round(partsOf(units) * 10) / 10;
  const safe = Object.is(parts, -0) ? 0 : parts;
  return `${safe < 0 ? "-" : ""}${Math.abs(safe).toFixed(1)} phần`;
}

/** Zoom is expressed as a window width: 250 (closest) … 2,000 (whole map). */
export function windowFromZoom(zoomWidth: number, aspect: number, anchorX: number, anchorY: number): CameraWindow {
  const width = clamp(zoomWidth, TUNABLES.zoomMaxWidth, TUNABLES.mapWidth);
  const height = clamp(width / aspect, TUNABLES.zoomMaxHeight, TUNABLES.mapHeight);
  return clampWindow({ x: anchorX - width / 2, y: anchorY - height / 2, width, height });
}

export function zoomOf(window: CameraWindow): number {
  return roundTo(window.width);
}

export function clampWindow(window: CameraWindow): CameraWindow {
  const aspect = Math.max(0.1, window.width / Math.max(1, window.height));
  const width = clamp(window.width, TUNABLES.zoomMaxWidth, TUNABLES.mapWidth);
  // Zooming all the way out shows the whole map, so the height is bounded by the map, not by the
  // default view — capping it at 600 made `zoomMin` unreachable (`TC-MATCH-919`).
  const height = clamp(width / aspect, TUNABLES.zoomMaxHeight, TUNABLES.mapHeight);
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
  // The window keeps its aspect while zooming, so the height follows the width all the way out to the map.
  const height = clamp(width * (window.height / window.width), TUNABLES.zoomMaxHeight, TUNABLES.mapHeight);
  return clampWindow({ x: anchorX - ratioX * width, y: anchorY - ratioY * height, width, height });
}

/**
 * Ruler divisions: **one division is always one part** (`US-BAL-001` AC2) — 100 units — so a tick a player learned at one
 * screen is the same tick at the whole map. The count follows the window: 8 across one screen, 20 at 2.5 màn.
 */
export function rulerLayout(window: CameraWindow): RulerLayout {
  const segments = clamp(Math.round(window.width / TUNABLES.partWidth), TUNABLES.partsPerMan, TUNABLES.partsPerMan * 3);
  const unitsPerDivision = TUNABLES.partWidth;
  // The label is the part's **number on the map**, so a tick a player learned in one match still means the same distance
  // in the next one, at any zoom (`US-BAL-001` AC2).
  const first = Math.round(window.x / TUNABLES.partWidth);
  const labels: number[] = [];
  for (let i = 0; i <= segments; i += 1) labels.push(roundTo(first + i));
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
/**
 * The ring is a **fixed** screen radius: a ring that grew with power would change the pixels-per-unit the
 * player has just learned from the ruler, and the number inside it would shrink (`US-MATCH-002` §4).
 */
export function powerRingRadius(power: number): number {
  void power;
  return TUNABLES.powerRingRadiusPx;
}
