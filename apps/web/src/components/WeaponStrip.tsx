/**
 * Weapon strip (`US-MATCH-005` AC1–AC3).
 *
 * Three buttons: shot 1, shot 2 and the mobile's single super shot. The active one carries
 * `aria-pressed`, which is also what the tests read — the selection is local aim state, the shot
 * itself is still resolved by `@gbw/core` when it is sent.
 *
 * `charges` is the remaining count per slot (`0` = unusable, so the button is disabled). Shots 1 and
 * 2 are unlimited and pass `1`; the super shot passes `1` until `superShotUsed`, then `0`.
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

const SLOTS: readonly WeaponSlot[] = [0, 1, 2];

/** A static glyph per shot class — no GunBound art (`OQ-18`). */
const GLYPH: Record<Weapon["shotClass"], string> = {
  arc: "⌒",
  flat: "→",
  lob: "◠",
  bounce: "⌁",
  cluster: "⁂",
  piercing: "⇢",
  beam: "≡",
};

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
            <span className="weapon-strip__icon" aria-hidden="true">
              {GLYPH[weapon.shotClass]}
            </span>
            <span>{names[slot]}</span>
            <span className="badge" data-testid={`weapon-charge-${slot}`}>
              {chargeLabels[slot]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
