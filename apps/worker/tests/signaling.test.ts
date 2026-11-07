/**
 * `docs/02-reference/api/signaling.md` §2/§3, end to end over the hibernation harness.
 *
 * The relay is the only thing the room is allowed to do with signalling: forward it to one socket, bind the
 * sender from the authenticated socket, and never parse the SDP (`architecture.md` §4).
 */
import { describe, expect, it } from "vitest";
import { RoomHarness, makeSnapshot, type FakeSocket } from "./support/room-harness";

async function playing(ids = ["h", "p2", "p3", "p4"]): Promise<{
  harness: RoomHarness;
  sockets: Map<string, FakeSocket>;
}> {
  const harness = new RoomHarness();
  await harness.ready();
  const sockets = await harness.startPlaying(ids);
  return { harness, sockets };
}

function socket(sockets: Map<string, FakeSocket>, id: string): FakeSocket {
  const found = sockets.get(id);
  if (!found) throw new Error(`no socket for ${id}`);
  return found;
}

describe("offer / answer / candidate relay (§ 2)", () => {
  it("TC-ROOM-050: an offer reaches only its target and carries the authenticated sender", async () => {
    // Arrange
    const { harness, sockets } = await playing();
    const host = socket(sockets, "h");
    const p2 = socket(sockets, "p2");
    const p3 = socket(sockets, "p3");
    for (const peer of [p2, p3]) peer.clear();
    const offer = { kind: "offer" as const, sdp: "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n" };

    // Act
    await harness.message(host, { t: "signal", to: "p2", payload: offer });

    // Assert — "relayed verbatim": the DO is not allowed to rewrite the SDP
    const [delivered] = p2.framesOf("signal");
    expect(delivered?.["from"]).toBe("h");
    expect(delivered?.["payload"]).toEqual(offer);
    expect(p3.framesOf("signal")).toHaveLength(0);
    expect(host.framesOf("signal")).toHaveLength(0);
  });

  it("TC-ROOM-050: an answer is relayed back to the offerer", async () => {
    // Arrange
    const { harness, sockets } = await playing();
    const host = socket(sockets, "h");
    const p2 = socket(sockets, "p2");
    host.clear();
    const answer = { kind: "answer" as const, sdp: "v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\n" };

    // Act
    await harness.message(p2, { t: "signal", to: "h", payload: answer });

    // Assert
    const [delivered] = host.framesOf("signal");
    expect(delivered?.["from"]).toBe("p2");
    expect(delivered?.["payload"]).toEqual(answer);
  });

  it("TC-ROOM-050: a candidate is relayed with its payload untouched", async () => {
    // Arrange
    const { harness, sockets } = await playing();
    const host = socket(sockets, "h");
    const p3 = socket(sockets, "p3");
    p3.clear();
    const candidate = {
      kind: "candidate" as const,
      candidate: { candidate: "candidate:1 1 UDP 2122260223 10.0.0.1 54321 typ host", sdpMid: "0", sdpMLineIndex: 0 },
    };

    // Act
    await harness.message(host, { t: "signal", to: "p3", payload: candidate });

    // Assert
    const [delivered] = p3.framesOf("signal");
    expect(delivered?.["payload"]).toEqual(candidate);
  });

  it("TC-ROOM-051: a peer whose socket closed answers peer-not-connected, not a silent drop", async () => {
    // Arrange
    const { harness, sockets } = await playing();
    const host = socket(sockets, "h");
    await harness.close(socket(sockets, "p3"));
    host.clear();

    // Act
    await harness.message(host, { t: "signal", to: "p3", payload: { kind: "offer", sdp: "v=0" } });

    // Assert
    expect(host.errors().map((frame) => frame["code"])).toEqual(["peer-not-connected"]);
  });
});

describe("snapshot relay and stale drop (§ 3)", () => {
  it("TC-ROOM-058: a snapshot is relayed to every other member of the room", async () => {
    // Arrange
    const { harness, sockets } = await playing();
    const host = socket(sockets, "h");
    for (const id of ["p2", "p3", "p4"]) socket(sockets, id).clear();

    // Act
    await harness.message(host, { t: "snapshot_push", snapshot: makeSnapshot(1) });

    // Assert
    for (const id of ["p2", "p3", "p4"]) {
      const [frame] = socket(sockets, id).framesOf("snapshot_state");
      // Packed on the wire (`US-NET-002` AC7): `s` is `seq`, `g` is `hostGeneration`.
      expect((frame?.["snapshot"] as { s?: number } | undefined)?.s).toBe(1);
    }
    expect(host.framesOf("snapshot_state")).toHaveLength(0);
    expect(harness.state().lastSnapshot?.seq).toBe(1);
  });

  it("TC-ROOM-058: a snapshot whose seq is not newer is dropped without an error", async () => {
    // Arrange
    const { harness, sockets } = await playing();
    const host = socket(sockets, "h");
    await harness.message(host, { t: "snapshot_push", snapshot: makeSnapshot(5) });
    const p2 = socket(sockets, "p2");
    p2.clear();
    host.clear();

    // Act — same seq, then an older one
    await harness.message(host, { t: "snapshot_push", snapshot: makeSnapshot(5) });
    await harness.message(host, { t: "snapshot_push", snapshot: makeSnapshot(4) });

    // Assert — signaling.md §3: "a seq at or below the stored one is dropped silently"
    expect(p2.framesOf("snapshot_state")).toHaveLength(0);
    expect(host.errors()).toHaveLength(0);
    expect(harness.state().lastSnapshot?.seq).toBe(5);
  });

  it("TC-ROOM-203: a reconnecting member is replayed room_state and the last snapshot", async () => {
    // Arrange
    const { harness, sockets } = await playing();
    const host = socket(sockets, "h");
    await harness.message(host, { t: "snapshot_push", snapshot: makeSnapshot(3) });
    await harness.close(socket(sockets, "p2"));

    // Act
    const again = await harness.connect("p2");

    // Assert — the reconnect continues the match instead of restarting it
    const [state] = again.framesOf("room_state");
    expect(state?.["you"]).toEqual({ playerId: "p2", slot: 1 });
    const [snapshot] = again.framesOf("snapshot_state");
    expect((snapshot?.["snapshot"] as { s?: number } | undefined)?.s).toBe(3);
  });
});

