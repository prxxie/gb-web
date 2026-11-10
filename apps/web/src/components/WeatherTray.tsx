/**
 * The weather tray: the next few rounds, one cell each, named by what the sky is doing (`TC-MATCH-953`).
 *
 * The forecast is not a wire field — `rollWeather(seed, round + n)` is a pure function of the match seed and the round
 * number (`packages/core/src/weather.ts`), so every client computes the same tray without a snapshot change. The kind is
 * the same story: `weatherKind(wind)` names the band the roll already landed in, so the four icons cost no ruleset change
 * and cannot disagree with the physics, which still reads the magnitude alone.
 *
 * Four cells, not three: the tray is the player's whole planning horizon — with a wind that re-rolls every round, three
 * cells covered less than a full lap of a four-seat match (owner, 2026-11-09).
 */
import { rollWeather, weatherKind, type WeatherKind } from "@gbw/core";
import type { JSX } from "react";

/** The rounds the tray shows. Four is one full turn cycle in a four-seat match. */
export const TRAY_ROUNDS = 4;

/** Each kind's ink. Set here rather than in the stylesheet: four decorative rules were the difference between the CSS
 * bucket fitting and not, and the colour belongs next to the glyph it paints. */
const KIND_INK: Record<WeatherKind, string> = {
  clear: "#f0c65a",
  breeze: "#8fd3a8",
  gale: "#7fb0ff",
  storm: "#c79bff",
};

/** The kind's own glyph. Shapes, not colours: the four must read apart at 16 px in a 28 px chip. */
export function KindGlyph({ kind }: { readonly kind: WeatherKind }): JSX.Element {
  if (kind === "clear") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="3.2" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M12.9 3.1l-1.4 1.4M4.5 11.5l-1.4 1.4" />
      </svg>
    );
  }
  if (kind === "breeze") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M2 6h7.5a2 2 0 1 0-2-2M2 10h9a2 2 0 1 1-2 2" />
      </svg>
    );
  }
  if (kind === "gale") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M1.5 4.5h9.5a2 2 0 1 0-2-2M1.5 8h11M1.5 11.5h9.5a2 2 0 1 1-2 2" />
      </svg>
    );
  }
  // storm: a spiral, the only closed curve in the set, so it cannot be mistaken for a gust at a glance.
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 1.5a6.5 6.5 0 1 1-6.4 5.3M8 4.5a3.5 3.5 0 1 0 3.4 2.9M8 7.5a.9.9 0 1 0 .9.9" />
    </svg>
  );
}

export interface WeatherTrayProps {
  readonly seed: number;
  /** The round in play. The tray starts at the round after it. */
  readonly round: number;
  /** How many rounds the tray shows; `TRAY_ROUNDS` unless a caller has fewer pixels. */
  readonly rounds?: number;
  readonly labels: {
    readonly weather: string;
    /** Kind name, e.g. `Nắng` / `Gió` / `Gió mạnh` / `Lốc`. */
    readonly kind: (kind: WeatherKind) => string;

  };
}

export function WeatherTray({ seed, round, rounds = TRAY_ROUNDS, labels }: WeatherTrayProps): JSX.Element {
  return (
    <div className="match__tray" role="group" aria-label={labels.weather} data-testid="weather-forecast">
      {Array.from({ length: rounds }, (_, index) => {
        const forecastRound = round + index + 1;
        const weather = rollWeather(seed, forecastRound);
        const kind = weatherKind(weather.wind);
        const kindName = labels.kind(kind);
        const heading = weather.wind.sector === 0 ? "›" : "‹";
        // `R5 · Gió mạnh 18` — the round number is language-neutral, as it is in the genre, so it needs no string.
        const description = `R${forecastRound} · ${kindName} ${weather.wind.magnitude}`;
        return (
          <span
            key={forecastRound}
            className="match__tray-cell"
            data-kind={kind}
            data-testid={`forecast-${index}`}
            title={description}
            aria-label={description}
          >
            <span className="match__tray-kind" data-testid={`forecast-kind-${index}`} style={{ color: KIND_INK[kind] }}>
              <KindGlyph kind={kind} />
            </span>
            <span className="match__tray-heading" aria-hidden="true">
              {heading}
            </span>
            <span className="match__tray-value">{weather.wind.magnitude}</span>
          </span>
        );
      })}
    </div>
  );
}
