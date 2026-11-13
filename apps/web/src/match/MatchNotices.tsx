/**
 * What the screen says over the field (`US-MATCH-002` AC4, `US-MATCH-003`, `US-ROOM-004` AC7).
 *
 * The reconnect overlay, the connection banner and the "drag to aim" hint: all three sit above the bar in the DOM, which
 * is where the banner's own stacking expects them.
 */
import { useLocale } from "../app/providers";
import type { MatchStatus } from "./wiring";
import type { JSX } from "react";

export interface MatchNoticesProps {
  readonly status: MatchStatus;
  readonly banner: string | null;
  readonly hint: string | null;
}

export function MatchNotices(props: MatchNoticesProps): JSX.Element {
  const { t } = useLocale();
  const { status, banner, hint } = props;
  return (
    <>
      {status === "reconnecting" ? <div className="overlay">{t("match.reconnecting")}</div> : null}

      {/* The banner carries refusals a player must hear, not only see (`US-BAL-002` AC6). */}
      {banner ? (
        <div className="banner" role="status" aria-live="polite" data-testid="banner">
          {banner}
        </div>
      ) : null}
      {hint ? (
        <div className="match__hint" data-testid="pull-hint">
          {hint}
        </div>
      ) : null}
    </>
  );
}
