// @vitest-environment jsdom
/**
 * TC-NET-906: a peer sends its shot and does not simulate it (`US-NET-002` AC1).
 *
 * The star has one simulation. Before this pass every client applied its own input and broadcast the result, so an
 * online room had as many simulations as players and the DO refused the peers' pushes. The renderer is mocked (Phaser
 * cannot boot in jsdom); what matters here is which way the page sends.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { BattleCallbacks } from "../src/game/scene";

const setState = vi.fn();
const setAimAllowed = vi.fn();
const setWeaponSlot = vi.fn();
const setAimDelta = vi.fn();
const destroy = vi.fn();
const broadcast = vi.fn();
const sendControlAll = vi.fn();
let callbacks: BattleCallbacks | null = null;
let meshBuiltCount = 0;

function meshBuilt(): boolean {
  return meshBuiltCount > 0;
}

vi.mock("../src/game/scene", () => ({
  mountBattle: (options: { callbacks: BattleCallbacks }) => {
    callbacks = options.callbacks;
    return { setState, setAimAllowed, setWeaponSlot, setAimDelta, destroy };
  },
}));

vi.mock("../src/lib/api", async (importOriginal) => {
  const real = await importOriginal<{ api: Record<string, unknown> }>();
  return { api: { ...real.api, turnCredentials: async () => ({ iceServers: [{ urls: "turn:test" }] }) } };
});

vi.mock("../src/lib/session", () => ({
  currentSession: () => ({ subject: { guestId: "g-1", accountId: null, displayName: "Guest" }, token: "t" }),
  ensureSession: async () => null,
}));

vi.mock("../src/net/mesh", () => ({
  createMesh: () => {
    meshBuiltCount += 1;
    return {
    addPeer: vi.fn(),
    removePeer: vi.fn(),
    broadcast,
    ready: () => true,
    sendControl: vi.fn(),
    sendControlAll,
    applySignal: vi.fn(),
    close: vi.fn(),
    };
  },
}));

const { MatchPage } = await import("../src/routes/MatchPage");
const { LocaleProvider, SessionProvider } = await import("../src/app/providers");

const SEATS = [
  { slot: 0, team: "A", accountId: null, displayName: "Host", mobileId: "mbl-01" },
  { slot: 1, team: "B", accountId: null, displayName: "Peer", mobileId: "mbl-02" },
] as const;

function plan(role: "host" | "peer"): void {
  sessionStorage.setItem(
    "gbw.match",
    JSON.stringify({
      kind: "online",
      roomCode: "AAAAAA",
      localSlot: role === "host" ? 0 : 1,
      playerId: role === "host" ? "host-1" : "peer-2",
      seats: SEATS,
      seed: "seed-1",
      mapId: "map-01",
      mode: "solo",
      maxPlayers: 2,
      hostPlayerId: "host-1",
    }),
  );
}

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

describe("TC-NET-906: a peer sends its shot, the host simulates it (US-NET-002 AC1)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    broadcast.mockClear();
    sendControlAll.mockClear();
    meshBuiltCount = 0;
    callbacks = null;
  });
  afterEach(cleanup);

  it("puts the shot on the control channel instead of applying it locally", async () => {
    plan("peer");
    mount();
    await waitFor(() => expect(callbacks).not.toBeNull());

    await waitFor(() => expect(meshBuilt()).toBe(true));
    callbacks!.onRelease?.(0.5, 0);

    await waitFor(() => expect(sendControlAll).toHaveBeenCalled());
    const frame = sendControlAll.mock.calls[0]![0] as Record<string, unknown>;
    expect(frame).toMatchObject({ t: "input", kind: "fire", turn: 1 });
    expect(typeof frame["angle"]).toBe("number");
    expect(typeof frame["force"]).toBe("number");
    // A peer must not publish a simulation it did not run.
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("lets the host apply and publish the same shot", async () => {
    plan("host");
    mount();
    await waitFor(() => expect(callbacks).not.toBeNull());

    await waitFor(() => expect(meshBuilt()).toBe(true));
    callbacks!.onRelease?.(0.5, 0);

    await waitFor(() => expect(broadcast).toHaveBeenCalled());
    expect(sendControlAll).not.toHaveBeenCalled();
  });
});
