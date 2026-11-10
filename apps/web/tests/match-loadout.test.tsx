// @vitest-environment jsdom
/**
 * TC-MATCH-954 / TC-ROOM-714: the loadout a player picked actually reaches the match (`US-MATCH-009`).
 *
 * The item tray shipped and then opened on nothing in every match, because the two places that build a match dropped the
 * loadout: the practice plan never set one, and the lobby read `room.members` — which has no loadout — instead of the
 * `match_started` assignments that do. Both halves are asserted here, end to end where possible: a seat's `loadout` has to
 * arrive as `PlayerState.items`, which is the only thing the wheel reads.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ITEMS, LOADOUT_CAP, createMatch, loadoutTotal, type RoomMember, type RoomState } from "@gbw/core";
import { LocaleProvider, SessionProvider } from "../src/app/providers";
import { LobbyPage } from "../src/routes/LobbyPage";
import { PRACTICE_LOADOUT, PLAN_KEY, botMatchPlan } from "../src/lib/plan";

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

function room(): RoomState {
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
  };
}

describe("TC-MATCH-954: a practice match carries a loadout", () => {
  it("gives both seats a kit that is legal and real", () => {
    const plan = botMatchPlan({ displayName: "Khách", accountId: null, mobileId: "mbl-01", botLabel: "Máy" });
    const known = new Set<string>(ITEMS.map((item) => item.itemId));

    for (const seat of plan.seats) {
      expect(seat.loadout, `seat ${seat.slot} carries a loadout`).toBeTruthy();
      expect(loadoutTotal(seat.loadout!)).toBeLessThanOrEqual(LOADOUT_CAP);
      for (const [itemId, quantity] of Object.entries(seat.loadout!)) {
        // An id the table does not know would be silently dropped by `seatsToPlayers` and read as "the pick vanished".
        expect(known.has(itemId), `${itemId} is a real item`).toBe(true);
        expect(quantity).toBeGreaterThan(0);
      }
    }
    // Symmetric on purpose: the bot spends items too, so the practice is not a one-sided tutorial.
    expect(plan.seats[1]!.loadout).toEqual(plan.seats[0]!.loadout);
    expect(loadoutTotal(PRACTICE_LOADOUT)).toBeGreaterThan(0);
  });

  it("turns that loadout into the items the wheel reads", () => {
    const plan = botMatchPlan({ displayName: "Khách", accountId: null, mobileId: "mbl-01", botLabel: "Máy" });
    const state = createMatch({
      matchId: "m-test",
      roomCode: plan.roomCode,
      seed: plan.seed,
      mode: plan.mode,
      mapId: plan.mapId,
      seats: plan.seats,
      now: Date.now(),
    });

    for (const player of state.players) {
      // `PlayerState.items` is the only field the six-slot tray reads; an empty map here is the bug this case exists for.
      expect(player.items).toEqual(plan.seats[player.slot]!.loadout);
      expect(Object.keys(player.items).length).toBeGreaterThan(0);
    }
  });
});

describe("TC-ROOM-714: the lobby hands the room's loadouts to the match", () => {
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

  it("maps assignments[].loadout into the seat, joined to the member for its name", async () => {
    render(
      <LocaleProvider>
        <SessionProvider>
          <MemoryRouter initialEntries={["/lobby/ABCD"]}>
            <Routes>
              <Route path="/lobby/:code" element={<LobbyPage />} />
              <Route path="/match/:code" element={<div data-testid="match-route" />} />
            </Routes>
          </MemoryRouter>
        </SessionProvider>
      </LocaleProvider>,
    );
    await screen.findByTestId("room-code");
    act(() => socket.deliver?.({ t: "room_state", room: room() }));

    act(() =>
      socket.deliver?.({
        t: "match_started",
        startedAt: 1_700_000_000_000,
        seed: 4242,
        hostPlayerId: HOST_ID,
        hostGeneration: 1,
        rulesetVersion: "2026-11-09",
        assignments: [
          { playerId: HOST_ID, slot: 0, team: "A", mobileId: "mbl-01", accountId: null, loadout: [{ id: "itm-dual", qty: 2 }] },
          {
            playerId: GUEST_ID,
            slot: 1,
            team: "B",
            mobileId: "mbl-04",
            accountId: "acc-1",
            loadout: [
              { id: "itm-power-up", qty: 1 },
              { id: "itm-teleport", qty: 3 },
            ],
          },
        ],
        room: room(),
      }),
    );

    const plan = JSON.parse(sessionStorage.getItem(PLAN_KEY) ?? "null") as {
      seats: {
        slot: number;
        team: "A" | "B";
        displayName: string;
        mobileId: string;
        loadout: Record<string, number>;
        accountId: string | null;
      }[];
    } | null;
    expect(plan).not.toBeNull();

    // The loadout travels as a quantity map, which is the shape `Seat.loadout` documents and `seatsToPlayers` reads.
    expect(plan!.seats[0]!.loadout).toEqual({ "itm-dual": 2 });
    expect(plan!.seats[1]!.loadout).toEqual({ "itm-power-up": 1, "itm-teleport": 3 });
    // The name is only on the member, so the join has to keep working after the seat source changed.
    expect(plan!.seats.map((seat) => seat.displayName)).toEqual(["Chủ phòng", "Khách"]);
    expect(plan!.seats[1]!.accountId).toBe("acc-1");

    // And the match that starts from this plan has the items, which is the whole point of the case.
    const state = createMatch({
      matchId: "m-4242",
      roomCode: "ABCD",
      seed: 4242,
      mode: "solo",
      mapId: "map-01",
      seats: plan!.seats,
      now: Date.now(),
    });
    expect(state.players[0]!.items).toEqual({ "itm-dual": 2 });
    expect(state.players[1]!.items).toEqual({ "itm-power-up": 1, "itm-teleport": 3 });
  });
});
