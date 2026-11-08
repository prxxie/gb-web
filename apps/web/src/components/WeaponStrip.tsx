/**
 * Weapon strip (`US-MATCH-005` AC1–AC3).
 *
 * Three buttons: shot 1, shot 2 and the mobile's single super shot. The active one carries
 * `aria-pressed`, which is also what the tests read — the selection is local aim state, the shot
 * itself is still resolved by `@gbw/core` when it is sent.
 *
 * `charges` is the remaining count per slot (`0` = unusable, so the button is disabled). Shots 1 and
 * 2 are unlimited and pass `1`; the super shot passes `1` while its gauge is full, `0` while it charges.
 */
import type { Weapon } from "@gbw/core";
import type { JSX } from "react";

export type WeaponSlot = 0 | 1 | 2;

export interface WeaponStripProps {
  readonly weapons: readonly Weapon[];
  readonly active: WeaponSlot;
  readonly charges: readonly number[];
  readonly names: readonly [string, string, string];
  readonly chargeLabels: readonly [string, string, string];
  readonly label: string;
  /** Not this player's turn, or the selection is locked for the turn. */
  readonly disabled?: boolean;
  readonly onSelect: (slot: WeaponSlot) => void;
}

/** The three slots as the player names them. */
const SLOT_KEY = ["S1", "S2", "SS"] as const;

const SLOTS: readonly WeaponSlot[] = [0, 1, 2];

/** A static glyph per shot class — no GunBound art (`OQ-18`). */
export function WeaponStrip({
  weapons,
  active,
  charges,
  names,
  chargeLabels,
  label,
  disabled = false,
  onSelect,
}: WeaponStripProps): JSX.Element {
  return (
    <div className="weapon-strip" role="group" aria-label={label}>
      {SLOTS.map((slot) => {
        const weapon = weapons[slot];
        if (!weapon) return null;
        const usable = (charges[slot] ?? 0) > 0;
        const selected = slot === active;
        return (
          <button
            key={slot}
            type="button"
            className={`weapon-strip__slot${selected ? " weapon-strip__slot--active" : ""}`}
            data-slot={slot}
            data-testid={`weapon-${slot}`}
            data-weapon-class={weapon.shotClass}
            aria-pressed={selected}
            aria-label={`${names[slot]} — ${weapon.name} (${chargeLabels[slot]})`}
            disabled={disabled || !usable}
            onClick={() => onSelect(slot)}
          >
            {/* The slot is named, not described: S1 / S2 / SS, the genre's own shorthand. The icon and the "ready"
                badge were two more things to read in a bar that has to fit six groups (owner's layout, 2026-11-08). */}
            <span className="weapon-strip__key" aria-hidden="true">
              {SLOT_KEY[slot]}
            </span>
            {/* The name and the charge state are still announced, they are just not printed: the bar is six groups wide
                and "Đạn 1 · Sẵn sàng" was 90 px of it per slot (owner's layout, 2026-11-08). */}
            <span className="sr-only">{names[slot]}</span>
            <span className="sr-only" data-testid={`weapon-charge-${slot}`}>
              {chargeLabels[slot]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
