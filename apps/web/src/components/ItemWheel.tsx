/**
 * The item wheel (owner's layout, 2026-11-09).
 *
 * The loadout left the bottom bar: it now fans out as a **half circle around the player's own mobile**, opened by pressing
 * and holding the mobile itself and closed by picking something or touching anywhere else. The reason is the same one that
 * moved the pad: a turn is spent looking at the mobile, so the things the mobile can use belong on it.
 *
 * Six slots always render, so the arc never reflows when an item runs out, and the arc is drawn **above** the anchor — the
 * lower half is the ground the mobile stands on.
 */
import type { JSX } from "react";
import { ITEM_SLOTS, type EquippedItem } from "./ItemSlots";

/** How far the slots sit from the mobile: 92 px clears the nameplate and stays inside a 390 px tall field. */
export const WHEEL_RADIUS = 92;

export interface ItemWheelProps {
  readonly items: readonly EquippedItem[];
  readonly enabled: boolean;
  /** Where the mobile is, in CSS pixels — the same point the power ring uses. */
  readonly at: { readonly x: number; readonly y: number };
  readonly label: string;
  readonly quantityLabel: string;
  readonly delayLabel: string;
  readonly onUse: (id: string) => void;
  readonly onClose: () => void;
}


/** Half a slot plus a breath: the margin a slot needs to stay fully on screen and fully tappable. */
const EDGE = 30;

/**
 * The angle of slot `index` of `count`, in degrees: a fan from 180° (left) to 0° (right), so slot 0 is the leftmost and the
 * arc sits above the mobile. Each slot owns a wedge and is drawn at the centre of it, which is what keeps the arc even for
 * any number of items.
 */
export function wheelAngle(index: number, count: number): number {
  const step = 180 / Math.max(1, count);
  return 180 - (index + 0.5) * step;
}

/** Screen position of a slot, y going down: the arc is mirrored about its centre's horizontal. */
export function wheelPoint(
  at: { readonly x: number; readonly y: number },
  angleDeg: number,
  radius = WHEEL_RADIUS,
): { readonly x: number; readonly y: number } {
  const radians = (angleDeg * Math.PI) / 180;
  return { x: at.x + Math.cos(radians) * radius, y: at.y - Math.sin(radians) * radius };
}

/**
 * Where the arc is centred: the hull, nudged so the whole half circle stays on screen.
 *
 * Measured in a real match: a hull at `x 76` with the arc centred on it put the leftmost wedge at `x −13` — half off screen.
 * Clamping each wedge separately stacked the two end slots on top of each other (both at `x 30`), and turning the fan
 * sideways ran its lower wedges into the ground line. Clamping the **centre** is what keeps six 44 px slots evenly spaced:
 * the arc shifts by at most half its width, and every wedge keeps its neighbour at the same distance.
 */
export function wheelCentre(
  at: { readonly x: number; readonly y: number },
  bounds: { readonly width: number; readonly height: number },
  radius = WHEEL_RADIUS,
): { readonly x: number; readonly y: number } {
  const clamp = (value: number, low: number, high: number): number =>
    Math.min(Math.max(value, low), Math.max(low, high));
  return {
    x: clamp(at.x, EDGE + radius, bounds.width - EDGE - radius),
    // The fan goes up, so only its top has to clear the strip; the hull itself may sit anywhere above the bar.
    y: clamp(at.y, EDGE + radius, bounds.height - EDGE),
  };
}

/** `itm-dual-plus` → `DU`: a glyph without an asset pipeline, and stable for the life of the id. */
function glyph(id: string): string {
  return id.replace(/^itm-/, "").slice(0, 2).toUpperCase();
}

export function ItemWheel({
  items,
  enabled,
  at,
  label,
  quantityLabel,
  delayLabel,
  onUse,
  onClose,
}: ItemWheelProps): JSX.Element {
  const bounds =
    typeof window === "undefined" ? undefined : { width: window.innerWidth, height: window.innerHeight };
  // The radius never shrinks: six 44 px slots need 92 px of radius before the arc's own length stops fitting them
  // (2·92·sin15° ≈ 47.6 px between neighbours). Space is bought by moving the arc, not by crowding it.
  const centre = bounds ? wheelCentre(at, bounds) : at;
  return (
    <div className="item-wheel" data-testid="item-wheel">
      {/* A press anywhere else closes the wheel (`owner`: "ẩn khi người chơi bấm ra chỗ khác"). The backdrop is the whole
          screen, so the very next tap is the one that dismisses it. */}
      <button
        type="button"
        className="item-wheel__scrim"
        data-testid="item-wheel-scrim"
        aria-label={label}
        onClick={onClose}
      />
      <div className="item-wheel__arc" role="group" aria-label={label}>
        {Array.from({ length: ITEM_SLOTS }, (_, index) => {
          const point = wheelPoint(centre, wheelAngle(index, ITEM_SLOTS), WHEEL_RADIUS);
          const item = items[index];
          if (!item) {
            return (
              <span
                key={index}
                className="item-wheel__slot item-wheel__slot--empty"
                data-testid={`item-slot-${index}`}
                style={{ left: point.x, top: point.y }}
              />
            );
          }
          const usable = enabled && item.qty > 0;
          return (
            <button
              key={index}
              type="button"
              className={`item-wheel__slot${usable ? "" : " item-wheel__slot--spent"}`}
              data-testid={`item-${item.id}`}
              disabled={!usable}
              style={{ left: point.x, top: point.y }}
              title={`${item.name} — ${quantityLabel}: ${item.qty}, ${delayLabel}: +${item.delay}`}
              aria-label={`${item.name} (${quantityLabel}: ${item.qty}, ${delayLabel}: +${item.delay})`}
              onClick={() => {
                onUse(item.id);
                onClose();
              }}
            >
              <span className="item-wheel__glyph" aria-hidden="true">
                {glyph(item.id)}
              </span>
              <span className="item-wheel__qty" data-testid={`item-qty-${item.id}`}>
                {item.qty}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
