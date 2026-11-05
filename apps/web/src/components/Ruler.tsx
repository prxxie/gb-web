/**
 * Bottom ruler (`US-MATCH-007`).
 *
 * Eight divisions at the default window, sixteen when zoomed all the way out — one division is
 * always ~125 units, which is what makes a wind push readable against a shot distance.
 */
import { rulerLayout, type CameraWindow } from "@gbw/core";
import type { JSX } from "react";

export interface RulerProps {
  readonly window: CameraWindow;
  readonly unitLabel: string;
}

export function Ruler({ window, unitLabel }: RulerProps): JSX.Element {
  const layout = rulerLayout(window);
  return (
    <div className="ruler" data-testid="ruler" data-segments={layout.segments}>
      {layout.labels.map((label, index) => {
        // Every fourth tick reads as a major division, so a player can count 500-unit blocks at a glance.
        const major = index % 4 === 0;
        return (
          <span
            key={index}
            className={major ? "ruler__tick ruler__tick--major" : "ruler__tick"}
            data-major={major}
            title={`${label} ${unitLabel}`}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
