// @vitest-environment jsdom
/**
 * `US-MATCH-001` AC7 — "the match ends, the render loop stops and the results screen takes over without a
 * reload".
 *
 * The renderer is mocked: a Phaser scene cannot boot in jsdom, and this file is about the *page's* half of the
 * contract — destroy the handle when the match ends, write the result payload, navigate once. The engine's half
 * (a wiped team ends the match) belongs to the mode cases in `packages/core/tests`, not here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { BattleCallbacks } from "../src/game/scene";

const destroy = vi.fn();
const setState = vi.fn();
let callbacks: BattleCallbacks | null = null;

vi.mock("../src/game/scene", () => ({
  mountBattle: (options: { callbacks: BattleCallbacks }) => {
    callbacks = options.callbacks;
    return { setState, destroy };
  },
}));

/** End the match on the first input, so the page's `status === "ended"` path runs without a physics simulation. */
vi.mock("@gbw/core", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    applyInput: (state: { players: readonly { team: "A" | "B" }[]; seq: number }) => ({
      state: { ...state, status: "ended", winnerTeam: state.players[0]?.team ?? "A", seq: state.seq + 1, turn: { ...(state as { turn?: object }).turn, activeSlot: 0 } },
      events: [{ kind: "end", winner: state.players[0]?.team ?? "A", scores: { A: 0, B: 0 } }],
    }),
  };
});

vi.mock("../src/lib/session", () => ({
  currentSession: () => ({ subject: { guestId: "g-1", accountId: null, displayName: "Guest" }, token: "t" }),
  ensureSession: async () => null,
}));

vi.mock("../src/net/mesh", () => ({
  createMesh: () => ({ addPeer: vi.fn(), removePeer: vi.fn(), broadcast: vi.fn(), sendControl: vi.fn(), sendControlAll: vi.fn(), applySignal: vi.fn(), close: vi.fn() }),
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

describe("TC-MATCH-926: a finished match stops the render loop and hands over to the results (US-MATCH-001 AC7)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    destroy.mockClear();
    setState.mockClear();
    callbacks = null;
  });
  afterEach(cleanup);

  it("destroys the battle handle, writes the result payload once and routes to the results screen", async () => {
    mount();
    await waitFor(() => expect(callbacks).not.toBeNull());

    // The renderer reports a shot; the (mocked) engine answers with a finished match.
    callbacks!.onRelease(16, 45);

    await waitFor(() => expect(screen.getByTestId("results-stub")).toBeTruthy());
    expect(destroy).toHaveBeenCalled();

    const raw = sessionStorage.getItem("gbw.result");
    expect(raw).not.toBeNull();
    const payload = JSON.parse(raw!) as Record<string, unknown>;
    expect(payload["roomCode"]).toBe("AAAAAA");
    // AC6 of `US-CORE-010` rides on the same payload: the screen needs the condition, not just the winner.
    expect(payload["winCondition"]).toBe("elimination");
    expect(payload["winnerTeam"]).toBe("A");
  });

  it("does not write a second result if another shot arrives after the end", async () => {
    mount();
    await waitFor(() => expect(callbacks).not.toBeNull());
    callbacks!.onRelease(16, 45);
    await waitFor(() => expect(screen.getByTestId("results-stub")).toBeTruthy());
    const first = sessionStorage.getItem("gbw.result");
    callbacks!.onRelease(20, 60);
    expect(sessionStorage.getItem("gbw.result")).toBe(first);
  });
});
