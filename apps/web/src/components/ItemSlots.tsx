/**
 * The six item slots a player brought into the match (owner's layout, 2026-11-08).
 *
 * A fixed row, not a tray that opens: the point of a loadout is that the player knows what is in slot 3 before the turn
 * starts, and a tap that first has to open a list costs a second of a turn clock. Empty slots keep their space so the row
 * never reflows when an item runs out.
 */
import type { JSX } from "react";

export const ITEM_SLOTS = 6;

export interface EquippedItem {
  readonly id: string;
  readonly qty: number;
  /** The turn-order delay the item costs, shown in the tooltip. */
  readonly delay: number;
  readonly name: string;
}

export interface ItemSlotsProps {
  readonly items: readonly EquippedItem[];
  readonly enabled: boolean;
  readonly label: string;
  readonly quantityLabel: string;
  readonly delayLabel: string;
  readonly onUse: (id: string) => void;
}

/** `itm-dual-plus` → `DU`: a glyph without an asset pipeline, and stable for the life of the id. */
function glyph(id: string): string {
  return id.replace(/^itm-/, "").slice(0, 2).toUpperCase();
}

export function ItemSlots({ items, enabled, label, quantityLabel, delayLabel, onUse }: ItemSlotsProps): JSX.Element {
  return (
    <div className="match__items" role="group" aria-label={label} data-testid="item-slots">
      {Array.from({ length: ITEM_SLOTS }, (_, index) => {
        const item = items[index];
        if (!item) {
          return <span key={index} className="match__item match__item--empty" data-testid={`item-slot-${index}`} />;
        }
        const usable = enabled && item.qty > 0;
        return (
          <button
            key={index}
            type="button"
            className={`match__item${usable ? "" : " match__item--spent"}`}
            data-testid={`item-${item.id}`}
            disabled={!usable}
            title={`${item.name} — ${quantityLabel}: ${item.qty}, ${delayLabel}: +${item.delay}`}
            aria-label={`${item.name} (${quantityLabel}: ${item.qty}, ${delayLabel}: +${item.delay})`}
            onClick={() => onUse(item.id)}
          >
            <span className="match__item-glyph" aria-hidden="true">
              {glyph(item.id)}
            </span>
            <span className="match__item-qty" data-testid={`item-qty-${item.id}`}>
              {item.qty}
            </span>
          </button>
        );
      })}
    </div>
  );
}
