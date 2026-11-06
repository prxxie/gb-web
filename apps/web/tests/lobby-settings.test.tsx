// @vitest-environment jsdom
/**
 * TC-ROOM-707: mode, map, capacity and loadout in the lobby (`US-ROOM-007`).
 *
 * The socket is the only source of truth here: the room state arrives as a `room_state` frame, the
 * host gets editable controls, everyone else gets the same values read-only. No network is touched.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ITEMS, type RoomMember, type RoomState } from "@gbw/core";
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
  return screen.getByTestId("room-code");
}

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem("gbw.session", JSON.stringify(SESSION));
  // A returning guest keeps the playerId the room already gave it, so `joinRoom` is never called.
  sessionStorage.setItem("gbw.room.ABCD", HOST_ID);
  socket.send.mockClear();
  socket.deliver = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TC-ROOM-707: the lobby's shared state", () => {
  it("shows the room code and the capacity from room_state", async () => {
    await enterLobby(room({ settings: { maxPlayers: 6, mode: "solo", mapId: "map-01", isPrivate: false } }));
    expect(screen.getByTestId("room-code")).toHaveTextContent("ABCD");
    expect(screen.getByText("2/6")).toBeInTheDocument();
  });

  it("the host sees the start button, a member sees the waiting note (AC1)", async () => {
    await enterLobby(room());
    expect(screen.getByTestId("start-match")).toBeInTheDocument();
    cleanup();

    sessionStorage.setItem("gbw.room.ABCD", GUEST_ID);
    await enterLobby(room());
    expect(screen.queryByTestId("start-match")).toBeNull();
    expect(screen.getByText("Đang chờ người chơi…")).toBeInTheDocument();
  });
});

describe("TC-ROOM-707: host editing (AC1, AC4)", () => {
  it("offers mode, map and capacity controls to the host", async () => {
    // AC1 names three editable settings: mode (4), map (11) and capacity (4/6/8). The lobby renders
    // only the mobile picker; there is no SettingsPanel.
    await enterLobby(room());
    expect(screen.getByRole("combobox", { name: "Chế độ" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Bản đồ" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Số người" })).toBeInTheDocument();
  });

  it("offers exactly the four modes and the four legal capacities", async () => {
    await enterLobby(room());
    const modes = screen.getByRole("combobox", { name: "Chế độ" });
    const capacities = screen.getByRole("combobox", { name: "Số người" });
    expect(modes.querySelectorAll("option")).toHaveLength(4);
    expect([...capacities.querySelectorAll("option")].map((option) => option.textContent)).toEqual(["4", "6", "8"]);
  });

  it("editing the capacity sends a room_settings frame, not a local-only change", async () => {
    await enterLobby(room());
    const capacities = screen.getByRole("combobox", { name: "Số người" });
    await act(async () => {
      (capacities as HTMLSelectElement).value = "8";
      capacities.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const settingsFrame = socket.send.mock.calls.map(([frame]) => frame as Frame).find((frame) => frame.t === "room_settings");
    expect(settingsFrame).toBeDefined();
    expect(settingsFrame).toMatchObject({ t: "room_settings", maxPlayers: 8 });
  });
});

describe("TC-ROOM-707: a member's view (AC1, AC5)", () => {
  it("non_host_sees_read_only_mode_select", async () => {
    sessionStorage.setItem("gbw.room.ABCD", GUEST_ID);
    await enterLobby(room());
    expect(screen.getByRole("combobox", { name: "Chế độ" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Bản đồ" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Số người" })).toBeDisabled();
  });

  it("reflects a map the host changed without a reload (AC5)", async () => {
    sessionStorage.setItem("gbw.room.ABCD", GUEST_ID);
    await enterLobby(room());
    act(() =>
      socket.deliver?.({
        t: "room_state",
        room: room({ settings: { maxPlayers: 4, mode: "tag", mapId: "map-07", isPrivate: false } }),
      }),
    );
    expect(screen.getByRole("combobox", { name: "Bản đồ" })).toHaveValue("map-07");
  });
});

describe("TC-ROOM-707: loadout (AC3, AC4)", () => {
  it("keeps the picker at eleven items across two pages of nine", async () => {
    // AC3: eleven items, two pages of nine cells; AC4: a twelfth item is refused visibly.
    await enterLobby(room());
    expect(screen.getByTestId("loadout-picker")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^loadout-page-/)).toHaveLength(2);
    expect(screen.getByText(/11/)).toBeInTheDocument();
  });

  it("pages nine cells at a time and each cell shows its quantity and delay cost (AC3)", async () => {
    await enterLobby(room());
    const pageOne = screen.getByTestId("loadout-page-0");
    expect(pageOne.querySelectorAll("[data-testid^='loadout-item-']")).toHaveLength(9);
    expect(pageOne.textContent).toMatch(/SL 0 · Độ trễ \+\d+/);

    await act(async () => {
      screen.getByRole("button", { name: /Sau/ }).click();
    });

    const pageTwo = screen.getByTestId("loadout-page-1");
    expect(pageTwo.querySelectorAll("[data-testid^='loadout-item-']")).toHaveLength(ITEMS.length - 9);
    expect(pageTwo.textContent).toMatch(/SL 0 · Độ trễ \+\d+/);
  });

  it("a full loadout refuses the twelfth item with a visible message (AC4)", async () => {
    sessionStorage.setItem("gbw.room.ABCD", GUEST_ID);
    await enterLobby(
      room({
        members: [
          member({ playerId: HOST_ID, displayName: "Chủ phòng", slot: 0, team: "A", role: "host" }),
          member({
            playerId: GUEST_ID,
            displayName: "Khách",
            slot: 1,
            team: "B",
            loadout: [{ id: "itm-grenade", qty: 11 }],
          }),
        ],
      }),
    );

    expect(screen.getByText("Đã chọn 11/11")).toBeInTheDocument();
    expect(screen.getByText("Chỉ mang được tối đa 11 vật phẩm.")).toBeInTheDocument();
    for (const button of screen.getAllByRole("button", { name: /^Thêm / })) {
      expect(button).toBeDisabled();
    }
  });

  it("a guest is offered the same eleven items as the host (AC6)", async () => {
    sessionStorage.setItem("gbw.room.ABCD", GUEST_ID);
    await enterLobby(room());

    const cells = [...document.querySelectorAll("[data-testid^='loadout-item-']")].map((cell) =>
      cell.getAttribute("data-testid"),
    );
    expect(cells).toHaveLength(9);
    const picked = screen.getAllByRole("button", { name: /^Thêm / });
    expect(picked).toHaveLength(9);
    for (const button of picked) expect(button).toBeEnabled();
    await act(async () => {
      screen.getByRole("button", { name: /Sau/ }).click();
    });
    expect(document.querySelectorAll("[data-testid^='loadout-item-']")).toHaveLength(ITEMS.length - 9);
  });
});
