// @vitest-environment jsdom
/**
 * TC-NET-909: authority follows `host_changed` (`US-NET-003` AC1, AC2).
 *
 * The page used to read the host from the lobby plan, which never changes: after an election the promoted peer kept
 * sending inputs to a dead host, and the old host kept simulating. The snapshot the DO sent with the promotion was
 * ignored as well, so nothing was published until the next turn. This walks the wiring: who simulates, who publishes,
 * and what the first publish carries.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { BattleCallbacks } from "../src/game/scene";
import { RULESET_VERSION, type ServerMessage } from "@gbw/core";
import { rejectionCounts, resetRejections } from "../src/net/diagnostics";

const setState = vi.fn();
const setAimAllowed = vi.fn();
const setWeaponSlot = vi.fn();
const setAimDelta = vi.fn();
const destroy = vi.fn();
const broadcast = vi.fn();
const sendControlAll = vi.fn();
const socketSend = vi.fn();
const meshClose = vi.fn();
let callbacks: BattleCallbacks | null = null;
let onMessage: ((message: ServerMessage) => void) | null = null;
let onSnapshot: ((snapshot: unknown) => void) | null = null;

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
  createMesh: (options: { onSnapshot?: (snapshot: unknown) => void }) => {
    onSnapshot = options.onSnapshot ?? null;
    return {
      addPeer: vi.fn(),
      removePeer: vi.fn(),
      broadcast,
    ready: () => true,
      sendControl: vi.fn(),
      sendControlAll,
      applySignal: vi.fn(),
      close: meshClose,
    };
  },
}));

vi.mock("../src/net/reconnect", () => ({
  connectWithReconnect: (options: { onMessage: (message: ServerMessage) => void }) => {
    onMessage = options.onMessage;
    return { send: socketSend, close: vi.fn() };
  },
}));

const { MatchPage } = await import("../src/routes/MatchPage");
const { LocaleProvider, SessionProvider } = await import("../src/app/providers");

const SEATS = [
  { slot: 0, team: "A", accountId: null, displayName: "Host", mobileId: "mbl-01" },
  { slot: 1, team: "B", accountId: null, displayName: "Peer", mobileId: "mbl-02" },
] as const;

const MEMBERS = [
  { playerId: "host-1", slot: 0, connectionState: "grace" },
  { playerId: "peer-2", slot: 1, connectionState: "connected" },
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

const SNAPSHOT = {
  seq: 87,
  hostGeneration: 4,
  turn: { number: 7, activeSlot: 0, deadlineAt: 9_999, round: 2, extended: false, actedSlots: [] },
  weather: { wind: { magnitude: 25, sector: 3, directionDeg: 90 }, rolledAtRound: 2 },
  players: [
    { slot: 0, hp: 800, shield: 150, energy: 100, x: 900, y: 820, facing: 1, delay: 100, eliminated: false, weaponSlot: 0 },
    { slot: 1, hp: 700, shield: 0, energy: 100, x: 1_100, y: 820, facing: -1, delay: 0, eliminated: false, weaponSlot: 1 },
  ],
  projectiles: [],
  scores: { score: { A: 0, B: 0 }, activeTeam: "A", jewels: [] },
  status: "playing",
  winnerTeam: null,
  rulesetVersion: RULESET_VERSION,
} as const;

function hostChanged(to: string): ServerMessage {
  return {
    t: "host_changed",
    hostPlayerId: to,
    hostGeneration: 5,
    lastSnapshot: SNAPSHOT,
    room: { code: "AAAAAA", hostPlayerId: to, hostGeneration: 5, status: "playing", members: [...MEMBERS] },
  } as unknown as ServerMessage;
}

describe("TC-NET-909: the promotion moves the simulation (US-NET-003 AC1, AC2)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    broadcast.mockClear();
    sendControlAll.mockClear();
    socketSend.mockClear();
    meshClose.mockClear();
    callbacks = null;
    onMessage = null;
  });
  afterEach(cleanup);

  it("a promoted peer adopts the snapshot and publishes it at the bumped generation", async () => {
    plan("peer");
    mount();
    await waitFor(() => expect(onMessage).not.toBeNull());

    // The old host drives the turn until it dies; the peer only renders.
    expect(broadcast).not.toHaveBeenCalled();

    act(() => onMessage!(hostChanged("peer-2")));

    await waitFor(() => expect(broadcast).toHaveBeenCalled());
    const published = broadcast.mock.calls.at(-1)![0] as { seq: number; hostGeneration: number };
    expect(published.seq).toBe(88);
    expect(published.hostGeneration).toBe(5);
    // The same publish also has to reach the DO, so a client that reconnects inside the grace window gets it.
    const pushed = socketSend.mock.calls.at(-1)![0] as { t: string; snapshot: { s: number } };
    expect(pushed.t).toBe("snapshot_push");
    expect(pushed.snapshot.s).toBe(88);
  });

  it("the demoted host stops simulating and sends its shots as inputs", async () => {
    plan("host");
    mount();
    await waitFor(() => expect(callbacks).not.toBeNull());

    act(() => onMessage!(hostChanged("peer-2")));
    await waitFor(() => expect(meshClose).toHaveBeenCalled());

    broadcast.mockClear();
    sendControlAll.mockClear();
    callbacks!.onRelease?.(0.5, 0);

    await waitFor(() => expect(sendControlAll).toHaveBeenCalled());
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("drops and counts a snapshot from the host that lost the election", async () => {
    plan("peer");
    mount();
    await waitFor(() => expect(onSnapshot).not.toBeNull());
    act(() => onMessage!(hostChanged("peer-2")));
    await waitFor(() => expect(onSnapshot).not.toBeNull());

    setState.mockClear();
    resetRejections();
    // Generation 4 is what the old host was on; the promotion moved the room to 5.
    act(() => onSnapshot!({ ...SNAPSHOT }));
    expect(rejectionCounts().snapshot).toBe(1);
    expect(setState).not.toHaveBeenCalled();

    // The current host's snapshot still lands.
    act(() => onSnapshot!({ ...SNAPSHOT, seq: 90, hostGeneration: 5 }));
    expect(rejectionCounts().snapshot).toBe(1);
  });
});
