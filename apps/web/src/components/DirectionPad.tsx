/**
 * The move pad (`US-MATCH-006`).
 *
 * Left and right walk the mobile. The up/down buttons that tilted the barrel are gone: the barrel is set by the held
 * gesture now (vertical travel rotates it), so the pad is two cells and lives in the match bar's left end. Holding
 * repeats — the repeat count comes from `stepHold`, so the same rule is testable without a browser.
 */
import { useEffect, useRef } from "react";
import { stepHold } from "@gbw/core";
import type { FocusPoint, ViewportSize } from "./pad-layout";
import type { JSX } from "react";

export type PadAction = "left" | "right" | "up" | "down";

export interface DirectionPadProps {
  readonly enabled: boolean;
  readonly canMove: boolean;
  /** Remaining steps this turn (`US-MATCH-006` AC2); the badge shows `0` when the budget is spent. */
  readonly movesLeft?: number;
  /** Remaining movement energy, shown beside the step count (`US-MATCH-006` AC2/AC6). */
  readonly energy?: number;
  /** The barrel's current angle and the mobile's own window: at either bound the matching control dims (`AC5`). */
  /** Accepted for compatibility; the barrel is a gesture now, so the pad no longer reads either. */
  readonly angle?: number;
  readonly angleWindow?: { readonly min: number; readonly max: number };
  /** Accepted for compatibility: the pad is pinned to the match bar's corner now, so it no longer follows the mobile. */
  readonly focus?: FocusPoint | null;
  readonly viewport?: ViewportSize;
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
  angle: _angle,
  angleWindow: _angleWindow,
  focus: _focus = null,
  viewport: _viewport,
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

  // The turn ending while a finger is still down must not keep walking or tilting (`US-MATCH-006` AC8): the repeat
  // stops with the right to move, and the release sends nothing more.
  useEffect(() => {
    if (!enabled) stop();
  }, [enabled]);

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

  // The viewport is the visible window: the match screen fills it, so clamping against it is what keeps the bottom
  // row of buttons reachable. A test passes its own so the geometry stays a unit test.

  return (
    <div
      className="match__pad"
      role="group"
      aria-label={labels.left}
      data-testid="direction-pad"
      data-focus="corner"
    >
      <span className="match__pad-budget" data-testid="pad-moves-left">
        {movesLeft}
      </span>
      <span className="match__pad-budget match__pad-budget--energy" data-testid="pad-energy">
        {energy}
      </span>
      {(["left", "right"] as const).map((slot) => (
        <button
          key={slot}
          type="button"
          data-slot={slot}
          aria-label={labels[slot]}
          disabled={!enabled || !canMove}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture?.(event.pointerId);
            start(slot);
          }}
          onPointerUp={stop}
          onPointerCancel={stop}
          onPointerLeave={stop}
        >
          {slot === "left" ? "◀" : "▶"}
        </button>
      ))}
    </div>
  );
}
