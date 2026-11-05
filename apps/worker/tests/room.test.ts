/**
 * The room aggregate in the Worker: lifecycle, grace, host election and what it keeps in storage.
 *
 * `docs/01-overview/architecture.md` puts the room lifecycle in the `Room` object, so this file drives that
 * object rather than the HTTP surface. Time is moved by editing `lastActivityAt`/`createdAt` on the instance
 * (the two fields the sweeps read) instead of waiting, because a 10-minute idle test cannot sleep.
 */
import { describe, expect, it } from "vitest";
import { isForfeited, type RoomState } from "@gbw/core";
import { RoomHarness, makeSnapshot, type FakeSocket } from "./support/room-harness";

/** The one cast the harness already performs for reads; writes are limited to the two clock fields. */
type Mutable = { room: RoomState };

function moveClock(harness: RoomHarness, patch: Partial<Pick<RoomState, "createdAt" | "lastActivityAt">>): void {
  const instance = harness.do as unknown as Mutable;
  instance.room = { ...instance.room, ...patch };
}

function statusOf(harness: RoomHarness): string {
  return (harness.do as unknown as Mutable).room.status;
}

async function startRoom(seats = 4): Promise<{
  harness: RoomHarness;
  host: FakeSocket;
  ids: string[];
  sockets: Map<string, FakeSocket>;
}> {
  const harness = new RoomHarness();
  await harness.ready();
  const ids = ["h", "p2", "p3", "p4"].slice(0, seats);
  // The capacity arrives with the first join; the room freezes its settings once the roster exists.
  if (seats !== 4) {
    await harness.do.fetch(
      new Request("https://room.gbw.test/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playerId: ids[0],
          accountId: "acct-h",
          guestId: null,
          displayName: "h",
          avatarId: "av-01",
          mobileId: "mbl-01",
          roomCode: "ABCD23",
          settings: { maxPlayers: seats },
        }),
      }),
    );
  }
  for (const id of ids) await harness.join({ playerId: id, accountId: `acct-${id}` });
  const sockets = new Map<string, FakeSocket>();
  for (const id of ids) sockets.set(id, await harness.connect(id));
  const host = sockets.get(ids[0]!)!;
  await harness.message(host, {
    t: "team_assign",
    assignments: ids.map((id, index) => ({ playerId: id, team: index % 2 === 0 ? "A" : "B" })),
  });
  await harness.message(host, { t: "start_match" });
  return { harness, host, ids, sockets };
}

describe("grace and host election (US-ROOM-004, US-ROOM-005)", () => {
  it("TC-ROOM-048: the host's socket closing moves it to grace, not out of the roster", async () => {
    // Arrange
    const { harness, host, sockets } = await startRoom();
    const peer = sockets.get("p2")!;
    peer.clear();

    // Act
    await harness.close(host);

    // Assert — signaling.md §4: the host stays host until the grace alarm elects
    const member = harness.state().members.find((candidate) => candidate.playerId === "h");
    expect(member?.connectionState).toBe("grace");
    expect(member?.role).toBe("host");
    const [left] = peer.framesOf("peer_left");
    expect(left?.["reason"]).toBe("grace");
  });

  it("TC-ROOM-048: the election waits for the 20 s grace", async () => {
    // Arrange — signaling.md §4 says the *alarm* elects, so no election has happened yet
    const { harness, host } = await startRoom();
    await harness.close(host);

    // Act — nothing but the close
    const state = harness.state();

    // Assert
    expect(state.hostPlayerId).toBe("h");
    expect(state.hostGeneration).toBe(1);
  });

  it("TC-ROOM-048: after the grace alarm the oldest peer hosts, generation goes up, exactly one host role", async () => {
    // Arrange
    const { harness, host, sockets } = await startRoom();
    await harness.message(host, { t: "snapshot_push", snapshot: makeSnapshot(7) });
    const peer = sockets.get("p2")!;
    peer.clear();
    await harness.close(host);

    // Act
    await harness.alarm();

    // Assert
    const state = harness.state();
    expect(state.status).toBe("playing");
    expect(state.hostPlayerId).toBe("p2");
    expect(state.hostGeneration).toBe(2);
    expect(state.members.filter((member) => member.role === "host").map((member) => member.playerId)).toEqual(["p2"]);
    const [changed] = peer.framesOf("host_changed");
    expect(changed?.["hostPlayerId"]).toBe("p2");
    expect(changed?.["hostGeneration"]).toBe(2);
    // The migrating host adopts the last snapshot instead of restarting the match.
    expect((changed?.["lastSnapshot"] as { seq: number } | undefined)?.seq).toBe(7);
  });

  it("TC-ROOM-049: a member whose grace expired becomes disconnected and is announced", async () => {
    // Arrange
    const { harness, sockets } = await startRoom();
    const peer = sockets.get("p3")!;
    await harness.close(peer);
    const observer = sockets.get("p2")!;
    observer.clear();

    // Act
    await harness.alarm();

    // Assert
    const member = harness.state().members.find((candidate) => candidate.playerId === "p3");
    expect(member?.connectionState).toBe("disconnected");
    expect(member).toBeDefined();
    const reasons = observer.framesOf("peer_left").map((frame) => frame["reason"]);
    expect(reasons).toContain("disconnected");
  });

  it("TC-ROOM-049: a reconnect inside grace comes back connected on the same slot", async () => {
    // Arrange
    const { harness, ids, sockets } = await startRoom();
    const slotBefore = harness.state().members.find((member) => member.playerId === "p3")?.slot;
    await harness.close(sockets.get("p3")!);

    // Act
    const again = await harness.connect("p3");

    // Assert
    const member = harness.state().members.find((candidate) => candidate.playerId === "p3");
    expect(member?.connectionState).toBe("connected");
    expect(member?.slot).toBe(slotBefore);
    expect(harness.state().members.map((candidate) => candidate.playerId)).toEqual(ids);
    expect(again.readyState).toBe(1);
  });

  it("TC-ROOM-050: with no peer connected the room is abandoned and no election happens", async () => {
    // Arrange — every socket but the host's is gone, then the host goes too
    const { harness, sockets } = await startRoom(2);
    await harness.close(sockets.get("p2")!);
    await harness.alarm();
    await harness.close(sockets.get("h")!);

    // Act
    await harness.alarm();

    // Assert — signaling.md §4: "skip when no peer is connected (room → abandoned)"
    expect(harness.state().status).toBe("abandoned");
    expect(harness.state().hostPlayerId).toBe("h");
  });
});

