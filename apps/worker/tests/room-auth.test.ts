/**
 * Auth and liveness oracle for the `Room` Durable Object (`docs/02-reference/api/signaling.md` § 2–3).
 * `US-ROOM-002`: a socket proves identity within 5 s, and a ping answers with the same `at`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mintSession } from "../src/lib/session";
import { HARNESS_SECRET, ROOM_CODE, ROOM_ORIGIN, RoomHarness } from "./support/room-harness";

const BASE = 1_700_000_000_000;

interface RosterFrame {
  readonly room: {
    readonly members: readonly {
      readonly playerId: string;
      readonly slot: number;
      readonly connectionState: string;
    }[];
  };
}

describe("room socket auth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("TC-ROOM-121: a socket that sends nothing is closed 4401 after five seconds", async () => {
    const harness = new RoomHarness();
    await harness.ready();
    await harness.join({ playerId: "host", accountId: "acct-host" });

    const socket = await harness.upgrade();
    expect(socket.closes).toEqual([]);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(socket.closes).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(socket.closes).toEqual([{ code: 4401, reason: "auth timeout" }]);
  });

  it("TC-ROOM-121: a bad session token is closed 4401 and creates no member", async () => {
    const harness = new RoomHarness();
    await harness.ready();
    await harness.join({ playerId: "host", accountId: "acct-host" });
    const rosterBefore = harness.state().members;

    const socket = await harness.upgrade();
    await harness.message(socket, { t: "auth", token: "not-a-session-token" });

    expect(socket.closes).toEqual([{ code: 4401, reason: "invalid session token" }]);
    expect(harness.state().members).toEqual(rosterBefore);
    expect(harness.state().members).toHaveLength(1);
  });

  it("TC-ROOM-126: any frame before auth closes the socket 4401", async () => {
    const harness = new RoomHarness();
    await harness.ready();
    await harness.join({ playerId: "host", accountId: "acct-host" });

    const socket = await harness.upgrade();
    await harness.message(socket, { t: "ping", at: 1 });

    expect(socket.closes).toEqual([{ code: 4401, reason: "auth required" }]);
    expect(socket.framesOf("pong")).toEqual([]);
  });

  it("TC-ROOM-063: auth answers room_state with its own member connected and never announces the self as peer_joined", async () => {
    // Arrange — the host is already connected, so the second socket is the one being observed
    const harness = new RoomHarness();
    await harness.ready();
    await harness.join({ playerId: "host", accountId: "acct-host" });
    const host = await harness.connect("host");
    host.clear();
    await harness.join({ playerId: "p2", accountId: "acct-p2" });

    // Act
    const p2 = await harness.connect("p2");

    // Assert — `US-ROOM-002` AC1: `room_state` names the receiver and its seat is already `connected`
    const [state] = p2.framesOf("room_state");
    expect(state?.["you"]).toEqual({ playerId: "p2", slot: 1 });
    const roster = (state as RosterFrame | undefined)?.room.members;
    expect(roster?.find((member) => member.playerId === "p2")).toMatchObject({
      slot: 1,
      connectionState: "connected",
    });
    // `peer_joined` is the fast path for the *others*; the newcomer's own frame is `room_state`.
    expect(p2.framesOf("peer_joined")).toEqual([]);
    expect(host.framesOf("peer_joined")).toHaveLength(1);
  });

  it("TC-ROOM-122: a valid token that owns no seat in a full room is closed 4409 and the roster is unchanged", async () => {
    // Arrange — a two-slot room: the first join names it and freezes the capacity
    const harness = new RoomHarness();
    await harness.ready();
    const created = await harness.do.fetch(
      new Request(`${ROOM_ORIGIN}/${ROOM_CODE}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playerId: "host",
          accountId: "acct-host",
          guestId: null,
          displayName: "host",
          avatarId: "av-01",
          mobileId: "mbl-01",
          roomCode: ROOM_CODE,
          settings: { maxPlayers: 2 },
        }),
      }),
    );
    expect(created.status).toBe(200);
    await harness.join({ playerId: "host", accountId: "acct-host" });
    await harness.join({ playerId: "p2", accountId: "acct-p2" });
    const rosterBefore = harness.state().members.map((member) => member.playerId);
    expect(rosterBefore).toHaveLength(2);

    // Act — a third player proves a valid session that no seat matches
    const { token } = await mintSession({ kind: "account", accountId: "acct-p3", guestId: null }, HARNESS_SECRET);
    const socket = await harness.upgrade();
    await harness.message(socket, { t: "auth", token });

    // Assert
    expect(socket.closes).toEqual([{ code: 4409, reason: "room full" }]);
    expect(harness.state().members.map((member) => member.playerId)).toEqual(rosterBefore);
  });

  it("TC-ROOM-127: a ping is answered with a pong that echoes the same at", async () => {
    const harness = new RoomHarness();
    await harness.ready();
    await harness.join({ playerId: "host", accountId: "acct-host" });
    const socket = await harness.connect("host");
    socket.clear();

    await harness.message(socket, { t: "ping", at: 1234 });

    expect(socket.frames()).toEqual([{ t: "pong", at: 1234, now: BASE }]);
  });
});
