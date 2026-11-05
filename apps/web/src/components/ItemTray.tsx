/**
 * Item tray (`US-MATCH-005` AC4–AC6).
 *
 * The list is what the player still owns in the match state, so a quantity that reached `0` stays
 * visible and disabled instead of disappearing — the same "no dead buttons" reading as the empty
 * state. Using an item closes the tray (AC5); the caller sends the `item` frame.
 *
 * Item names are the data rows of `data/items.md`, not UI copy, so they come from `ITEMS_BY_ID`
 * rather than the locale tables.
 */
import { useState } from "react";
import { ITEMS_BY_ID } from "@gbw/core";
import type { JSX } from "react";

export interface TrayItem {
  readonly id: string;
  readonly qty: number;
  readonly delay: number;
}

export interface ItemTrayLabels {
  readonly toggle: string;
  readonly empty: string;
  readonly quantity: string;
  readonly delay: string;
}

export interface ItemTrayProps {
  readonly items: readonly TrayItem[];
  readonly labels: ItemTrayLabels;
  /** Not this player's turn: the list stays readable, the buttons do nothing. */
  readonly enabled?: boolean;
  readonly onUse: (itemId: string) => void;
}

export function ItemTray({ items, labels, enabled = true, onUse }: ItemTrayProps): JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <div className="item-tray">
      <button
        type="button"
        className="item-tray__toggle"
        aria-expanded={open}
        data-testid="item-tray-toggle"
        onClick={() => setOpen((value) => !value)}
      >
        {labels.toggle}
      </button>
      {open ? (
        items.length === 0 ? (
          <p className="muted" role="status" data-testid="item-tray-empty">
            {labels.empty}
          </p>
        ) : (
          <ul className="item-tray__list">
            {items.map((item) => {
              const name = ITEMS_BY_ID.get(item.id)?.name ?? item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    data-testid={`item-${item.id}`}
                    disabled={!enabled || item.qty <= 0}
                    aria-label={`${name} (${labels.quantity}: ${item.qty}, ${labels.delay}: +${item.delay})`}
                    onClick={() => {
                      setOpen(false);
                      onUse(item.id);
                    }}
                  >
                    <span>{name}</span>
                    <span className="badge" data-testid={`item-qty-${item.id}`}>
                      ×{item.qty}
                    </span>
                    <span className="badge" title={labels.delay} data-testid={`item-delay-${item.id}`}>
                      +{item.delay}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </div>
  );
}
