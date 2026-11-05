// @vitest-environment jsdom
/**
 * Live announcements (`US-PWA-004` AC5, contract §4 "at most one polite update per second").
 *
 * The match HUD changes far faster than a screen reader can speak, so the announcement is throttled: the
 * first text shows at once and a burst of later changes is coalesced to the newest one.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ANNOUNCEMENT_INTERVAL_MS, useLiveAnnouncement } from "../src/app/useLiveAnnouncement";

afterEach(() => {
  vi.useRealTimers();
});

describe("useLiveAnnouncement", () => {
  it("shows the first text immediately", () => {
    const { result } = renderHook(() => useLiveAnnouncement("Lượt của An, còn 100 máu."));
    expect(result.current).toBe("Lượt của An, còn 100 máu.");
  });

  it("speaks a change, then waits a full interval before the next one", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ text }: { text: string }) => useLiveAnnouncement(text), {
      initialProps: { text: "A" },
    });

    act(() => rerender({ text: "B" }));
    act(() => vi.advanceTimersByTime(0));
    expect(result.current).toBe("B");

    act(() => rerender({ text: "C" }));
    act(() => vi.advanceTimersByTime(ANNOUNCEMENT_INTERVAL_MS - 1));
    expect(result.current).toBe("B");

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("C");
  });

  it("coalesces a burst into the newest text", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ text }: { text: string }) => useLiveAnnouncement(text), {
      initialProps: { text: "A" },
    });

    act(() => rerender({ text: "B" }));
    act(() => vi.advanceTimersByTime(0));
    act(() => rerender({ text: "C" }));
    act(() => rerender({ text: "D" }));
    act(() => vi.advanceTimersByTime(ANNOUNCEMENT_INTERVAL_MS));
    expect(result.current).toBe("D");
  });
});
