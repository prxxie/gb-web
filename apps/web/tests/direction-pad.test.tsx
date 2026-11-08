// @vitest-environment jsdom
/**
 * TC-MATCH-907: the move pad (`US-MATCH-006`).
 *
 * The pad walks the mobile and nothing else. The barrel's up/down buttons are gone: the angle is set by the held
 * gesture (vertical travel rotates it, `TC-MATCH-915`), so the pad is two cells and sits in the match bar's left end.
 * A tap is one step, a hold repeats through `stepHold` (the same function the engine uses), and a spent budget disables
 * both walking directions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { stepHold } from "@gbw/core";
import { DirectionPad, type PadAction } from "../src/components/DirectionPad";

const LABELS = { up: "Tăng góc", down: "Giảm góc", left: "Lùi", right: "Tiến" } as const;

afterEach(cleanup);

function pad(overrides: Partial<Parameters<typeof DirectionPad>[0]> = {}) {
  const onAction = vi.fn<(action: PadAction) => void>();
  const onRepeat = vi.fn<(action: PadAction, times: number) => void>();
  render(
    <DirectionPad
      enabled
      canMove
      labels={LABELS}
      onAction={onAction}
      onRepeat={onRepeat}
      {...overrides}
    />,
  );
  return { onAction, onRepeat, root: screen.getByRole("group") };
}

function button(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

describe("TC-MATCH-907: the pad's two controls", () => {
  it("renders ◀ ▶ only — the barrel is a gesture now, not a button", () => {
    pad();
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(button(LABELS.left)).toBeEnabled();
    expect(button(LABELS.right)).toBeEnabled();
    // Nothing in the pad can reach the angle: pressing a direction sends a move and never a tilt.
    expect(screen.queryByRole("button", { name: LABELS.up })).toBeNull();
    expect(screen.queryByRole("button", { name: LABELS.down })).toBeNull();
  });

  it("a tap on ▶ asks for one step and repeats nothing yet (AC2)", () => {
    const { onAction, onRepeat } = pad();
    fireEvent.pointerDown(button(LABELS.right), { pointerId: 1 });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith("right");
    expect(onRepeat).not.toHaveBeenCalled();
    fireEvent.pointerUp(button(LABELS.right), { pointerId: 1 });
  });
});

describe("TC-MATCH-907: holding a direction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("walks at 8 steps a second, the first step landing on press (AC3)", () => {
    const { onAction, onRepeat } = pad();
    const walking = button(LABELS.right);
    fireEvent.pointerDown(walking, { pointerId: 1 });

    vi.advanceTimersByTime(300);
    const delivered = onRepeat.mock.calls.reduce((total, [, times]) => total + times, 0);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(delivered).toBe(stepHold(300, 8, 12) - 1);

    vi.advanceTimersByTime(1200);
    const total = onRepeat.mock.calls.reduce((sum, [, times]) => sum + times, 0);
    expect(total).toBe(stepHold(1500, 8, 12) - 1);
    expect(onRepeat.mock.calls.every(([action]) => action === "right")).toBe(true);
    fireEvent.pointerUp(walking, { pointerId: 1 });
  });

  it("stops repeating as soon as the finger lifts (AC8)", () => {
    const { onRepeat } = pad();
    const walking = button(LABELS.left);
    fireEvent.pointerDown(walking, { pointerId: 1 });
    vi.advanceTimersByTime(400);
    const before = onRepeat.mock.calls.reduce((sum, [, times]) => sum + times, 0);
    fireEvent.pointerUp(walking, { pointerId: 1 });
    vi.advanceTimersByTime(2000);
    const after = onRepeat.mock.calls.reduce((sum, [, times]) => sum + times, 0);
    expect(after).toBe(before);
  });
});

describe("TC-MATCH-907: a spent budget", () => {
  it("disables both walking directions (AC6)", () => {
    pad({ canMove: false });
    expect(button(LABELS.left)).toBeDisabled();
    expect(button(LABELS.right)).toBeDisabled();
  });

  it("sends no move when a disabled direction is pressed (AC6)", () => {
    const { onAction } = pad({ canMove: false });
    fireEvent.pointerDown(button(LABELS.right), { pointerId: 1 });
    expect(onAction).not.toHaveBeenCalled();
  });

  it("disables every control outside the player's turn (AC1)", () => {
    const { onAction } = pad({ enabled: false });
    for (const name of [LABELS.left, LABELS.right]) expect(button(name)).toBeDisabled();
    fireEvent.pointerDown(button(LABELS.right), { pointerId: 1 });
    expect(onAction).not.toHaveBeenCalled();
  });

  it("shows the remaining move budget beside the pad (AC2/AC6)", () => {
    const { root } = pad({ canMove: false });
    expect(within(root).queryAllByText(/^\d+$/)).not.toHaveLength(0);
  });
});

describe("TC-MATCH-939: the pad is a corner control and does not aim (US-MATCH-006 AC5, AC7, AC8)", () => {
  it("ignores the barrel window, because it no longer tilts the barrel (AC5)", () => {
    // The window used to dim ▲ at `angleMax` and ▼ at `angleMin`. There is no ▲ or ▼ any more: the gesture clamps the
    // angle against the same window (`TC-MATCH-915`), so the pad has nothing to dim and must stay live.
    pad({ angle: 80, angleWindow: { min: 10, max: 80 } });
    expect(button(LABELS.left)).toBeEnabled();
    expect(button(LABELS.right)).toBeEnabled();
  });

  it("stays in the bar's corner even when the renderer reports a focus point (AC7)", () => {
    // It used to ring the active mobile; the owner moved it into the match bar, where it must not jump around.
    pad({ focus: { x: 120, y: 200 }, viewport: { width: 844, height: 390 } });
    const box = screen.getByTestId("direction-pad");
    expect(box.getAttribute("data-focus")).toBe("corner");
    expect(box.style.left).toBe("");
    cleanup();
    pad({ focus: { x: 640, y: 120 }, viewport: { width: 844, height: 390 } });
    expect(screen.getByTestId("direction-pad").getAttribute("data-focus")).toBe("corner");
  });

  it("stops a hold when the turn ends, so no stray move is sent (AC8)", () => {
    vi.useFakeTimers();
    try {
      const onAction = vi.fn<(action: PadAction) => void>();
      const onRepeat = vi.fn<(action: PadAction, times: number) => void>();
      const view = (enabled: boolean) => (
        <DirectionPad enabled={enabled} canMove labels={LABELS} onAction={onAction} onRepeat={onRepeat} />
      );
      const { rerender } = render(view(true));
      fireEvent.pointerDown(button(LABELS.right), { pointerId: 1 });
      vi.advanceTimersByTime(400);
      const before = onRepeat.mock.calls.length;
      expect(before).toBeGreaterThan(0);
      // The turn passes mid-hold: the repeat must stop even though the finger is still down.
      rerender(view(false));
      vi.advanceTimersByTime(1000);
      expect(onRepeat.mock.calls.length).toBe(before);
      expect(onAction).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
