// @vitest-environment jsdom
/**
 * TC-PWA-152: the rotate gate (`US-PWA-003`).
 *
 * Portrait gives one sentence and a locale toggle and nothing else; landscape gives the game. The gate
 * hides its children but never unmounts them, so rotating never resets the match. Portrait is decided by
 * the *viewport's shape* as well as the media query, because a narrow desktop window reports landscape
 * while still being taller than it is wide (AC6).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import type { JSX } from "react";
import { ORIENTATION_DEBOUNCE_MS, OrientationGate } from "../src/components/OrientationGate";

const MESSAGE = "Xoay ngang thiết bị để chơi.";

type Listener = (event: MediaQueryListEvent) => void;

let landscapeQueryMatches = true;
const listeners = new Set<Listener>();

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: height });
}

function stubOrientation(): void {
  listeners.clear();
  window.matchMedia = ((query: string) => ({
    matches: query.includes("orientation: landscape") ? landscapeQueryMatches : false,
    media: query,
    onchange: null,
    addEventListener: (_: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function fireOrientationChange(matches: boolean): void {
  landscapeQueryMatches = matches;
  act(() => {
    for (const listener of listeners) listener({ matches } as MediaQueryListEvent);
  });
}

function fireResize(): void {
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
}

function gate(action?: JSX.Element) {
  return render(
    <OrientationGate message={MESSAGE} action={action}>
      <div data-testid="battle">trận đấu</div>
    </OrientationGate>,
  );
}

beforeEach(() => {
  landscapeQueryMatches = true;
  setViewport(844, 390);
  stubOrientation();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TC-PWA-152: landscape", () => {
  it("shows the game and no rotate overlay", () => {
    gate();
    expect(screen.queryByTestId("orientation-hint")).toBeNull();
    expect(screen.getByTestId("battle")).toBeVisible();
  });
});

describe("TC-PWA-152: portrait", () => {
  it("renders one sentence of instruction, visible over everything else", () => {
    setViewport(390, 844);
    landscapeQueryMatches = false;
    gate();
    expect(screen.getByTestId("orientation-hint")).toBeVisible();
    expect(screen.getByTestId("orientation-hint")).toHaveTextContent(MESSAGE);
  });

  it("hides the game while the device is upright", () => {
    setViewport(390, 844);
    landscapeQueryMatches = false;
    gate();
    expect(screen.getByTestId("battle")).not.toBeVisible();
  });

  it("keeps the game mounted so rotating does not reset the match", () => {
    setViewport(390, 844);
    landscapeQueryMatches = false;
    gate();
    expect(screen.getByTestId("battle")).toBeInTheDocument();
  });

  it("offers the locale toggle and no other control", () => {
    setViewport(390, 844);
    landscapeQueryMatches = false;
    gate(<button type="button">EN</button>);
    const hint = screen.getByTestId("orientation-hint");
    expect(within(hint).getAllByRole("button")).toHaveLength(1);
    expect(within(hint).queryAllByRole("link")).toHaveLength(0);
  });
});

describe("TC-PWA-152: detecting the change", () => {
  it("reacts to the orientation media query immediately", () => {
    gate();
    expect(screen.queryByTestId("orientation-hint")).toBeNull();
    setViewport(390, 844);
    fireOrientationChange(false);
    expect(screen.getByTestId("orientation-hint")).toBeVisible();
    setViewport(844, 390);
    fireOrientationChange(true);
    expect(screen.queryByTestId("orientation-hint")).toBeNull();
  });

  it("treats a tall desktop window as portrait even when the query says landscape (AC6)", () => {
    setViewport(600, 900);
    landscapeQueryMatches = true;
    gate();
    expect(screen.getByTestId("orientation-hint")).toBeVisible();
  });

  it("debounces resize so a drag across the breakpoint does not thrash", () => {
    vi.useFakeTimers();
    gate();
    setViewport(390, 844);
    fireResize();
    expect(screen.queryByTestId("orientation-hint")).toBeNull();
    act(() => vi.advanceTimersByTime(ORIENTATION_DEBOUNCE_MS));
    expect(screen.getByTestId("orientation-hint")).toBeVisible();
  });

  it("evaluates before the first paint, so there is no flash of the game", () => {
    setViewport(390, 844);
    landscapeQueryMatches = false;
    gate();
    // The very first render already carries the overlay; nothing waited for an effect or an event.
    expect(screen.getByTestId("orientation-hint")).toBeVisible();
  });
});
