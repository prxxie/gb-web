/**
 * Four-way pad (`US-MATCH-006`).
 *
 * Left and right walk the mobile, up and down tilt the barrel one degree per step. Holding repeats
 * — the repeat count comes from `stepHold`, so the same rule is testable without a browser.
 */
import { useEffect, useRef } from "react";
import { stepHold } from "@gbw/core";
import type { JSX } from "react";

export type PadAction = "left" | "right" | "up" | "down";

export interface DirectionPadProps {
  readonly enabled: boolean;
  readonly canMove: boolean;
  /** Remaining steps this turn (`US-MATCH-006` AC2); the badge shows `0` when the budget is spent. */
  readonly movesLeft?: number;
  /** Remaining movement energy, shown beside the step count (`US-MATCH-006` AC2/AC6). */
  readonly energy?: number;
  readonly labels: Readonly<Record<PadAction, string>>;
  readonly onAction: (action: PadAction) => void;
  readonly onRepeat: (action: PadAction, times: number) => void;
}

const RATE_PER_SECOND = 8;
const CAP = 12;
const TICK_MS = 100;

export function DirectionPad({
  enabled,
  canMove,
  movesLeft = 0,
  energy = 0,
  labels,
  onAction,
  onRepeat,
}: DirectionPadProps): JSX.Element {
  const timer = useRef<number | null>(null);
  const startedAt = useRef<number>(0);
  const action = useRef<PadAction | null>(null);
  const delivered = useRef<number>(0);

  const stop = (): void => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    action.current = null;
    delivered.current = 0;
  };

  useEffect(() => stop, []);

  const start = (next: PadAction): void => {
    if (!enabled) return;
    if (next === "left" || next === "right") {
      if (!canMove) return;
      onAction(next);
      action.current = next;
      startedAt.current = performance.now();
      delivered.current = 1;
      timer.current = window.setInterval(() => {
        const held = performance.now() - startedAt.current;
        const wanted = stepHold(held, RATE_PER_SECOND, CAP);
        const times = wanted - delivered.current;
        if (times > 0 && action.current) {
          delivered.current = wanted;
          onRepeat(action.current, times);
        }
      }, TICK_MS);
      return;
    }
    onAction(next);
    action.current = next;
    startedAt.current = performance.now();
    delivered.current = 1;
    timer.current = window.setInterval(() => {
      const held = performance.now() - startedAt.current;
      const wanted = stepHold(held, 4, 60);
      const times = wanted - delivered.current;
      if (times > 0 && action.current) {
        delivered.current = wanted;
        onRepeat(action.current, times);
      }
    }, TICK_MS);
  };

  return (
    <div className="match__pad" role="group" aria-label={labels.left}>
      <span className="match__pad-budget" data-testid="pad-moves-left">
        {movesLeft}
      </span>
      <span className="match__pad-budget match__pad-budget--energy" data-testid="pad-energy">
        {energy}
      </span>
      {(["up", "left", "right", "down"] as const).map((slot) => (
        <button
          key={slot}
          type="button"
          data-slot={slot}
          aria-label={labels[slot]}
          disabled={!enabled || ((slot === "left" || slot === "right") && !canMove)}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture?.(event.pointerId);
            start(slot);
          }}
          onPointerUp={stop}
          onPointerCancel={stop}
          onPointerLeave={stop}
        >
          {slot === "up" ? "▲" : slot === "down" ? "▼" : slot === "left" ? "◀" : "▶"}
        </button>
      ))}
    </div>
  );
}
