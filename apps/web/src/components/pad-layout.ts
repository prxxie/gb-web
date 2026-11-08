/**
 * Where the four-way pad sits on a match screen (`US-MATCH-003` AC11).
 *
 * `docs/02-reference/screens/match.md` § 7 puts the pad **around** the active mobile, not in a corner: the ring is
 * 96 px from the hull and each button is 60 px. The renderer reports where the active mobile is on screen; this
 * module turns that point into a box position that never leaves the viewport, and returns `null` when there is no
 * point to hang the pad on — the stylesheet then falls back to the corner cluster.
 */
/** A CSS-pixel point; deliberately not the pointer `Point`, which carries a pointer id. */
export interface FocusPoint {
  readonly x: number;
  readonly y: number;
}

/** Button edge: the 44 px tap floor (`NFR-17`, `TC-FND-133`) — the pad is 140 px square, not 192, now that a finger can
 * pan the window and the pad only nudges the angle. */
export const PAD_BUTTON = 44;
/** Gap between buttons, from `screens/match.md` § 8 (`gaps ≥ 8 px`, drawn at 6 px inside the grid). */
export const PAD_GAP = 4;
/** Keep the pad this far from the viewport edge so a thumb does not fight the browser's back gesture. */
export const PAD_MARGIN = 8;

/** The three-by-three grid the four buttons live in. */
export const PAD_BOX = PAD_BUTTON * 3 + PAD_GAP * 2;

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface PadPlacement {
  /** Top-left of the 192 px box, in CSS pixels from the viewport corner. */
  readonly left: number;
  readonly top: number;
}

function clamp(value: number, low: number, high: number): number {
  if (high < low) return low;
  return Math.min(high, Math.max(low, value));
}

/**
 * Position the pad so its centre sits on `focus`, clamped so the whole box stays on screen.
 *
 * Returns `null` for a missing focus — the caller then keeps the corner layout.
 */
export function padLayout(focus: FocusPoint | null, viewport: ViewportSize): PadPlacement | null {
  if (!focus) return null;
  if (!Number.isFinite(focus.x) || !Number.isFinite(focus.y)) return null;
  const half = PAD_BOX / 2;
  const left = clamp(focus.x - half, PAD_MARGIN, viewport.width - PAD_MARGIN - PAD_BOX);
  const top = clamp(focus.y - half, PAD_MARGIN, viewport.height - PAD_MARGIN - PAD_BOX);
  return { left, top };
}
