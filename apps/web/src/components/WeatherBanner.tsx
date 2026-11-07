/**
 * The wind-change banner (`US-MATCH-003` AC10).
 *
 * Shown once per round, because a player who missed the dial would otherwise fire into wind they did not know
 * about. It lasts 1.5 s, disappears on a tap, and never takes input away from the battlefield — the banner is a
 * small box in the middle of the HUD, and every press outside it still reaches the canvas.
 */
import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";

/** How long the banner stays up, per `screens/match.md` § 8. */
export const WEATHER_BANNER_MS = 1500;

export interface WeatherBannerProps {
  /** `weather.rolledAtRound`; a new roll raises the banner again. */
  readonly rolledAtRound: number;
  /** `match.weather.changed` already interpolated with the magnitude and the sector. */
  readonly text: string;
  /** Test seam: the stylesheet is the only thing that needs the real number. */
  readonly ms?: number;
}

export function WeatherBanner({ rolledAtRound, text, ms = WEATHER_BANNER_MS }: WeatherBannerProps): JSX.Element | null {
  const [shownRound, setShownRound] = useState<number | null>(null);
  const seen = useRef<number | null>(null);

  useEffect(() => {
    // The first roll the screen sees is the one already on the dial: no banner on mount.
    if (seen.current === null) {
      seen.current = rolledAtRound;
      return;
    }
    if (seen.current === rolledAtRound) return;
    seen.current = rolledAtRound;
    setShownRound(rolledAtRound);
    const timer = window.setTimeout(() => setShownRound(null), ms);
    return () => window.clearTimeout(timer);
  }, [rolledAtRound, ms]);

  if (shownRound === null) return null;
  return (
    <button
      type="button"
      className="match__weather-banner"
      data-testid="weather-banner"
      data-round={shownRound}
      onClick={() => setShownRound(null)}
    >
      {text}
    </button>
  );
}
