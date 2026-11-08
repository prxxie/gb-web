// @vitest-environment jsdom
/**
 * TC-ROOM-713: one seat per page load (`US-ROOM-007` AC7).
 *
 * A dev build runs a mount effect twice (`StrictMode`). Two `POST /join` calls for one page used to be two players
 * asking for two seats: the second found the room full (`409`), the page read that as "no seat" and bounced the
 * player back to the menu — taking the mobile pick with it. The join is shared between mounts, and a settled answer
 * is never replayed to a later one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { RoomState } from "@gbw/core";
import { LocaleProvider, SessionProvider } from "../src/app/providers";
import { LobbyPage } from "../src/routes/LobbyPage";

type Frame = { t: string; [key: string]: unknown };

const socket = vi.hoisted(() => ({
  deliver: null as ((frame: { t: string; [key: string]: unknown }) => void) | null,
  send: vi.fn(),
  connect: vi.fn(),
}));

vi.mock("../src/net/signaling", () => ({
  connectRoom: (options: { wsUrl: string; onMessage: (frame: Frame) => void }) => {
    socket.deliver = options.onMessage;
    socket.connect(options.wsUrl);
    return { send: socket.send, close: vi.fn(), readyState: 1 };
  },
}));

const joinRoom = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/api", () => ({ api: { joinRoom } }));

const SESSION = {
  token: "test-token",
  expiresAt: Date.now() + 3_600_000,
  subject: { kind: "guest", guestId: "gst-test", displayName: "Khách", avatarId: "av-01" },
};

const SELF_ID = "ply-new";

function room(): RoomState {
  return {
    roomCode: "ABCD",
    status: "lobby",
    hostPlayerId: SELF_ID,
    hostGeneration: 1,
    settings: { maxPlayers: 4, mode: "solo", mapId: "map-01", isPrivate: false },
    members: [
      {
        playerId: SELF_ID,
        accountId: null,
        guestId: "gst-test",
        avatarId: "av-01",
        displayName: "Khách",
        mobileId: "mbl-01",
        slot: 0,
        team: "A",
        role: "host",
        connectionState: "connected",
        joinedAt: 1,
        seenConnected: true,
      },
    ],
    createdAt: 1,
    lastActivityAt: 2,
    lastSnapshot: null,
  };
}

function renderLobby() {
  render(
    <StrictMode>
      <LocaleProvider>
        <SessionProvider>
          <MemoryRouter initialEntries={["/lobby/ABCD"]}>
            <Routes>
              <Route path="/lobby/:code" element={<LobbyPage />} />
            </Routes>
          </MemoryRouter>
        </SessionProvider>
      </LocaleProvider>
    </StrictMode>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem("gbw.session", JSON.stringify(SESSION));
  joinRoom.mockReset();
  joinRoom.mockImplementation(async () => ({ playerId: SELF_ID, roomCode: "ABCD", maxPlayers: 4 }));
  socket.send.mockClear();
  socket.connect.mockClear();
  socket.deliver = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TC-ROOM-713: one join per page load (AC7)", () => {
  it("shares one POST /join between the two mounts of a StrictMode effect", async () => {
    renderLobby();
    await screen.findByTestId("room-code");

    // The effect waits for the stored session before it joins, so the call lands a tick after first paint.
    await waitFor(() => expect(joinRoom).toHaveBeenCalledTimes(1));
    expect(sessionStorage.getItem("gbw.room.ABCD")).toBe(SELF_ID);
  });

  it("opens the room's socket once the join hands back a seat", async () => {
    renderLobby();
    await screen.findByTestId("room-code");

    await waitFor(() => expect(socket.connect).toHaveBeenCalledWith(expect.stringContaining("/api/v1/rooms/ABCD/ws")));
    act(() => socket.deliver?.({ t: "room_state", room: room() }));
    expect(screen.getByTestId("room-code")).toHaveTextContent("ABCD");
  });

  it("does not replay a settled join to a later mount", async () => {
    renderLobby();
    await screen.findByTestId("room-code");
    await waitFor(() => expect(joinRoom).toHaveBeenCalledTimes(1));

    // A second page in the same tab: the stored seat short-circuits the join, and nothing is replayed either.
    cleanup();
    renderLobby();
    await screen.findByTestId("room-code");
    // Give that mount's effect the same tick the first one needed; a replayed join would land here.
    await act(async () => {});

    expect(joinRoom).toHaveBeenCalledTimes(1);
  });
});
