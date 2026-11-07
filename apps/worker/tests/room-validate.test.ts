/**
 * `US-NET-004` — the validation table in the story's § 4, one case per row.
 *
 * Every rule is exercised against a real `Room` object through the harness, because the guard order
 * matters as much as the code: `not-host` before `invalid-state` before payload checks is what the table
 * documents, and a test that only asserts "an error happened" would not notice the order changing.
 */
import { describe, expect, it } from "vitest";
import { ROOM_CODE, ROOM_ORIGIN, RoomHarness, makeSnapshot, type FakeSocket } from "./support/room-harness";

interface Opened {
  readonly harness: RoomHarness;
  readonly sockets: Map<string, FakeSocket>;
  readonly hostId: string;
  readonly peerId: string;
}

/** The first join carries the capacity, because the room's settings are frozen after the roster exists. */
async function capacityJoin(harness: RoomHarness, playerId: string, seats: number): Promise<void> {
  const response = await harness.do.fetch(
    new Request(`${ROOM_ORIGIN}/${ROOM_CODE}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        playerId,
        accountId: `acct-${playerId}`,
        guestId: null,
        displayName: playerId,
        avatarId: "av-01",
        mobileId: "mbl-01",
        roomCode: ROOM_CODE,
        settings: { maxPlayers: seats },
      }),
    }),
  );
  expect(response.status).toBe(200);
}

/** Join + connect every id; the first one is the host. */
async function open(ids: readonly string[], seats = 4): Promise<Opened> {
  const harness = new RoomHarness();
  await harness.ready();
  const [hostId, ...rest] = ids;
  if (!hostId) throw new Error("open needs a host");
  if (seats !== 4) {
    await capacityJoin(harness, hostId, seats);
  }
  for (const id of ids) await harness.join({ playerId: id, accountId: `acct-${id}` });
  const sockets = new Map<string, FakeSocket>();
  for (const id of ids) sockets.set(id, await harness.connect(id));
  return { harness, sockets, hostId, peerId: rest[0] ?? hostId };
}

/** Seat every member A/B alternately, which is what `startPlaying` needs too. */
async function seat(harness: RoomHarness, socket: FakeSocket, ids: readonly string[]): Promise<void> {
  await harness.message(socket, {
    t: "team_assign",
    assignments: ids.map((id, index) => ({ playerId: id, team: index % 2 === 0 ? "A" : "B" })),
  });
}

/** Everything every socket has received since the last clear. */
function frames(sockets: Iterable<FakeSocket>, t: string): number {
  let count = 0;
  for (const socket of sockets) count += socket.framesOf(t).length;
  return count;
}

describe("signal (US-NET-004 §4: any connected member, lobby/playing)", () => {
  it("TC-NET-066: a self-signal is bad-request", async () => {
    // Arrange
    const { harness, sockets, hostId } = await open(["h", "p2"]);
    const host = sockets.get(hostId)!;

    // Act
    await harness.message(host, { t: "signal", to: hostId, payload: { kind: "offer", sdp: "v=0" } });

    // Assert — signaling.md §2: "signalling yourself → `bad-request`"
    expect(host.errors().map((frame) => frame["code"])).toEqual(["bad-request"]);
    expect(host.readyState).toBe(1);
  });

  it("TC-NET-066: a signal to a member with no socket is peer-not-connected", async () => {
    // Arrange — `p3` joined but never opened a socket
    const { harness, sockets, hostId } = await open(["h", "p2"]);
    await harness.join({ playerId: "p3", accountId: "acct-p3" });
    const host = sockets.get(hostId)!;

    // Act
    await harness.message(host, { t: "signal", to: "p3", payload: { kind: "offer", sdp: "v=0" } });

    // Assert
    expect(host.errors().map((frame) => frame["code"])).toEqual(["peer-not-connected"]);
  });

  it("TC-NET-066: a signal to an id that is not in the room answers the same code", async () => {
    // Arrange
    const { harness, sockets, hostId } = await open(["h", "p2"]);
    const host = sockets.get(hostId)!;

    // Act
    await harness.message(host, { t: "signal", to: "no-such-player", payload: { kind: "offer", sdp: "v=0" } });

    // Assert — US-ROOM-006 AC2: an offline peer and a stranger are indistinguishable
    expect(host.errors().map((frame) => frame["code"])).toEqual(["peer-not-connected"]);
  });

  it("TC-NET-066: an sdp over 8 KB is payload-too-large", async () => {
    // Arrange
    const { harness, sockets, hostId, peerId } = await open(["h", "p2"]);
    const host = sockets.get(hostId)!;
    const peer = sockets.get(peerId)!;
    peer.clear();

    // Act
    await harness.message(host, { t: "signal", to: peerId, payload: { kind: "offer", sdp: "v".repeat(9000) } });

    // Assert — signaling.md §2 budget table: 8 KB per sdp
    expect(host.errors().map((frame) => frame["code"])).toEqual(["payload-too-large"]);
    expect(frames([peer], "signal")).toBe(0);
  });
});

describe("team_assign (host, lobby)", () => {
  it("TC-NET-045: a peer that assigns teams is not-host and the room is unchanged", async () => {
    // Arrange
    const { harness, sockets, hostId, peerId } = await open(["h", "p2"]);
    const peer = sockets.get(peerId)!;
    const before = JSON.stringify(harness.state());

    // Act
    await harness.message(peer, { t: "team_assign", assignments: [{ playerId: hostId, team: "B" }] });

    // Assert
    expect(peer.errors().map((frame) => frame["code"])).toEqual(["not-host"]);
    expect(JSON.stringify(harness.state())).toBe(before);
  });

  it("TC-NET-045: team_assign once the match started is invalid-state", async () => {
    // Arrange
    const { harness, sockets, hostId, peerId } = await open(["h", "p2", "p3", "p4"]);
    const ids = ["h", "p2", "p3", "p4"];
    await seat(harness, sockets.get(hostId)!, ids);
    await harness.message(sockets.get(hostId)!, { t: "start_match" });
    expect(harness.state().status).toBe("playing");
    const host = sockets.get(hostId)!;
    host.clear();

    // Act
    await harness.message(host, { t: "team_assign", assignments: [{ playerId: peerId, team: "A" }] });

    // Assert
    expect(host.errors().map((frame) => frame["code"])).toEqual(["invalid-state"]);
  });

  it("TC-NET-045: a playerId outside the room is bad-request and names the stranger", async () => {
    // Arrange
    const { harness, sockets, hostId } = await open(["h", "p2"]);
    const host = sockets.get(hostId)!;

    // Act
    await harness.message(host, { t: "team_assign", assignments: [{ playerId: "ghost", team: "A" }] });

    // Assert
    const [error] = host.errors();
    expect(error?.["code"]).toBe("bad-request");
    expect(String(error?.["detail"])).toContain("ghost");
  });

  it("TC-ROOM-146: a team may never hold more than maxPlayers / 2", async () => {
    // Arrange — four seats, so two per team
    const { harness, sockets, hostId } = await open(["h", "p2", "p3", "p4"]);
    const host = sockets.get(hostId)!;

    // Act
    await harness.message(host, {
      t: "team_assign",
      assignments: [
        { playerId: "h", team: "A" },
        { playerId: "p2", team: "A" },
        { playerId: "p3", team: "A" },
        { playerId: "p4", team: "B" },
      ],
    });

    // Assert — US-NET-004 §4 / signaling.md §2: capacity, not equality
    const [error] = host.errors();
    expect(error?.["code"]).toBe("bad-request");
    expect(String(error?.["detail"])).toContain("at most 2 players at 4 seats");
  });
});

describe("start_match (host, lobby + guards)", () => {
  it("TC-NET-045: a peer cannot start the match", async () => {
    // Arrange
    const { harness, sockets, peerId } = await open(["h", "p2"]);
    const peer = sockets.get(peerId)!;

    // Act
    await harness.message(peer, { t: "start_match" });

    // Assert
    expect(peer.errors().map((frame) => frame["code"])).toEqual(["not-host"]);
    expect(harness.state().status).toBe("lobby");
  });

  it("TC-ROOM-164: an unfilled roster answers room-not-full", async () => {
    // Arrange — four seats, two members
    const { harness, sockets, hostId } = await open(["h", "p2"]);
    await seat(harness, sockets.get(hostId)!, ["h", "p2"]);
    const host = sockets.get(hostId)!;
    host.clear();

    // Act
    await harness.message(host, { t: "start_match" });

    // Assert
    expect(host.errors().map((frame) => frame["code"])).toEqual(["room-not-full"]);
  });

  it("TC-ROOM-165: a roster with more players on one team answers teams-not-balanced", async () => {
    // Arrange — six seats, three on A and two on B, one unassigned
    const ids = ["h", "p2", "p3", "p4", "p5", "p6"];
    const { harness, sockets, hostId } = await open(ids, 6);
    const host = sockets.get(hostId)!;
    await harness.message(host, {
      t: "team_assign",
      assignments: [
        { playerId: "h", team: "A" },
        { playerId: "p2", team: "A" },
        { playerId: "p3", team: "A" },
        { playerId: "p4", team: "B" },
        { playerId: "p5", team: "B" },
        { playerId: "p6", team: null },
      ],
    });
    host.clear();

    // Act
    await harness.message(host, { t: "start_match" });

    // Assert
    expect(host.errors().map((frame) => frame["code"])).toEqual(["teams-not-balanced"]);
  });

  it("TC-ROOM-166: a fully assigned and balanced roster starts, stamped by the server", async () => {
    // Arrange
    const { harness, sockets, hostId } = await open(["h", "p2", "p3", "p4"]);
    const ids = ["h", "p2", "p3", "p4"];
    await seat(harness, sockets.get(hostId)!, ids);
    const peer = sockets.get("p2")!;
    peer.clear();

    // Act
    await harness.message(sockets.get(hostId)!, { t: "start_match" });

    // Assert — the client never chooses the ruleset it is ranked under (`US-ROOM-003` AC4)
    expect(harness.state().status).toBe("playing");
    const [started] = peer.framesOf("match_started");
    expect(started?.["rulesetVersion"]).toBe("2026-11-05");
    expect(started?.["hostPlayerId"]).toBe(hostId);
    expect(started?.["seed"]).toBeTypeOf("number");
    expect(started?.["assignments"]).toHaveLength(4);
  });
});

describe("snapshot_push (host, playing)", () => {
  it("TC-NET-044: a peer's snapshot_push is not-host and lastSnapshot is untouched", async () => {
    // Arrange
    const { harness, sockets, hostId, peerId } = await open(["h", "p2", "p3", "p4"]);
    const ids = ["h", "p2", "p3", "p4"];
    await seat(harness, sockets.get(hostId)!, ids);
    await harness.message(sockets.get(hostId)!, { t: "start_match" });
    await harness.message(sockets.get(hostId)!, { t: "snapshot_push", snapshot: makeSnapshot(1) });
    const peer = sockets.get(peerId)!;
    peer.clear();

    // Act
    await harness.message(peer, { t: "snapshot_push", snapshot: makeSnapshot(99) });

    // Assert
    expect(peer.errors().map((frame) => frame["code"])).toEqual(["not-host"]);
    expect(harness.state().lastSnapshot?.seq).toBe(1);
  });

  it("TC-NET-044: a snapshot_push before the match started is invalid-state", async () => {
    // Arrange
    const { harness, sockets, hostId } = await open(["h", "p2"]);
    const host = sockets.get(hostId)!;

    // Act
    await harness.message(host, { t: "snapshot_push", snapshot: makeSnapshot(1) });

    // Assert
    expect(host.errors().map((frame) => frame["code"])).toEqual(["invalid-state"]);
    expect(harness.state().lastSnapshot).toBeNull();
  });

  it("TC-NET-044: a snapshot over 8 KB is snapshot-too-large", async () => {
    // Arrange
    const { harness, sockets, hostId } = await open(["h", "p2", "p3", "p4"]);
    const ids = ["h", "p2", "p3", "p4"];
    await seat(harness, sockets.get(hostId)!, ids);
    await harness.message(sockets.get(hostId)!, { t: "start_match" });
    expect(harness.state().status).toBe("playing");
    const host = sockets.get(hostId)!;
    host.clear();
    const oversized = { ...makeSnapshot(1), terrain: "A".repeat(9000) };

    // Act
    await harness.message(host, { t: "snapshot_push", snapshot: oversized });

    // Assert
    expect(host.errors().map((frame) => frame["code"])).toEqual(["snapshot-too-large"]);
    expect(harness.state().lastSnapshot).toBeNull();
  });
});

describe("match_end (host, playing)", () => {
  it("TC-NET-044: a peer's match_end is not-host", async () => {
    // Arrange
    const { harness, sockets, hostId, peerId } = await open(["h", "p2", "p3", "p4"]);
    await seat(harness, sockets.get(hostId)!, ["h", "p2", "p3", "p4"]);
    await harness.message(sockets.get(hostId)!, { t: "start_match" });
    expect(harness.state().status).toBe("playing");
    const peer = sockets.get(peerId)!;

    // Act
    await harness.message(peer, { t: "match_end", winnerTeam: "A", stats: [] });

    // Assert
    expect(peer.errors().map((frame) => frame["code"])).toEqual(["not-host"]);
    expect(harness.state().status).toBe("playing");
  });

  it("TC-NET-044: a host's match_end in the lobby is invalid-state", async () => {
    // Arrange
    const { harness, sockets, hostId } = await open(["h", "p2"]);
    const host = sockets.get(hostId)!;

    // Act
    await harness.message(host, { t: "match_end", winnerTeam: "A", stats: [] });

    // Assert
    expect(host.errors().map((frame) => frame["code"])).toEqual(["invalid-state"]);
    expect(harness.state().status).toBe("lobby");
  });

  it("TC-NET-044: a winnerTeam outside A and B is bad-request", async () => {
    // Arrange
    const { harness, sockets, hostId } = await open(["h", "p2", "p3", "p4"]);
    await seat(harness, sockets.get(hostId)!, ["h", "p2", "p3", "p4"]);
    await harness.message(sockets.get(hostId)!, { t: "start_match" });
    expect(harness.state().status).toBe("playing");
    const host = sockets.get(hostId)!;
    host.clear();

    // Act
    await harness.message(host, { t: "match_end", winnerTeam: "C", stats: [] });

    // Assert
    expect(host.errors().map((frame) => frame["code"])).toEqual(["bad-request"]);
    expect(harness.state().status).toBe("playing");
  });
});

describe("move and item (the active slot, playing)", () => {
  async function playing(): Promise<Opened> {
    const opened = await open(["h", "p2", "p3", "p4"]);
    const ids = ["h", "p2", "p3", "p4"];
    await seat(opened.harness, opened.sockets.get(opened.hostId)!, ids);
    await opened.harness.message(opened.sockets.get(opened.hostId)!, { t: "start_match" });
    await opened.harness.message(opened.sockets.get(opened.hostId)!, {
      t: "snapshot_push",
      snapshot: makeSnapshot(1),
    });
    return opened;
  }

  it("TC-NET-067: a move from a slot that is not active is unsupported-message", async () => {
    // Arrange — the snapshot's active slot is 0 (`makeSnapshot`), `p3` sits on slot 2
    const { harness, sockets, hostId } = await playing();
    const p3 = sockets.get("p3")!;
    p3.clear();

    // Act
    await harness.message(p3, { t: "move", direction: 1, run: false });

    // Assert
    expect(p3.errors().map((frame) => frame["code"])).toEqual(["unsupported-message"]);
    expect(frames([sockets.get(hostId)!], "move")).toBe(0);
  });

  it("TC-NET-067: an item from a slot that is not active is unsupported-message", async () => {
    // Arrange
    const { harness, sockets } = await playing();
    const p4 = sockets.get("p4")!;
    p4.clear();

    // Act
    await harness.message(p4, { t: "item", id: "dual" });

    // Assert
    expect(p4.errors().map((frame) => frame["code"])).toEqual(["unsupported-message"]);
  });

  it("TC-NET-067: the active player's move reaches the host with the sender bound by the socket", async () => {
    // Arrange — slot 0 is the host, so slot 1 (`p2`) is not active; make it active with a second snapshot
    const { harness, sockets, hostId } = await playing();
    await harness.message(sockets.get(hostId)!, {
      t: "snapshot_push",
      snapshot: { ...makeSnapshot(2), turn: { ...makeSnapshot(2).turn, activeSlot: 1 } },
    });
    const host = sockets.get(hostId)!;
    host.clear();

    // Act
    await harness.message(sockets.get("p2")!, { t: "move", direction: 0, run: true });

    // Assert
    const [move] = host.framesOf("move");
    expect(move?.["from"]).toBe("p2");
    expect(move?.["direction"]).toBe(0);
    expect(move?.["run"]).toBe(true);
    expect(sockets.get("p2")!.errors()).toEqual([]);
  });

  it("US-NET-004 AC2: a move before the first snapshot is refused, because no slot is active", async () => {
    // Arrange — playing, but the host has not pushed a snapshot yet
    const { harness, sockets, hostId } = await open(["h", "p2", "p3", "p4"]);
    await seat(harness, sockets.get(hostId)!, ["h", "p2", "p3", "p4"]);
    await harness.message(sockets.get(hostId)!, { t: "start_match" });
    expect(harness.state().status).toBe("playing");
    const p2 = sockets.get("p2")!;
    p2.clear();

    // Act
    await harness.message(p2, { t: "move", direction: 1, run: false });

    // Assert — AC2: "It sends `input` ... while not active" → `error unsupported-message`
    expect(p2.errors().map((frame) => frame["code"])).toEqual(["unsupported-message"]);
    expect(frames([sockets.get(hostId)!], "move")).toBe(0);
  });
});

describe("envelope and ownership (§ 5 of the story)", () => {
  it("TC-ROOM-163: an unknown frame is unsupported-message and the socket stays open", async () => {
    // Arrange
    const { harness, sockets, peerId } = await open(["h", "p2"]);
    const peer = sockets.get(peerId)!;

    // Act
    await harness.message(peer, { t: "teleport", slot: 3 });

    // Assert
    expect(peer.errors().map((frame) => frame["code"])).toEqual(["unsupported-message"]);
    expect(peer.readyState).toBe(1);
    expect(peer.closes).toEqual([]);
  });

  it("TC-ROOM-163: an undocumented field is bad-request and is named in the detail", async () => {
    // Arrange
    const { harness, sockets, peerId } = await open(["h", "p2"]);
    const peer = sockets.get(peerId)!;

    // Act
    await harness.message(peer, { t: "ping", at: 1, payload: {} });

    // Assert
    const [error] = peer.errors();
    expect(error?.["code"]).toBe("bad-request");
    expect(String(error?.["detail"])).toContain("payload");
  });

  it("TC-ROOM-163: a frame that is not JSON is bad-request", async () => {
    // Arrange
    const { harness, sockets, peerId } = await open(["h", "p2"]);
    const peer = sockets.get(peerId)!;

    // Act
    await harness.message(peer, "{not json");

    // Assert
    expect(peer.errors().map((frame) => frame["code"])).toEqual(["bad-request"]);
  });

  it("TC-ROOM-126: a frame before auth closes the socket with 4401", async () => {
    // Arrange
    const harness = new RoomHarness();
    await harness.ready();
    await harness.join({ playerId: "p2" });
    const socket = await harness.upgrade();

    // Act
    await harness.message(socket, { t: "start_match" });

    // Assert
    expect(socket.closes.map((close) => close.code)).toEqual([4401]);
  });

  it("TC-ROOM-151: room_settings from a peer is not-host", async () => {
    // Arrange
    const { harness, sockets, peerId } = await open(["h", "p2"]);
    const peer = sockets.get(peerId)!;

    // Act
    await harness.message(peer, { t: "room_settings", mode: "score", mapId: "map-06" });

    // Assert
    expect(peer.errors().map((frame) => frame["code"])).toEqual(["not-host"]);
    expect(harness.state().settings.mode).toBe("solo");
  });

  it("TC-MATCH-006: a loadout over eleven items is bad-request", async () => {
    // Arrange
    const { harness, sockets, peerId } = await open(["h", "p2"]);
    const peer = sockets.get(peerId)!;

    // Act
    await harness.message(peer, {
      t: "loadout",
      items: [{ id: "dual", qty: 6 }, { id: "teleport", qty: 6 }],
    });

    // Assert
    expect(peer.errors().map((frame) => frame["code"])).toEqual(["bad-request"]);
    expect(harness.state().members.find((member) => member.playerId === peerId)?.loadout).toBeUndefined();
  });

  it("TC-NET-016: a playerId in the payload cannot re-attribute a frame", async () => {
    // Arrange — `p3` claims to be `p2` while signalling
    const { harness, sockets, hostId } = await open(["h", "p2", "p3"]);
    const p2 = sockets.get("p2")!;
    p2.clear();

    // Act
    await harness.message(sockets.get("p3")!, { t: "signal", to: peerOf(sockets, hostId), playerId: "p2", payload: { kind: "candidate", candidate: "x" } });

    // Assert — the real sender, or a refusal; never the claimed identity
    const delivered = p2.framesOf("signal");
    for (const frame of delivered) expect(frame["from"]).not.toBe("p2");
    expect(delivered).toHaveLength(0);
  });
});

/** The id of a socket other than `except`, for tests that need "the other peer". */
function peerOf(sockets: Map<string, FakeSocket>, except: string): string {
  const found = [...sockets.keys()].find((id) => id !== except);
  if (!found) throw new Error("no other peer");
  return found;
}
