/**
 * Loadout picker (`US-ROOM-007` AC4–AC6, `items.md`).
 *
 * Eleven items in total, nine per page. The budget is the sum of the quantities, not the number of
 * distinct items, and the cap is applied here as well as on the server so the button that would break
 * it is the one that is disabled.
 */
import { useState } from "react";
import { ITEMS, LOADOUT_CAP, LOADOUT_PAGE_SIZE, loadoutTotal, type LoadoutEntry } from "@gbw/core";
import { useLocale } from "../app/providers";
import type { JSX } from "react";

export interface LoadoutPickerProps {
  readonly items: readonly LoadoutEntry[];
  readonly onChange: (items: readonly LoadoutEntry[]) => void;
}

export function LoadoutPicker({ items, onChange }: LoadoutPickerProps): JSX.Element {
  const { t } = useLocale();
  const [page, setPage] = useState(0);

  const quantities: Record<string, number> = {};
  for (const entry of items) quantities[entry.id] = (quantities[entry.id] ?? 0) + entry.qty;
  const total = loadoutTotal(quantities);
  const full = total >= LOADOUT_CAP;

  const bump = (id: string, delta: number): void => {
    // Copy first: the parent owns the array, and a mutated frame would be the same object on both sides.
    const next = items.map((entry) => ({ ...entry }));
    const index = next.findIndex((entry) => entry.id === id);
    const current = index === -1 ? null : next[index];
    if (!current) {
      if (delta > 0) next.push({ id, qty: delta });
      onChange(next);
      return;
    }
    const qty = (current.qty ?? 0) + delta;
    if (qty <= 0) next.splice(index, 1);
    else next[index] = { id, qty };
    onChange(next);
  };

  const pageCount = Math.max(1, Math.ceil(ITEMS.length / LOADOUT_PAGE_SIZE));
  const start = page * LOADOUT_PAGE_SIZE;
  const visible = ITEMS.slice(start, start + LOADOUT_PAGE_SIZE);

  return (
    <section className="card" data-testid="loadout-picker" aria-labelledby="loadout-title">
      <h2 id="loadout-title">{t("lobby.loadout")}</h2>
      <p className="muted" data-testid="loadout-count">
        {t("lobby.loadout.count", { count: total, cap: LOADOUT_CAP })}
      </p>
      <div className="loadout__pages">
        {Array.from({ length: pageCount }, (_, index) => (
          <div
            key={index}
            className="loadout__page"
            data-testid={`loadout-page-${index}`}
            hidden={index !== page}
          >
            {index === page
              ? visible.map((item) => {
                  const qty = quantities[item.itemId] ?? 0;
                  return (
                    <div
                      key={item.itemId}
                      className={qty > 0 ? "loadout__cell loadout__cell--picked" : "loadout__cell"}
                      data-testid={`loadout-item-${item.itemId}`}
                    >
                      <span className="loadout__cell-name">{t(`item.${item.itemId}`)}</span>
                      <span className="loadout__cell-meta">
                        {t("lobby.loadout.meta", { qty, delay: item.delayCost })}
                      </span>
                      <div className="row">
                        <button
                          type="button"
                          className="ghost"
                          aria-label={t("lobby.loadout.add", { item: t(`item.${item.itemId}`) })}
                          disabled={full}
                          onClick={() => bump(item.itemId, 1)}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          aria-label={t("lobby.loadout.remove", { item: t(`item.${item.itemId}`) })}
                          disabled={qty === 0}
                          onClick={() => bump(item.itemId, -1)}
                        >
                          −
                        </button>
                      </div>
                    </div>
                  );
                })
              : null}
          </div>
        ))}
      </div>
      <div className="row">
        {page > 0 ? (
          <button type="button" className="ghost" onClick={() => setPage(page - 1)}>
            ‹ {t("lobby.loadout.prev")}
          </button>
        ) : null}
        {page + 1 < pageCount ? (
          <button type="button" className="ghost" onClick={() => setPage(page + 1)}>
            {t("lobby.loadout.next")} ›
          </button>
        ) : null}
      </div>
      {full ? <p className="muted">{t("lobby.loadout.cap", { cap: LOADOUT_CAP })}</p> : null}
    </section>
  );
}
