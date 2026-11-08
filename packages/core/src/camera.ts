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
  // Height is the floor, width the consequence: a screen wider than 5:3 keeps its 600 units of height and
  // gains margin on both sides (`docs/02-reference/screens/match.md` § 5), it never loses the sky.
  const height = Math.min(TUNABLES.mapHeight, TUNABLES.viewDefaultHeight);
  const width = Math.min(TUNABLES.mapWidth, Math.max(TUNABLES.viewDefaultWidth, height * safeAspect(aspect)));
  return { x: (TUNABLES.mapWidth - width) / 2, y: TUNABLES.mapHeight - height, width, height };
}

/**
 * Follow a player: centre horizontally, keep the ground anchored (clamped inside the map).
 *
 * The window takes the screen's aspect: the height stays the documented 600 units and a screen wider than
 * 5:3 gains width. Fixing the width instead would crop the height on a landscape phone (844 × 313 is 2.7:1,
 * so 1,000 units of width show only ~371 of the 600) and push the shooter's feet off the canvas and under
 * the HUD — `TC-MATCH-918`.
 */
export function windowOn(
  targetX: number,
  aspect: number,
  groundY: number = TUNABLES.mapHeight,
): CameraWindow {
  const height = Math.min(TUNABLES.mapHeight, TUNABLES.viewDefaultHeight);
  const width = Math.min(TUNABLES.mapWidth, Math.max(TUNABLES.viewDefaultWidth, height * safeAspect(aspect)));
  // Anchor the frame just under the target's feet, so the mobile sits in the lower third with room to
  // lob upward, and the frame never scrolls past the map's ground line.
  const bottom = Math.min(TUNABLES.mapHeight, groundY + height * GROUND_MARGIN);
  return clampWindow({ x: targetX - width / 2, y: bottom - height, width, height });
}

/** How far below the target's feet the frame extends, as a fraction of the window height. */
const GROUND_MARGIN = 0.3;

/**
 * The frame that holds **both** mobiles a turn involves (`US-MATCH-007`).
 *
 * `windowOn` follows the shooter, which in a 1v1 on a 2,000-unit map puts the target 1,640 units away — off screen,
 * so the player aims at a number instead of at an opponent. This frames the pair instead: the width is the span
 * between them plus a margin on each side, the height keeps the 600 units of sky the screen reference asks for, and
 * `clampWindow` keeps the result inside the map and inside the zoom limits.
 */
export function windowOnBoth(
  firstX: number,
  secondX: number,
  aspect: number,
  groundY: number = TUNABLES.mapHeight,
): CameraWindow {
  const span = Math.abs(secondX - firstX);
  const margin = Math.max(TUNABLES.viewDefaultWidth * 0.18, span * 0.12);
  const height = Math.min(TUNABLES.mapHeight, TUNABLES.viewDefaultHeight);
  const width = Math.min(
    TUNABLES.mapWidth,
    Math.max(TUNABLES.viewDefaultWidth, height * safeAspect(aspect), span + margin * 2),
  );
  const centre = (firstX + secondX) / 2;
  const bottom = Math.min(TUNABLES.mapHeight, groundY + height * GROUND_MARGIN);
  return clampWindow({ x: centre - width / 2, y: bottom - height, width, height });
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
/**
 * The ring is a **fixed** screen radius: a ring that grew with power would change the pixels-per-unit the
 * player has just learned from the ruler, and the number inside it would shrink (`US-MATCH-002` §4).
 */
export function powerRingRadius(power: number): number {
  void power;
  return TUNABLES.powerRingRadiusPx;
}
