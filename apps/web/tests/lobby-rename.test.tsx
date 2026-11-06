// @vitest-environment jsdom
/**
 * `US-AUTH-003` AC7 — a rename reaches the room the player is in.
 *
 * The Durable Object already handles the frame: `auth` on an open socket rewrites the member record in
 * the lobby, persists, and answers with `room_state` (`room-do.ts` `authenticate`). So no new frame type
 * is needed — the lobby only has to say the new identity once, and then render whatever `room_state`
 * says. This file proves "once": a mount sends nothing extra, an edit sends exactly one `auth`, and a
 * re-render caused by anything else sends nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { RoomMember, RoomState } from "@gbw/core";
import { LocaleProvider, SessionProvider, useSession } from "../src/app/providers";
import { updateSubject } from "../src/lib/session";
import { LobbyPage } from "../src/routes/LobbyPage";

type Frame = { t: string; [key: string]: unknown };
type Identity = { displayName: string; avatarId?: string };

const socket = vi.hoisted(() => ({
  deliver: null as ((frame: { t: string; [key: string]: unknown }) => void) | null,
  send: vi.fn(),
  authenticated: [] as { displayName: string; avatarId?: string }[],
}));

vi.mock("../src/net/signaling", () => ({
  connectRoom: (options: { displayName: string; avatarId?: string; onMessage: (frame: Frame) => void }) => {
    // The real `connectRoom` authenticates on open; the test records what it would have sent.
    socket.authenticated.push({ displayName: options.displayName, avatarId: options.avatarId });
    socket.deliver = options.onMessage;
    return { send: socket.send, close: vi.fn(), readyState: 1 };
  },
}));

const SELF_ID = "ply-self";
const PEER_ID = "ply-peer";
const SESSION = {
  token: "test-token",
  expiresAt: Date.now() + 3_600_000,
  subject: { kind: "account", accountId: "acc_1", displayName: "Bao", avatarId: "avatar-03" },
};

function member(overrides: Partial<RoomMember> & Pick<RoomMember, "playerId" | "displayName" | "slot" | "team">): RoomMember {
  return {
    accountId: null,
    guestId: `gst-${overrides.playerId}`,
    avatarId: "avatar-03",
    mobileId: "mbl-01",
    role: "player",
    connectionState: "connected",
    joinedAt: 1,
    seenConnected: true,
    ...overrides,
  };
}

function room(selfName = "Bao"): RoomState {
  return {
    roomCode: "ABCD",
    status: "lobby",
    hostPlayerId: PEER_ID,
    hostGeneration: 1,
    settings: { maxPlayers: 4, mode: "solo", mapId: "map-01", isPrivate: false },
    members: [
      member({ playerId: PEER_ID, displayName: "Chủ phòng", slot: 0, team: "A", role: "host" }),
      member({ playerId: SELF_ID, displayName: selfName, slot: 1, team: "B" }),
    ],
    createdAt: 1,
    lastActivityAt: 2,
    lastSnapshot: null,
  };
}

/**
 * Stands in for the profile screen, which lives on another route in the real app: it writes the edited
 * identity into the stored session and hands the provider the new object, which is exactly what
 * `ProfilePage` does after `PATCH /me` resolves.
 */
function EditIdentity(): React.JSX.Element {
  const { adopt } = useSession();
  const edit = (patch: { displayName?: string; avatarId?: string }): void => {
    const updated = updateSubject(patch);
    if (updated) adopt(updated);
  };
  return (
    <div>
      <button type="button" onClick={() => edit({ displayName: "Bao Moi" })}>
        rename
      </button>
      <button type="button" onClick={() => edit({ displayName: "Bao Moi" })}>
        rename-again
      </button>
      <button type="button" onClick={() => edit({ avatarId: "avatar-09" })}>
        new-avatar
      </button>
    </div>
  );
}

async function enterLobby(): Promise<void> {
  render(
    <LocaleProvider>
      <SessionProvider>
        <EditIdentity />
        <MemoryRouter initialEntries={["/lobby/ABCD"]}>
          <Routes>
            <Route path="/lobby/:code" element={<LobbyPage />} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </LocaleProvider>,
  );
  await screen.findByTestId("room-code");
  await act(async () => {
    socket.deliver?.({ t: "room_state", room: room() });
  });
}

const authFrames = (): Identity[] =>
  socket.send.mock.calls.map(([frame]) => frame as Frame).filter((frame) => frame.t === "auth");

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem("gbw.session", JSON.stringify(SESSION));
  // A returning member keeps the playerId the room already gave it, so no join is attempted.
  sessionStorage.setItem("gbw.room.ABCD", SELF_ID);
  socket.send.mockClear();
  socket.deliver = null;
  socket.authenticated.length = 0;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("US-AUTH-003 AC7: a rename reaches the lobby", () => {
  it("authenticates once on arrival and does not send a second auth frame", async () => {
    await enterLobby();

    expect(socket.authenticated).toEqual([{ displayName: "Bao", avatarId: "avatar-03" }]);
    expect(authFrames()).toEqual([]);
  });

  it("sends exactly one auth frame with the new name when the player renames", async () => {
    await enterLobby();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "rename" }));
    });

    expect(authFrames()).toEqual([
      { t: "auth", token: "test-token", displayName: "Bao Moi", mobileId: "mbl-01", avatarId: "avatar-03" },
    ]);
  });

  it("shows the peer's new name from the room_state the server answers with, without a reload", async () => {
    await enterLobby();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "rename" }));
    });
    await act(async () => {
      socket.deliver?.({ t: "room_state", room: room("Bao Moi") });
    });

    expect(within(screen.getByTestId("team-B")).getByText("Bao Moi")).toBeInTheDocument();
  });

  it("does not re-send for a re-render that leaves the identity alone", async () => {
    await enterLobby();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "rename" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "rename-again" }));
    });
    // Every room frame re-renders the lobby; the identity has not moved, so nothing goes out again.
    await act(async () => {
      socket.deliver?.({ t: "room_state", room: room("Bao Moi") });
      socket.deliver?.({ t: "peer_left", playerId: PEER_ID });
    });

    expect(authFrames()).toHaveLength(1);
  });

  it("TC-AUTH-149: the roster renders the avatar the room reports, so a pick shows up for peers", async () => {
    await enterLobby();
    expect(screen.getByTestId(`roster-avatar-${SELF_ID}`)).toHaveTextContent("03");

    await act(async () => {
      const updated = room();
      socket.deliver?.({
        t: "room_state",
        room: {
          ...updated,
          members: updated.members.map((entry) =>
            entry.playerId === SELF_ID ? { ...entry, avatarId: "avatar-09" } : entry,
          ),
        },
      });
    });

    // AC5: the choice appears in the roster from the next `room_state`, and no reload or rejoin is needed.
    expect(screen.getByTestId(`roster-avatar-${SELF_ID}`)).toHaveTextContent("09");
  });

  it("carries a new avatar on the same frame (AC5)", async () => {
    await enterLobby();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "new-avatar" }));
    });

    expect(authFrames()).toEqual([
      { t: "auth", token: "test-token", displayName: "Bao", mobileId: "mbl-01", avatarId: "avatar-09" },
    ]);
  });
});
