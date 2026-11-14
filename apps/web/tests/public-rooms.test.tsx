// @vitest-environment jsdom
/**
 * TC-ROOM-725 / TC-ROOM-726 / TC-ROOM-728 — the main-menu public-room browser (`US-ROOM-013`).
 *
 * The API client is mocked at its module boundary. These cases exercise the states a player sees: nothing loads
 * until the dialog opens, a filter or refresh makes one request, stale selections stay inline, and the room
 * visibility choice travels on create.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LocaleProvider, SessionProvider } from "../src/app/providers";
import { ApiError } from "../src/lib/api";
import { MainPage } from "../src/routes/MainPage";
import copy from "../src/i18n/vi.json";
import type * as ApiModule from "../src/lib/api";

const client = vi.hoisted(() => ({
  listRooms: vi.fn(),
  joinRoom: vi.fn(),
  createRoom: vi.fn(),
  createGuestSession: vi.fn(),
}));

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, api: client };
});

const SESSION = {
  token: "test-token",
  expiresAt: Date.now() + 3_600_000,
  subject: { kind: "guest", guestId: "gst-test", displayName: "Khách", avatarId: "av-01" },
};

function room(roomCode: string, status: "waiting" | "playing" = "waiting") {
  return {
    roomCode,
    status,
    mode: "solo",
    mapId: "map-01",
    seated: status === "waiting" ? 1 : 2,
    maxPlayers: 4,
    joinable: status === "waiting",
    updatedAt: "2026-11-14T09:15:00.000Z",
  };
}

function page(rooms = [room("K7M2QX"), room("ABC234", "playing")], nextCursor: string | null = null) {
  return { rooms, nextCursor, request_id: "req-test" };
}

function mount(): void {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <LocaleProvider>
        <SessionProvider>
          <Routes>
            <Route path="/" element={<MainPage />} />
            <Route path="/lobby/:code" element={<h1>Lobby</h1>} />
          </Routes>
        </SessionProvider>
      </LocaleProvider>
    </MemoryRouter>,
  );
}

async function openPanel() {
  const user = userEvent.setup();
  const trigger = screen.getByTestId("public-rooms");
  await user.click(trigger);
  const dialog = await screen.findByRole("dialog", { name: copy["main.rooms.title"] });
  return { user, trigger, dialog };
}

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem("gbw.session", JSON.stringify(SESSION));
  client.listRooms.mockReset();
  client.listRooms.mockResolvedValue(page());
  client.joinRoom.mockReset();
  client.createRoom.mockReset();
  client.createGuestSession.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TC-ROOM-725: on-demand loading and dialog states", () => {
  it("makes no list request until open, then one per open, filter selection and refresh", async () => {
    mount();
    expect(client.listRooms).not.toHaveBeenCalled();

    const { user, trigger, dialog } = await openPanel();
    await waitFor(() => expect(client.listRooms).toHaveBeenCalledTimes(1));
    expect(client.listRooms).toHaveBeenLastCalledWith(expect.objectContaining({ status: undefined }));
    expect(within(dialog).getByTestId("public-room-K7M2QX")).toHaveTextContent("K7M2QX");
    expect(within(dialog).getByTestId("public-room-ABC234")).toHaveTextContent(copy["main.rooms.playing"]);
    expect(within(dialog).queryByTestId("public-room-join-ABC234")).toBeNull();
    expect(within(dialog).getByRole("button", { name: copy["common.close"] })).toHaveFocus();
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.tab();
    expect(within(dialog).getByRole("button", { name: copy["common.close"] })).toHaveFocus();

    await user.click(within(dialog).getByRole("button", { name: copy["main.rooms.waiting"] }));
    await waitFor(() => expect(client.listRooms).toHaveBeenCalledTimes(2));
    expect(client.listRooms).toHaveBeenLastCalledWith(expect.objectContaining({ status: "waiting" }));

    await user.click(within(dialog).getByRole("button", { name: copy["main.rooms.waiting"] }));
    await waitFor(() => expect(client.listRooms).toHaveBeenCalledTimes(3));
    expect(client.listRooms).toHaveBeenCalledTimes(3);

    await user.click(within(dialog).getByRole("button", { name: copy["common.close"] }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("shows an inline error with a retry instead of a blank panel", async () => {
    client.listRooms.mockRejectedValueOnce(new ApiError("network", 0, "offline")).mockResolvedValueOnce(page());
    mount();

    const { user, dialog } = await openPanel();
    const error = await within(dialog).findByTestId("public-rooms-error");
    expect(error).toHaveTextContent(copy["main.rooms.error"]);

    await user.click(within(dialog).getByRole("button", { name: copy["main.rooms.retry"] }));
    await waitFor(() => expect(within(dialog).getByTestId("public-room-K7M2QX")).toBeInTheDocument());
  });

  it("keeps an explicit empty state after a successful empty page", async () => {
    client.listRooms.mockResolvedValue(page([]));
    mount();

    const { dialog } = await openPanel();
    expect(await within(dialog).findByTestId("public-rooms-empty")).toHaveTextContent(copy["main.rooms.empty"]);
  });

  it("ignores a stale next-page response after the filter changes", async () => {
    let resolveMore: ((value: ReturnType<typeof page>) => void) | null = null;
    client.listRooms
      .mockResolvedValueOnce(page([room("K7M2QX"), room("ABC234", "playing")], "more"))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveMore = resolve;
          }),
      )
      .mockResolvedValueOnce(page([room("K7M2QX")]));
    mount();

    const { user, dialog } = await openPanel();
    await within(dialog).findByTestId("public-room-ABC234");
    await user.click(within(dialog).getByRole("button", { name: copy["main.rooms.more"] }));
    await waitFor(() => expect(client.listRooms).toHaveBeenCalledTimes(2));
    await user.click(within(dialog).getByRole("button", { name: copy["main.rooms.waiting"] }));
    await waitFor(() => expect(client.listRooms).toHaveBeenCalledTimes(3));

    await act(async () => {
      resolveMore?.(page([room("ABC234", "playing")]));
      await Promise.resolve();
    });

    expect(within(dialog).queryByTestId("public-room-ABC234")).toBeNull();
    expect(within(dialog).getByTestId("public-room-K7M2QX")).toBeInTheDocument();
  });

  it("ignores a stale next-page rejection after the filter changes", async () => {
    let rejectMore: ((reason?: unknown) => void) | null = null;
    client.listRooms
      .mockResolvedValueOnce(page([room("K7M2QX"), room("ABC234", "playing")], "more"))
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectMore = reject;
          }),
      )
      .mockResolvedValueOnce(page([room("K7M2QX")]));
    mount();

    const { user, dialog } = await openPanel();
    await within(dialog).findByTestId("public-room-ABC234");
    await user.click(within(dialog).getByRole("button", { name: copy["main.rooms.more"] }));
    await waitFor(() => expect(client.listRooms).toHaveBeenCalledTimes(2));
    await user.click(within(dialog).getByRole("button", { name: copy["main.rooms.waiting"] }));
    await waitFor(() => expect(client.listRooms).toHaveBeenCalledTimes(3));

    await act(async () => {
      rejectMore?.(new Error("stale 503"));
      await Promise.resolve();
    });

    expect(within(dialog).queryByTestId("public-rooms-error")).toBeNull();
    expect(within(dialog).getByTestId("public-room-K7M2QX")).toBeInTheDocument();
  });
});

describe("TC-ROOM-726: a stale directory row is resolved by the room authority", () => {
  it.each(["room-full", "room-closed", "room-not-found"] as const)(
    "shows the %s refusal inline and refreshes the active filter once",
    async (type) => {
    client.joinRoom.mockRejectedValue(new ApiError(type, type === "room-full" ? 409 : type === "room-closed" ? 410 : 404, type));
    mount();

    const { user, dialog } = await openPanel();
    await within(dialog).findByTestId("public-room-K7M2QX");
    await user.click(within(dialog).getByTestId("public-room-join-K7M2QX"));

    const error = await within(dialog).findByTestId("public-rooms-error");
    expect(error).toHaveTextContent(copy[`errors.${type}`]);
    await waitFor(() => expect(client.listRooms).toHaveBeenCalledTimes(2));
    expect(client.joinRoom).toHaveBeenCalledWith(
      SESSION.token,
      "K7M2QX",
      expect.objectContaining({ displayName: SESSION.subject.displayName }),
    );
    },
  );
});

describe("TC-ROOM-728: the visibility opt-out travels with create", () => {
  it("defaults to public and sends isPrivate=false", async () => {
    const user = userEvent.setup();
    client.createRoom.mockResolvedValue({
      roomCode: "ABC234",
      playerId: "ply-host",
      wsUrl: "ws://test",
      maxPlayers: 2,
    });
    mount();

    expect(screen.getByRole("checkbox", { name: copy["main.rooms.private"] })).not.toBeChecked();
    await user.click(screen.getByTestId("create-room"));

    await waitFor(() => expect(client.createRoom).toHaveBeenCalledTimes(1));
    expect(client.createRoom).toHaveBeenCalledWith(
      SESSION.token,
      expect.objectContaining({ isPrivate: false }),
    );
  });

  it("sends isPrivate=true when the host chooses a private room", async () => {
    const user = userEvent.setup();
    client.createRoom.mockResolvedValue({
      roomCode: "ABC235",
      playerId: "ply-host",
      wsUrl: "ws://test",
      maxPlayers: 2,
    });
    mount();

    await user.click(screen.getByRole("checkbox", { name: copy["main.rooms.private"] }));
    expect(screen.getByRole("checkbox", { name: copy["main.rooms.private"] })).toBeChecked();
    await user.click(screen.getByTestId("create-room"));

    await waitFor(() => expect(client.createRoom).toHaveBeenCalledTimes(1));
    expect(client.createRoom).toHaveBeenCalledWith(
      SESSION.token,
      expect.objectContaining({ isPrivate: true }),
    );
  });
});
