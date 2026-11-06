// @vitest-environment jsdom
/**
 * TC-MATCH-907: the four-way pad (`US-MATCH-006`).
 *
 * A tap is one step, a hold repeats through `stepHold` (the same function the engine uses), and a
 * spent budget disables only the two walking directions — the barrel still aims.
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

describe("TC-MATCH-907: the pad's four controls", () => {
  it("renders ◀ ▶ ▲ ▼ with their Vietnamese names", () => {
    pad();
    expect(screen.getAllByRole("button")).toHaveLength(4);
    for (const name of Object.values(LABELS)) expect(button(name)).toBeInTheDocument();
    expect(button(LABELS.left)).toHaveTextContent("◀");
    expect(button(LABELS.right)).toHaveTextContent("▶");
    expect(button(LABELS.up)).toHaveTextContent("▲");
    expect(button(LABELS.down)).toHaveTextContent("▼");
  });

  it("a tap on ▶ asks for one step and repeats nothing yet (AC2)", () => {
    const { onAction, onRepeat } = pad();
    fireEvent.pointerDown(button(LABELS.right), { pointerId: 1 });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith("right");
    expect(onRepeat).not.toHaveBeenCalled();
    fireEvent.pointerUp(button(LABELS.right), { pointerId: 1 });
  });

  it("a tap on ▲ tilts the barrel exactly one degree-step (AC4)", () => {
    const { onAction } = pad();
    fireEvent.pointerDown(button(LABELS.up), { pointerId: 1 });
    expect(onAction).toHaveBeenCalledWith("up");
    expect(onAction).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(button(LABELS.up), { pointerId: 1 });
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

  it("rotates the barrel at 10°/s while ▲ is held (AC5)", () => {
    const { onRepeat } = pad();
    const up = button(LABELS.up);
    fireEvent.pointerDown(up, { pointerId: 1 });
    vi.advanceTimersByTime(500);
    const delivered = onRepeat.mock.calls.reduce((sum, [, times]) => sum + times, 0);
    expect(delivered).toBe(stepHold(500, 4, 60) - 1);
    fireEvent.pointerUp(up, { pointerId: 1 });
  });
});

describe("TC-MATCH-907: a spent budget", () => {
  it("disables ◀ ▶ but keeps ▲ ▼ aiming (AC6)", () => {
    pad({ canMove: false });
    expect(button(LABELS.left)).toBeDisabled();
    expect(button(LABELS.right)).toBeDisabled();
    expect(button(LABELS.up)).toBeEnabled();
    expect(button(LABELS.down)).toBeEnabled();
  });

  it("sends no move when a disabled direction is pressed (AC6)", () => {
    const { onAction } = pad({ canMove: false });
    fireEvent.pointerDown(button(LABELS.right), { pointerId: 1 });
    expect(onAction).not.toHaveBeenCalled();
  });

  it("disables every control outside the player's turn (AC1)", () => {
    const { onAction } = pad({ enabled: false });
    for (const name of Object.values(LABELS)) expect(button(name)).toBeDisabled();
    fireEvent.pointerDown(button(LABELS.up), { pointerId: 1 });
    expect(onAction).not.toHaveBeenCalled();
  });

  it("shows the remaining move budget beside the pad (AC2/AC6)", () => {
    // The pad's contract carries `movesLeft` and `energy` because AC2 decrements a badge and AC6
    // shows `0`; the shipped component takes neither, so there is no number to read.
    const { root } = pad({ canMove: false });
    expect(within(root).queryAllByText(/^\d+$/)).not.toHaveLength(0);
  });
});
