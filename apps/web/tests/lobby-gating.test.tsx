// @vitest-environment jsdom
/**
 * TC-ROOM-193 / TC-ROOM-198: what the lobby gates (`US-ROOM-003` AC4, `US-ROOM-006` AC5).
 *
 * The start button reads `canStart` from the room state the socket delivered, so the case needs no
 * server: the frame is the only input. The second case pins the other half of the room contract — a
 * lobby never starts the offer exchange, so seeing a peer join must not emit a `signal` frame.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { RoomMember, RoomState } from "@gbw/core";
import { LocaleProvider, SessionProvider } from "../src/app/providers";
import { LobbyPage } from "../src/routes/LobbyPage";

type Frame = { t: string; [key: string]: unknown };

const socket = vi.hoisted(() => ({
  deliver: null as ((frame: { t: string; [key: string]: unknown }) => void) | null,
  send: vi.fn(),
}));

vi.mock("../src/net/signaling", () => ({
  connectRoom: (options: { onMessage: (frame: Frame) => void }) => {
    socket.deliver = options.onMessage;
    return { send: socket.send, close: vi.fn(), readyState: 1 };
  },
}));

const SESSION = {
  token: "test-token",
  expiresAt: Date.now() + 3_600_000,
  subject: { kind: "guest", guestId: "gst-test", displayName: "Khách", avatarId: "av-01" },
};

const HOST_ID = "ply-host";
const GUEST_ID = "ply-guest";

function member(overrides: Partial<RoomMember> & Pick<RoomMember, "playerId" | "displayName" | "slot" | "team">): RoomMember {
  return {
    accountId: null,
    guestId: `gst-${overrides.playerId}`,
    avatarId: "av-01",
    mobileId: "mbl-01",
    role: "player",
    connectionState: "connected",
    joinedAt: 1,
    seenConnected: true,
    ...overrides,
  };
}

/** Four seats, in slot order, with the teams the caller asks for. */
function seats(teams: readonly ("A" | "B" | null)[]): RoomMember[] {
  return teams.map((team, slot) =>
    member({
      playerId: slot === 0 ? HOST_ID : slot === 1 ? GUEST_ID : `ply-${slot}`,
      displayName: `P${slot}`,
      slot,
      team,
      role: slot === 0 ? "host" : "player",
    }),
  );
}

function room(overrides: Partial<RoomState> = {}): RoomState {
  return {
    roomCode: "ABCD",
    status: "lobby",
    hostPlayerId: HOST_ID,
    hostGeneration: 1,
    settings: { maxPlayers: 4, mode: "solo", mapId: "map-01", isPrivate: false },
    members: seats(["A", "B"]),
    createdAt: 1,
    lastActivityAt: 2,
    lastSnapshot: null,
    ...overrides,
  };
}

async function enterLobby(state: RoomState) {
  render(
    <LocaleProvider>
      <SessionProvider>
        <MemoryRouter initialEntries={["/lobby/ABCD"]}>
          <Routes>
            <Route path="/lobby/:code" element={<LobbyPage />} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </LocaleProvider>,
  );
  await screen.findByTestId("room-code");
  expect(socket.deliver, "the lobby opened a room socket").not.toBeNull();
  act(() => socket.deliver?.({ t: "room_state", room: state }));
}

function deliverRoom(state: RoomState): void {
  act(() => socket.deliver?.({ t: "room_state", room: state }));
}

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem("gbw.session", JSON.stringify(SESSION));
  sessionStorage.setItem("gbw.room.ABCD", HOST_ID);
  socket.send.mockClear();
  socket.deliver = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TC-ROOM-193: the start button's gate", () => {
  it("stays disabled while a seat is empty and unlocks on four balanced seats", async () => {
    await enterLobby(room());
    expect(screen.getByTestId("start-match")).toBeDisabled();

    deliverRoom(room({ members: seats(["A", "B", "A", "B"]) }));
    expect(screen.getByTestId("start-match")).toBeEnabled();
  });

  it("stays disabled when a seated player has no team", async () => {
    await enterLobby(room({ members: seats(["A", "B", "A", null]) }));
    expect(screen.getByTestId("start-match")).toBeDisabled();
  });

  it("stays disabled when four seats of a six-seat room are filled", async () => {
    await enterLobby(
      room({
        settings: { maxPlayers: 6, mode: "solo", mapId: "map-01", isPrivate: false },
        members: seats(["A", "B", "A", "B"]),
      }),
    );
    expect(screen.getByTestId("start-match")).toBeDisabled();
  });
});

describe("TC-ROOM-198: the lobby does not signal", () => {
  it("seeing a peer join emits no signal frame", async () => {
    await enterLobby(room());
    act(() =>
      socket.deliver?.({
        t: "peer_joined",
        room: room({ members: seats(["A", "B", "A"]) }),
        member: seats(["A", "B", "A"])[2],
      }),
    );

    const frames = socket.send.mock.calls.map(([frame]) => frame as Frame);
    expect(frames.filter((frame) => frame.t === "signal")).toEqual([]);
    expect(frames.filter((frame) => frame.t === "snapshot_push")).toEqual([]);
  });
});