describe("host change and presence (§ 3)", () => {
  it("TC-ROOM-061: host_changed hands the newest snapshot to the new host", async () => {
    // Arrange
    const { harness, sockets } = await playing();
    const host = socket(sockets, "h");
    await harness.message(host, { t: "snapshot_push", snapshot: makeSnapshot(11) });
    const p2 = socket(sockets, "p2");
    p2.clear();
    await harness.close(host);

    // Act
    await harness.alarm();

    // Assert
    const [changed] = p2.framesOf("host_changed");
    expect(changed?.["hostPlayerId"]).toBe("p2");
    expect((changed?.["lastSnapshot"] as { seq: number } | undefined)?.seq).toBe(11);
    expect((changed?.["room"] as { status: string }).status).toBe("playing");
  });

  it("TC-ROOM-062: a member's leave is announced and the roster shrinks", async () => {
    // Arrange
    const { harness, sockets } = await playing();
    const p2 = socket(sockets, "p2");
    const host = socket(sockets, "h");
    host.clear();

    // Act
    await harness.message(p2, { t: "leave" });

    // Assert
    expect(harness.state().members.map((member) => member.playerId)).toEqual(["h", "p3", "p4"]);
    const [left] = host.framesOf("peer_left");
    expect(left?.["playerId"]).toBe("p2");
    expect(left?.["reason"]).toBe("left");
    expect(host.framesOf("room_state").length).toBeGreaterThan(0);
  });

  it("TC-ROOM-063: a new socket announces peer_joined to the others and room_state to itself", async () => {
    // Arrange
    const harness = new RoomHarness();
    await harness.ready();
    await harness.join({ playerId: "h", accountId: "acct-h" });
    const host = await harness.connect("h");
    host.clear();

    // Act
    await harness.join({ playerId: "p2", accountId: "acct-p2" });
    await harness.connect("p2");

    // Assert
    const [joined] = host.framesOf("peer_joined");
    expect(joined?.["playerId"]).toBe("p2");
    expect(joined?.["slot"]).toBe(1);
  });

  it("TC-ROOM-064: ping is answered with pong carrying the sent timestamp", async () => {
    // Arrange
    const { harness, sockets } = await playing();
    const p2 = socket(sockets, "p2");
    p2.clear();

    // Act
    await harness.message(p2, { t: "ping", at: 1234 });

    // Assert
    const [pong] = p2.framesOf("pong");
    expect(pong?.["at"]).toBe(1234);
    expect(pong?.["now"]).toBeTypeOf("number");
  });
});

describe("budgets (signaling.md §2 table, US-NET-004 §5)", () => {
  it("TC-ROOM-065: an eleventh ping in one second is rate-limited", async () => {
    // Arrange
    const { harness, sockets } = await playing();
    const p2 = socket(sockets, "p2");

    // Act
    for (let at = 0; at < 12; at += 1) await harness.message(p2, { t: "ping", at });

    // Assert — §2: "ping | ≤ 10/s | rate-limited"
    expect(p2.errors().map((frame) => frame["code"])).toEqual(["rate-limited"]);
  });

  it("TC-ROOM-065: a twenty-first signal in one second is rate-limited", async () => {
    // Arrange
    const { harness, sockets } = await playing();
    const host = socket(sockets, "h");
    const p2 = socket(sockets, "p2");

    // Act
    for (let index = 0; index < 25; index += 1) {
      await harness.message(p2, { t: "signal", to: "h", payload: {
        kind: "candidate",
        candidate: { candidate: `candidate:${index} 1 UDP 2122260223 10.0.0.1 5432${index} typ host`, sdpMid: "0", sdpMLineIndex: 0 },
      },
    });
    }

    // Assert — §5: "signal 20/s"
    expect(p2.errors().map((frame) => frame["code"])).toEqual(["rate-limited"]);
    expect(host.framesOf("signal").length).toBeLessThanOrEqual(20);
  });

  it("TC-ROOM-065: a third chat message in one second is rate-limited", async () => {
    // Arrange
    const { harness, sockets } = await playing();
    const host = socket(sockets, "h");
    const p2 = socket(sockets, "p2");
    host.clear();

    // Act
    for (const text of ["gg", "nice shot", "one more"]) await harness.message(p2, { t: "chat", text });

    // Assert — §4 documents `chat` as a client frame; §5 budgets it at 2/s
    expect(p2.errors().map((frame) => frame["code"])).toEqual(["rate-limited"]);
  });
});
