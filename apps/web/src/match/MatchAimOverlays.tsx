/**
 * The two overlays that hang on this client's own mobile (`US-MATCH-002`, `US-MATCH-005` AC5).
 *
 * The item wheel fans the loadout out around the hull, and the power ring's centre carries the angle the shot will
 * carry. The readout is hidden while the wheel is open: it hangs at `focus.y − RING_RADIUS − 8`, which is exactly where
 * the arc's two top wedges land.
 */
import { ItemWheel, type EquippedItem } from "../components/ItemWheel";
import { RING_RADIUS } from "../game/aim";
import { useLocale } from "../app/providers";
import type { AimPoint } from "./wiring";
import type { JSX } from "react";

export interface MatchAimOverlaysProps {
  readonly items: readonly EquippedItem[];
  readonly itemsEnabled: boolean;
  readonly wheelAt: AimPoint | null;
  readonly onUseItem: (itemId: string) => void;
  readonly onCloseWheel: () => void;
  readonly focus: AimPoint | null;
  readonly aimAngle: number;
  readonly power: number;
}

export function MatchAimOverlays(props: MatchAimOverlaysProps): JSX.Element {
  const { t } = useLocale();
  const { items, itemsEnabled, wheelAt, onUseItem, onCloseWheel, focus, aimAngle, power } = props;
  return (
    <>
      {wheelAt ? (
        <ItemWheel
          items={items}
          enabled={itemsEnabled}
          at={wheelAt}
          label={t("match.item.tray")}
          quantityLabel={t("match.item.quantity")}
          delayLabel={t("match.item.delay")}
          onUse={onUseItem}
          onClose={onCloseWheel}
        />
      ) : null}

      <div
        className={focus ? "match__power match__power--on-ring" : "match__power"}
        style={focus && !wheelAt ? { left: focus.x, top: focus.y - RING_RADIUS - 8 } : undefined}
        hidden={wheelAt !== null}
      >
        {/* The ring's centre carries the angle: the gesture sets both, and the angle is the number a player reads
            while pulling (owner's layout, 2026-11-08). The power keeps its own chip and the ring's own arc. */}
        <div className="match__power-value" data-testid="power-value">
          <span className="match__power-angle" data-testid="ring-angle">
            {Math.round(aimAngle)}°
          </span>
          {/* The bar itself, 0.0–4.0 (`US-BAL-005` AC3): one decimal is what the ring can carry. */}
          <span className="match__power-number">{power.toFixed(1)}</span>
        </div>
      </div>
    </>
  );
}
