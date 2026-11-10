// @vitest-environment jsdom
/**
 * TC-PWA-152: the rotate gate (`US-PWA-003`).
 * TC-PWA-192/193/194: the platform lock and the desktop window (`US-PWA-005`).
 *
 * Portrait gives one sentence and a locale toggle and nothing else; landscape gives the game. The gate
 * hides its children but never unmounts them, so rotating never resets the match.
 *
 * `US-PWA-005` changed two things about the gate. It now applies only to a **touch** device — a narrow
 * desktop window is portrait in shape but cannot be rotated, so it gets the game instead of an
 * instruction it could not follow — and the app asks the platform to lock the screen to landscape once,
 * on the first gesture, best-effort, because Safari has no such API and Chrome only honours it when the
 * app is installed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import type { JSX } from "react";
import {
  ORIENTATION_DEBOUNCE_MS,
  OrientationGate,
  isTouchDevice,
  requestLandscapeLock,
  shouldGate,
} from "../src/components/OrientationGate";

const MESSAGE = "Xoay ngang thiết bị để chơi.";

type Listener = (event: MediaQueryListEvent) => void;

let landscapeQueryMatches = true;
let coarsePointer = true;
let installed = true;
const listeners = new Set<Listener>();

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: height });
}

function stubOrientation(): void {
  listeners.clear();
  window.matchMedia = ((query: string) => {
    let matches = false;
    if (query.includes("orientation: landscape")) matches = landscapeQueryMatches;
    else if (query.includes("pointer: coarse")) matches = coarsePointer;
    else if (query.includes("hover: none")) matches = coarsePointer;
    else if (query.startsWith("(display-mode:")) matches = installed;
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: (_: string, listener: Listener) => listeners.add(listener),
      removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    };
  }) as unknown as typeof window.matchMedia;
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

/** A phone held upright: coarse pointer, portrait viewport, portrait media query. */
function phoneUpright(): void {
  setViewport(390, 844);
  landscapeQueryMatches = false;
  coarsePointer = true;
}

beforeEach(() => {
  landscapeQueryMatches = true;
  coarsePointer = true;
  installed = true;
  setViewport(844, 390);
  stubOrientation();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
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
    phoneUpright();
    gate();
    expect(screen.getByTestId("orientation-hint")).toBeVisible();
    expect(screen.getByTestId("orientation-hint")).toHaveTextContent(MESSAGE);
  });

  it("hides the game while the device is upright", () => {
    phoneUpright();
    gate();
    expect(screen.getByTestId("battle")).not.toBeVisible();
  });

  it("keeps the game mounted so rotating does not reset the match", () => {
    phoneUpright();
    gate();
    expect(screen.getByTestId("battle")).toBeInTheDocument();
  });

  it("offers the locale toggle and no other control", () => {
    phoneUpright();
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
    phoneUpright();
    gate();
    // The very first render already carries the overlay; nothing waited for an effect or an event.
    expect(screen.getByTestId("orientation-hint")).toBeVisible();
  });
});

describe("TC-PWA-193: a desktop window is never told to rotate", () => {
  it("gives the game to a narrow window with a fine pointer, tall or not", () => {
    // The exact shape `US-PWA-003` AC6 used to gate: 600×900 with a mouse.
    setViewport(600, 900);
    landscapeQueryMatches = true;
    coarsePointer = false;
    gate();
    expect(screen.queryByTestId("orientation-hint")).toBeNull();
    expect(screen.getByTestId("battle")).toBeVisible();
  });

  it("still gates a touch device in the same window shape", () => {
    setViewport(600, 900);
    landscapeQueryMatches = true;
    coarsePointer = true;
    gate();
    expect(screen.getByTestId("orientation-hint")).toBeVisible();
  });

  it("reports the decision it made", () => {
    coarsePointer = false;
    setViewport(600, 900);
    expect(isTouchDevice()).toBe(false);
    expect(shouldGate()).toBe(false);
    coarsePointer = true;
    expect(isTouchDevice()).toBe(true);
    expect(shouldGate()).toBe(true);
    setViewport(900, 600);
    expect(shouldGate()).toBe(false);
  });
});

describe("TC-PWA-192: the app asks the platform to lock the screen", () => {
  it("locks to landscape once, on the first gesture, when it is installed", async () => {
    const lock = vi.fn(async () => undefined);
    vi.stubGlobal("screen", { orientation: { lock } });
    expect(await requestLandscapeLock()).toBe(true);
    expect(lock).toHaveBeenCalledWith("landscape");
  });

  it("swallows a rejection, because the notice is the fallback", async () => {
    const lock = vi.fn(async () => {
      throw new Error("NotSupportedError");
    });
    vi.stubGlobal("screen", { orientation: { lock } });
    await expect(requestLandscapeLock()).resolves.toBe(false);
  });

  it("does not ask when the API is missing (Safari) or the app is in a browser tab", async () => {
    vi.stubGlobal("screen", {});
    expect(await requestLandscapeLock()).toBe(false);

    const lock = vi.fn(async () => undefined);
    vi.stubGlobal("screen", { orientation: { lock } });
    installed = false;
    expect(await requestLandscapeLock()).toBe(false);
    expect(lock).not.toHaveBeenCalled();
  });

  it("asks from the gate on the first pointer or key, and only once", async () => {
    const lock = vi.fn(async () => undefined);
    vi.stubGlobal("screen", { orientation: { lock } });
    gate();
    await act(async () => {
      window.dispatchEvent(new Event("pointerdown"));
      window.dispatchEvent(new Event("pointerdown"));
      window.dispatchEvent(new Event("keydown"));
    });
    expect(lock).toHaveBeenCalledTimes(1);
  });
});