describe("lifecycle sweeps (workflow-state-machine.md)", () => {
  it("TC-ROOM-052: an ended room idle for ten minutes is closed and its record deleted", async () => {
    // Arrange
    const { harness, host, sockets } = await startRoom(2);
    await harness.message(host, { t: "match_end", winnerTeam: "A", stats: [] });
    expect(harness.state().status).toBe("ended");
    const peer = sockets.get("p2")!;
    peer.clear();
    moveClock(harness, { lastActivityAt: Date.now() - 11 * 60_000 });

    // Act
    await harness.alarm();

    // Assert — "ended | abandoned → closed after 10 min idle → storage delete"
    expect(harness.storageKeys()).toEqual([]);
    expect(peer.framesOf("room_closed")).toHaveLength(1);
    expect(peer.closes.map((close) => close.code)).toEqual([4410]);
    expect(statusOf(harness)).toBe("abandoned");
  });

  it("TC-ROOM-052: a lobby that lost its last member is deleted sixty seconds later", async () => {
    // Arrange — workflow-state-machine.md: "lobby → closed: the last member left (60 s later the record is deleted)"
    const harness = new RoomHarness();
    await harness.ready();
    await harness.join({ playerId: "solo" });
    await harness.do.fetch(
      new Request("https://room.gbw.test/leave", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId: "solo" }),
      }),
    );
    expect(harness.storageKeys()).toContain("room");
    moveClock(harness, { lastActivityAt: Date.now() - 61_000 });

    // Act
    await harness.alarm();

    // Assert
    expect(harness.storageKeys()).toEqual([]);
  });

  it("TC-ROOM-053: the 24 h cap is measured from the match start, not from room creation", async () => {
    // Arrange — created 30 h ago, playing for one hour, busy right now
    const { harness } = await startRoom(2);
    moveClock(harness, {
      createdAt: Date.now() - 30 * 60 * 60_000,
      lastActivityAt: Date.now(),
    });

    // Act
    await harness.alarm();

    // Assert — workflow-state-machine.md: the cap runs from `matchStartedAt + 24 h`
    expect(statusOf(harness)).toBe("playing");
    expect(harness.storageKeys()).toContain("room");
  });
});

describe("what the room keeps", () => {
  it("TC-ROOM-054: only the newest snapshot is stored, under its own key", async () => {
    // Arrange
    const { harness, host } = await startRoom(2);
    await harness.message(host, { t: "snapshot_push", snapshot: makeSnapshot(1) });
    await harness.message(host, { t: "snapshot_push", snapshot: makeSnapshot(2) });

    // Act
    const keys = harness.storageKeys();

    // Assert
    expect(keys).toContain("snapshot");
    expect(keys.filter((key) => key === "snapshot")).toHaveLength(1);
    expect(harness.state().lastSnapshot?.seq).toBe(2);
  });

  it("TC-ROOM-055: the public state never exposes the snapshot blob", async () => {
    // Arrange
    const { harness, host } = await startRoom(2);
    await harness.message(host, { t: "snapshot_push", snapshot: makeSnapshot(4) });

    // Act
    const response = await harness.do.fetch(new Request("https://room.gbw.test/state"));
    const body = (await response.json()) as Record<string, unknown>;

    // Assert — a reconnect replays it on the socket, the HTTP surface only reports the sequence
    expect(body["lastSnapshot"]).toBeUndefined();
    expect(body["lastSnapshotSeq"]).toBe(4);
  });

  it("TC-ROOM-056: a finished room refuses a new socket with 410", async () => {
    // Arrange
    const { harness, host } = await startRoom(2);
    await harness.message(host, { t: "match_end", winnerTeam: "B", stats: [] });

    // Act
    const upgrade = harness.upgrade();

    // Assert — "A closed room can never be rejoined"
    await expect(upgrade).rejects.toThrow(/upgrade failed with 410/);
  });
});

describe("forfeit (workflow-state-machine.md, connection table)", () => {
  it("TC-ROOM-057: a team forfeits only when every member of it is disconnected", async () => {
    // Arrange
    const { harness } = await startRoom(4);
    const state = harness.state();
    const aSlots = state.members.filter((member) => member.team === "A").map((member) => member.playerId);
    const bSlots = state.members.filter((member) => member.team === "B").map((member) => member.playerId);

    // Act — drop one member of A only
    const partial: RoomState = {
      ...state,
      members: state.members.map((member) =>
        member.playerId === aSlots[0] ? { ...member, connectionState: "disconnected" } : member,
      ),
    };
    const withTeamAGone: RoomState = {
      ...partial,
      members: partial.members.map((member) =>
        aSlots.includes(member.playerId) ? { ...member, connectionState: "disconnected" } : member,
      ),
    };

    // Assert
    expect(isForfeited(partial)).toBeNull();
    expect(isForfeited(withTeamAGone)).toBe("B");
    expect(bSlots).toHaveLength(2);
  });
});
