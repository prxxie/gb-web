// @vitest-environment jsdom
/**
 * TC-MATCH-949: a phrase crosses the wire as an id and lands above the sender's chip
 * (`US-MATCH-004` AC3, AC5, AC6).
 *
 * The screen used to run `applyInput` for a chat and show a bubble in **its own** corner: nothing was sent, so the
 * other players never saw a word, and the banner named whoever was looking. This walks both directions — a peer taps,
 * the host fans out — and checks that what crosses is `{kind, id}` and nothing else (AC7).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ServerMessage } from "@gbw/core";

const setState = vi.fn();
const broadcast = vi.fn();
const sendControl = vi.fn();
const sendControlAll = vi.fn();
const socketSend = vi.fn();
let onMessage: ((message: ServerMessage) => void) | null = null;
let onControl: ((from: string, message: unknown) => void) | null = null;

vi.mock("../src/game/scene", () => ({
  mountBattle: () => {
    return {
      setState,
      setAimAllowed: vi.fn(),
      setWeaponSlot: vi.fn(),
      setAimDelta: vi.fn(),
      setAimAid: vi.fn(),
      destroy: vi.fn(),
    };
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
  createMesh: (options: { onControl?: (from: string, message: unknown) => void }) => {
    onControl = options.onControl ?? null;
    return {
      addPeer: vi.fn(),
      removePeer: vi.fn(),
      broadcast,
      ready: () => true,
      sendControl,
      sendControlAll,
      applySignal: vi.fn(),
      close: vi.fn(),
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
  { slot: 2, team: "A", accountId: null, displayName: "Third", mobileId: "mbl-03" },
] as const;

const MEMBERS = [
  { playerId: "host-1", slot: 0, connectionState: "connected" },
  { playerId: "peer-2", slot: 1, connectionState: "connected" },
  { playerId: "peer-3", slot: 2, connectionState: "connected" },
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
      maxPlayers: 3,
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

function roomState(): ServerMessage {
  return {
    t: "room_state",
    room: { code: "AAAAAA", hostPlayerId: "host-1", hostGeneration: 1, status: "playing", members: [...MEMBERS] },
  } as unknown as ServerMessage;
}

describe("TC-MATCH-949: a phrase travels as an id (US-MATCH-004 AC3, AC5, AC6, AC7)", () => {
  beforeEach(() => {
    // `localStorage` is absent in an opaque-origin jsdom; the match no longer needs it to render, so a missing store
    // must not fail the wiring check.
    sessionStorage.clear();
    globalThis.localStorage?.clear();
    broadcast.mockClear();
    sendControl.mockClear();
    sendControlAll.mockClear();
    socketSend.mockClear();
    onMessage = null;
    onControl = null;
  });
  afterEach(cleanup);

  it("a peer sends only the id, and sees the banner in its own cell", async () => {
    plan("peer");
    mount();
    await waitFor(() => expect(onMessage).not.toBeNull());
    act(() => onMessage!(roomState()));

    act(() => screen.getByTestId("chat-toggle").click());
    act(() => screen.getByTestId("phrase-phrase-01").click());

    const sent = sendControlAll.mock.calls.at(-1)?.[0] as { t: string; kind: string; id: string };
    expect(sent).toEqual({ t: "chat", kind: "quick_phrase", id: "phrase-01" });
    expect("text" in sent).toBe(false);
    expect(broadcast).not.toHaveBeenCalled();
    // The banner belongs to the sender's chip — slot 1 — not to whoever is looking.
    expect(screen.getByTestId("chat-toast-1").textContent).toBe("Chào nhé!");
  });

  it("the host shows a peer's emote above that peer's chip and passes it on", async () => {
    plan("host");
    mount();
    await waitFor(() => expect(onControl).not.toBeNull());
    act(() => onMessage!(roomState()));

    act(() => onControl!("peer-2", { t: "chat", kind: "emote", id: "emote-02" }));

    expect(screen.getByTestId("chat-toast-1").textContent).toBe("Giận");
    // Forwarded to the third member, never echoed back to the sender.
    const forwarded = sendControl.mock.calls.map((call) => call[0] as string);
    expect(forwarded).toEqual(["peer-3"]);
    expect(sendControl.mock.calls[0]?.[1]).toEqual({ t: "chat", kind: "emote", id: "emote-02" });
  });

  it("drops a chat frame with a free-text field", async () => {
    plan("host");
    mount();
    await waitFor(() => expect(onControl).not.toBeNull());
    act(() => onMessage!(roomState()));

    act(() => onControl!("peer-2", { t: "chat", kind: "quick_phrase", id: "phrase-01", text: "hello" }));

    expect(sendControl).not.toHaveBeenCalled();
    expect(screen.queryByTestId("chat-toast-1")).toBeNull();
  });
});
