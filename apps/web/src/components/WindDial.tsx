/**
 * Wind indicator (`US-MATCH-003`).
 *
 * The dial has twelve ticks — one per 30° sector — because the weather rolls into a sector, not a
 * free angle (`tunables.md` § 1.3). The number is the magnitude, 0–26.
 */
import type { Weather } from "@gbw/core";
import type { JSX } from "react";

export interface WindDialProps {
  readonly weather: Weather;
  readonly label: string;
}

const RADIUS = 18;

export function WindDial({ weather, label }: WindDialProps): JSX.Element {
  const { magnitude, directionDeg } = weather.wind;
  const radians = ((directionDeg - 90) * Math.PI) / 180;
  const tipX = 22 + Math.cos(radians) * RADIUS * (0.35 + (magnitude / 26) * 0.65);
  const tipY = 22 + Math.sin(radians) * RADIUS * (0.35 + (magnitude / 26) * 0.65);
  return (
    <div className="wind" aria-label={`${label}: ${magnitude}`} data-testid="wind-dial">
      <svg className="wind__dial" viewBox="0 0 44 44" role="img" aria-hidden="true">
        <circle cx="22" cy="22" r="20" fill="none" stroke="#24324c" strokeWidth="1" />
        {Array.from({ length: 12 }, (_, index) => {
          const angle = ((index * 30 - 90) * Math.PI) / 180;
          const outer = 20;
          const inner = index % 3 === 0 ? 14 : 16.5;
          return (
            <line
              key={index}
              x1={22 + Math.cos(angle) * inner}
              y1={22 + Math.sin(angle) * inner}
              x2={22 + Math.cos(angle) * outer}
              y2={22 + Math.sin(angle) * outer}
              stroke={index === weather.wind.sector ? "#4f9dff" : "#3c4c68"}
              strokeWidth={index === weather.wind.sector ? 2 : 1}
            />
          );
        })}
        {magnitude > 0 ? (
          <line x1="22" y1="22" x2={tipX} y2={tipY} stroke="#ff7043" strokeWidth="2.5" strokeLinecap="round" />
        ) : (
          <circle cx="22" cy="22" r="2" fill="#9fb0cc" />
        )}
      </svg>
      <span data-testid="wind-value">{magnitude}</span>
    </div>
  );
}
