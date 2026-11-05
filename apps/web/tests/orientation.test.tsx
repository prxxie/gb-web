// @vitest-environment jsdom
/**
 * TC-PWA-152: the rotate gate (`US-PWA-003`).
 *
 * Portrait must show the "rotate your device" overlay; landscape must show the game and nothing else.
 * The gate never unmounts its children — a rotation must not reset the match.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { OrientationGate } from "../src/components/OrientationGate";

const MESSAGE = "Xoay ngang thiết bị để chơi";

type Listener = (event: MediaQueryListEvent) => void;

let portrait = false;
const listeners = new Set<Listener>();

function stubOrientation() {
  listeners.clear();
  window.matchMedia = ((query: string) => ({
    matches: query.includes("orientation: portrait") ? portrait : false,
    media: query,
    onchange: null,
    addEventListener: (_: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function rotate(toPortrait: boolean) {
  portrait = toPortrait;
  act(() => {
    for (const listener of listeners) listener({ matches: toPortrait } as MediaQueryListEvent);
  });
}

function gate() {
  return render(
    <OrientationGate message={MESSAGE}>
      <div data-testid="battle">trận đấu</div>
    </OrientationGate>,
  );
}

beforeEach(() => {
  portrait = false;
  stubOrientation();
});

afterEach(cleanup);

describe("TC-PWA-152: landscape", () => {
  it("shows the game and no rotate overlay", () => {
    gate();
    expect(screen.queryByTestId("orientation-hint")).toBeNull();
    expect(screen.getByTestId("battle")).toBeVisible();
  });

  it("keeps the gate itself visible", () => {
    gate();
    expect(screen.getByTestId("orientation-gate")).toBeVisible();
  });
});

describe("TC-PWA-152: portrait", () => {
  it("renders the rotate instruction", () => {
    portrait = true;
    gate();
    expect(screen.getByTestId("orientation-hint")).toHaveTextContent(MESSAGE);
  });

  it("hides the battle while the device is upright", () => {
    portrait = true;
    gate();
    expect(screen.getByTestId("battle")).not.toBeVisible();
  });

  it("keeps the battle mounted so rotating does not reset the match", () => {
    portrait = true;
    gate();
    expect(screen.getByTestId("battle")).toBeInTheDocument();
  });

  it("the rotate instruction is actually visible to the player", () => {
    // AC2 of US-PWA-003 is "a full-screen overlay". The gate hides its own ancestor in portrait, so
    // the message renders but the player sees a blank screen.
    portrait = true;
    gate();
    expect(screen.getByTestId("orientation-hint")).toBeVisible();
  });

  it("reacts to the orientation change event", () => {
    gate();
    expect(screen.queryByTestId("orientation-hint")).toBeNull();
    rotate(true);
    expect(screen.getByTestId("orientation-hint")).toHaveTextContent(MESSAGE);
    rotate(false);
    expect(screen.queryByTestId("orientation-hint")).toBeNull();
  });
});
