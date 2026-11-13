// @vitest-environment jsdom
/**
 * TC-ROOM-709: choosing a mobile in the lobby (`US-ROOM-007` AC7).
 *
 * The grid shows the shipped roster once per team tint; the pick is a `loadout` frame, and what the grid
 * shows afterwards is the member record the room broadcast — never a local copy, or the pick would not
 * survive the reconnect the AC is about.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MOBILES, type RoomMember, type RoomState } from "@gbw/core";
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

function room(overrides: Partial<RoomState> = {}): RoomState {
  return {
    roomCode: "ABCD",
    status: "lobby",
    hostPlayerId: HOST_ID,
    hostGeneration: 1,
    settings: { maxPlayers: 4, mode: "solo", mapId: "map-01", isPrivate: false },
    members: [
      member({ playerId: HOST_ID, displayName: "Chủ phòng", slot: 0, team: "A", role: "host" }),
      member({ playerId: GUEST_ID, displayName: "Khách", slot: 1, team: "B" }),
    ],
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

/** The last `loadout` frame the lobby sent, if any. */
function loadoutFrame(): Frame | undefined {
  return socket.send.mock.calls.map(([frame]) => frame as Frame).filter((frame) => frame.t === "loadout").pop();
}

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem("gbw.session", JSON.stringify(SESSION));
  // A returning guest keeps the playerId the room already gave it, so `joinRoom` is never called.
  sessionStorage.setItem("gbw.room.ABCD", GUEST_ID);
  socket.send.mockClear();
  socket.deliver = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TC-ROOM-709: the grid (AC7)", () => {
  it("shows every mobile once, in both team tints", async () => {
    await enterLobby(room());

    const cells = [...document.querySelectorAll("[data-testid^='mobile-cell-']")];
    expect(cells).toHaveLength(MOBILES.length);
    // TC-BAL-132: the shrinkage is the point — seventeen cards, one per shipped machine (`US-BAL-005` AC2).
    expect(cells).toHaveLength(17);
    expect(MOBILES.map((mobile) => mobile.mobileId)).not.toContain("mbl-06");
    expect(MOBILES.map((mobile) => mobile.mobileId)).not.toContain("mbl-08");
    expect(MOBILES.map((mobile) => mobile.mobileId)).not.toContain("mbl-16");
    expect(cells.map((cell) => cell.getAttribute("data-testid"))).toEqual(MOBILES.map((mobile) => `mobile-cell-${mobile.mobileId}`));

    for (const mobile of MOBILES) {
      expect(screen.getByTestId(`mobile-tint-${mobile.mobileId}-A`)).toBeInTheDocument();
      expect(screen.getByTestId(`mobile-tint-${mobile.mobileId}-B`)).toBeInTheDocument();
    }
  });

  it("marks the mobile the room has for me, not the first in the list", async () => {
    await enterLobby(
      room({
        members: [
          member({ playerId: HOST_ID, displayName: "Chủ phòng", slot: 0, team: "A", role: "host" }),
          member({ playerId: GUEST_ID, displayName: "Khách", slot: 1, team: "B", mobileId: "mbl-11" }),
        ],
      }),
    );

    expect(screen.getByTestId("mobile-cell-mbl-11")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("mobile-cell-mbl-01")).toHaveAttribute("aria-pressed", "false");
  });

  it("picking a mobile sends the loadout with that id", async () => {
    await enterLobby(
      room({
        members: [
          member({ playerId: HOST_ID, displayName: "Chủ phòng", slot: 0, team: "A", role: "host" }),
          member({ playerId: GUEST_ID, displayName: "Khách", slot: 1, team: "B", loadout: [{ id: "itm-blood", qty: 2 }] }),
        ],
      }),
    );

    await act(async () => {
      screen.getByTestId("mobile-cell-mbl-07").click();
    });

    // Only the mobile travels: re-sending `items` would overwrite what another tab may have just built.
    expect(loadoutFrame()).toEqual({ t: "loadout", mobileId: "mbl-07" });
  });

  it("drops a pick the room did not keep", async () => {
    await enterLobby(room());

    await act(async () => {
      screen.getByTestId("mobile-cell-mbl-07").click();
    });
    // The click shows at once, but the member record the room broadcasts is what the grid believes.
    expect(screen.getByTestId("mobile-cell-mbl-07")).toHaveAttribute("aria-pressed", "true");

    act(() => socket.deliver?.({ t: "room_state", room: room() }));
    expect(screen.getByTestId("mobile-cell-mbl-07")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("mobile-cell-mbl-01")).toHaveAttribute("aria-pressed", "true");
  });

  it("drops the highlight when the room refuses the pick", async () => {
    await enterLobby(room());
    act(() => socket.deliver?.({ t: "room_state", room: room() }));

    await act(async () => {
      screen.getByTestId("mobile-cell-mbl-12").click();
    });
    act(() => socket.deliver?.({ t: "error", code: "rate-limited", detail: "too many frames" }));

    // The record is the truth (`US-ROOM-007` AC7): a frame the room dropped must not look saved.
    expect(screen.getByTestId("mobile-cell-mbl-12")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("mobile-cell-mbl-01")).toHaveAttribute("aria-pressed", "true");
  });

  it("lets two members hold the same mobile", async () => {
    // Both seats on `mbl-05`: the room accepts it, so the grid must not blank a cell or drop a seat.
    await enterLobby(
      room({
        members: [
          member({ playerId: HOST_ID, displayName: "Chủ phòng", slot: 0, team: "A", role: "host", mobileId: "mbl-05" }),
          member({ playerId: GUEST_ID, displayName: "Khách", slot: 1, team: "B", mobileId: "mbl-05" }),
        ],
      }),
    );

    expect(document.querySelectorAll("[data-testid^='mobile-cell-']")).toHaveLength(MOBILES.length);
    expect(screen.getByTestId("mobile-cell-mbl-05")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("team-A")).toHaveTextContent("Chủ phòng");
    expect(screen.getByTestId("team-B")).toHaveTextContent("Khách");
  });

  it("reopens on the mobile the room already stored, sending nothing", async () => {
    const seated = room({
      members: [
        member({ playerId: HOST_ID, displayName: "Chủ phòng", slot: 0, team: "A", role: "host" }),
        member({ playerId: GUEST_ID, displayName: "Khách", slot: 1, team: "B", mobileId: "mbl-09" }),
      ],
    });
    await enterLobby(seated);

    // A reload hands the page a `room_state` and no local pick, so the grid can only show what the room stored;
    // the worker's half of "the pick survives a reconnect" lives in `apps/worker/tests/room-settings.test.ts`.
    cleanup();
    sessionStorage.setItem("gbw.room.ABCD", GUEST_ID);
    await enterLobby(seated);

    expect(screen.getByTestId("mobile-cell-mbl-09")).toHaveAttribute("aria-pressed", "true");
    expect(loadoutFrame()).toBeUndefined();
  });
});
