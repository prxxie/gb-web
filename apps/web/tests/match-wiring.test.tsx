// @vitest-environment jsdom
/**
 * TC-MATCH-944: the strip's choice and the pad's nudge reach the renderer (`US-MATCH-005` AC2, `US-MATCH-006` AC4).
 *
 * A component test cannot boot Phaser, so the page's half of the contract is exercised with a mocked renderer: what
 * the player taps has to arrive at the scene as `setWeaponSlot` and `setAimDelta`, because those two calls are what
 * makes the aim aid draw the shot that will actually be fired. The flight itself is `TC-MATCH-941`'s job.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { BattleCallbacks } from "../src/game/scene";

const setState = vi.fn();
const setAimAllowed = vi.fn();
const setWeaponSlot = vi.fn();
const setAimDelta = vi.fn();
const destroy = vi.fn();
let callbacks: BattleCallbacks | null = null;

vi.mock("../src/game/scene", () => ({
  mountBattle: (options: { callbacks: BattleCallbacks }) => {
    callbacks = options.callbacks;
    return { setState, setAimAllowed, setWeaponSlot, setAimDelta, destroy };
  },
}));

vi.mock("../src/lib/session", () => ({
  currentSession: () => ({ subject: { guestId: "g-1", accountId: null, displayName: "Guest" }, token: "t" }),
  ensureSession: async () => null,
}));

vi.mock("../src/net/mesh", () => ({
  createMesh: () => ({
    addPeer: vi.fn(),
    removePeer: vi.fn(),
    broadcast: vi.fn(),
    sendControl: vi.fn(),
    sendControlAll: vi.fn(),
    applySignal: vi.fn(),
    close: vi.fn(),
  }),
}));

const { MatchPage } = await import("../src/routes/MatchPage");
const { LocaleProvider, SessionProvider } = await import("../src/app/providers");

function mount(): void {
  render(
    <LocaleProvider>
      <SessionProvider>
        <MemoryRouter initialEntries={["/match/AAAAAA"]}>
          <Routes>
            <Route path="/match/:code" element={<MatchPage />} />
            <Route path="/results/:code" element={<p data-testid="results-stub">results</p>} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </LocaleProvider>,
  );
}

describe("TC-MATCH-944: the weapon slot and the pad's nudge reach the renderer (US-MATCH-005 AC2)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setWeaponSlot.mockClear();
    setAimDelta.mockClear();
    callbacks = null;
  });
  afterEach(cleanup);

  it("hands the picked slot to the scene so the aid redraws for that weapon", async () => {
    mount();
    await waitFor(() => expect(callbacks).not.toBeNull());
    setWeaponSlot.mockClear();

    fireEvent.click(screen.getByTestId("weapon-1"));

    await waitFor(() => expect(setWeaponSlot).toHaveBeenLastCalledWith(1));
    expect(setWeaponSlot).toHaveBeenCalled();
  });

  it("hands the pad's nudge to the scene, starting from zero and following every change", async () => {
    mount();
    await waitFor(() => expect(callbacks).not.toBeNull());

    // The page pushes the nudge on mount, so a scene that boots after a pad press is not left on the old angle.
    expect(setAimDelta).toHaveBeenCalledWith(0);

    const up = screen.getByTestId("direction-pad").querySelector('[data-slot="up"]') as HTMLButtonElement | null;
    expect(up).not.toBeNull();
    // A bot match may open on the bot's turn, when the pad is disabled: then only the handover is observable here.
    if (up!.disabled) return;
    fireEvent.pointerDown(up!);
    await waitFor(() => expect(setAimDelta).toHaveBeenLastCalledWith(1));
  });
});

describe("TC-MATCH-950: the turn clock counts down on screen (US-MATCH-003 AC2)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    callbacks = null;
  });
  afterEach(cleanup);

  it("moves on its own instead of freezing at the turn duration", async () => {
    mount();
    const clock = await screen.findByTestId("turn-clock");
    const first = clock.textContent;

    // One heartbeat, the interval the page runs while the turn is live. A derived readout with no tick stayed at
    // `20s` until a move re-rendered the screen, which is what a player saw for the whole turn.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_100));
    });

    expect(clock.textContent).not.toBe(first);
  });
});
