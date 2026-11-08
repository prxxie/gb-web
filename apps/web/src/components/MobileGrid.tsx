/**
 * Mobile picker (`US-ROOM-007` AC7, `docs/02-reference/screens/lobby.md`).
 *
 * The roster is shown once, not once per team: every cell carries both team tints, so a player compares the
 * twenty stat lines as a list rather than a per-team split. Two members may pick the same mobile — nothing here
 * reserves one, and the room does not either.
 *
 * The grid holds no state of its own: what is pressed is the `mobileId` in the member record the room
 * broadcast, which is why the pick survives a reconnect.
 */
import { MOBILES } from "@gbw/core";
import { useLocale } from "../app/providers";
import type { JSX } from "react";

export interface MobileGridProps {
  /** The id in the member record; a pick that the room has not echoed yet shows as optimistic. */
  readonly chosen: string;
  readonly onPick: (mobileId: string) => void;
}

export function MobileGrid({ chosen, onPick }: MobileGridProps): JSX.Element {
  const { t } = useLocale();

  return (
    <section className="card" data-testid="mobile-grid" aria-labelledby="mobile-title">
      <h2 id="mobile-title">{t("lobby.mobile")}</h2>
      <p className="muted">{t("lobby.mobile.hint")}</p>
      <div className="mobile-grid">
        {MOBILES.map((mobile) => {
          const picked = mobile.mobileId === chosen;
          return (
            <button
              key={mobile.mobileId}
              type="button"
              className={picked ? "mobile-cell mobile-cell--picked" : "mobile-cell"}
              data-testid={`mobile-cell-${mobile.mobileId}`}
              aria-pressed={picked}
              onClick={() => {
                // Re-picking the stored mobile would charge the room a persist + broadcast for no change.
                if (!picked) onPick(mobile.mobileId);
              }}
            >
              {/* Both tints in every cell, tinted by CSS: the same mobile is available to either team. */}
              <span className="mobile__tints" aria-hidden="true">
                <span className="mobile__tint mobile__tint--a" data-testid={`mobile-tint-${mobile.mobileId}-A`} />
                <span className="mobile__tint mobile__tint--b" data-testid={`mobile-tint-${mobile.mobileId}-B`} />
              </span>
              <span className="mobile__name">{mobile.name}</span>
              <span className="mobile__stat">{t("lobby.mobile.hp", { hp: mobile.maxHp })}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
