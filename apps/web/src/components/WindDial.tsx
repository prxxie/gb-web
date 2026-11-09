/**
 * Wind indicator (`US-MATCH-003`).
 *
 * Two ticks, east and west: GB's wind is horizontal, so the dial shows a side and a strength and nothing
 * else (`tunables.md` § 1.3).
 *
 * Owner's layout (2026-11-09): the dial is larger, an **arrow** points the way the wind pushes, the magnitude sits in the
 * **centre** of the circle, and there is no plate behind it — only the ring is drawn. The arrow keeps encoding strength as
 * length, so a glance reads both "which way" and "how hard" without moving the eye to the number.
 */
import type { Weather } from "@gbw/core";
import type { JSX } from "react";

export interface WindDialProps {
  readonly weather: Weather;
  readonly label: string;
}

const CENTRE = 32;
const RING = 30;
/** The arrow is the same length at any strength: it answers "which way", the number answers "how hard". */
const ARROW_REACH = RING - 3;
/** Strength reads as weight and opacity, so a 2-unit wind still shows a full arrow instead of a stub. */
const arrowWeight = (magnitude: number): number => 2 + (magnitude / 26) * 1.5;
const arrowOpacity = (magnitude: number): number => 0.45 + (magnitude / 26) * 0.55;
/** The magnitude plate: an opaque disc under the number, so the arrow's tail does not run through the digits. */
const PLATE = 9.5;

export function WindDial({ weather, label }: WindDialProps): JSX.Element {
  const { magnitude, directionDeg } = weather.wind;
  const radians = (directionDeg * Math.PI) / 180;
  const tipX = CENTRE + Math.cos(radians) * ARROW_REACH;
  const tipY = CENTRE + Math.sin(radians) * ARROW_REACH;
  // Two barbs at the tip, swept back from the shaft: a line alone reads as a needle, not as a direction.
  const barb = 6;
  const backX = tipX - Math.cos(radians) * barb;
  const backY = tipY - Math.sin(radians) * barb;
  const spread = 0.5;
  const head = [
    `${backX + Math.cos(radians + spread) * barb},${backY + Math.sin(radians + spread) * barb}`,
    `${tipX},${tipY}`,
    `${backX + Math.cos(radians - spread) * barb},${backY + Math.sin(radians - spread) * barb}`,
  ].join(" ");
  return (
    <div className="wind" aria-label={`${label}: ${magnitude}`} data-testid="wind-dial">
      <svg className="wind__dial" viewBox="0 0 64 64" role="img" aria-hidden="true">
        {/* The ring is the whole surface: no plate, no border (owner, 2026-11-09). */}
        <circle cx={CENTRE} cy={CENTRE} r={RING} fill="none" stroke="#2a3a56" strokeWidth="1.5" />
        {Array.from({ length: 2 }, (_, index) => {
          const angle = (index * 180 * Math.PI) / 180;
          const outer = RING;
          const inner = RING - 6;
          return (
            <line
              key={index}
              x1={CENTRE + Math.cos(angle) * inner}
              y1={CENTRE + Math.sin(angle) * inner}
              x2={CENTRE + Math.cos(angle) * outer}
              y2={CENTRE + Math.sin(angle) * outer}
              stroke={index === weather.wind.sector ? "#4f9dff" : "#3c4c68"}
              strokeWidth={index === weather.wind.sector ? 3 : 1.5}
            />
          );
        })}
        {magnitude > 0 ? (
          <>
            <line
              x1={CENTRE}
              y1={CENTRE}
              x2={tipX}
              y2={tipY}
              stroke="#ff7043"
              strokeWidth={arrowWeight(magnitude)}
              strokeOpacity={arrowOpacity(magnitude)}
              strokeLinecap="round"
            />
            <polygon points={head} fill="#ff7043" fillOpacity={arrowOpacity(magnitude)} />
          </>
        ) : (
          <circle cx={CENTRE} cy={CENTRE} r="2.5" fill="#9fb0cc" />
        )}
        <circle cx={CENTRE} cy={CENTRE} r={PLATE} fill="#0b1220" />
        <text
          className="wind__value"
          data-testid="wind-value"
          x={CENTRE}
          y={CENTRE}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {magnitude}
        </text>
      </svg>
    </div>
  );
}
