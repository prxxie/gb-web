/**
 * Host election and grace oracle for the `Room` Durable Object (`US-ROOM-005`, `US-ROOM-004`).
 * `docs/02-reference/api/signaling.md` § Host election: the longest-connected peer takes over, the
 * generation goes up by one, and every peer gets `host_changed` with the last snapshot to adopt.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomMember, Snapshot } from "@gbw/core";
import { makeSnapshot, RoomHarness, type FakeSocket } from "./support/room-harness";

const BASE = 1_700_000_000_000;
const IDS = ["host", "p1", "p2", "p3"] as const;

async function playingRoom(): Promise<{ harness: RoomHarness; sockets: Map<string, FakeSocket> }> {
  const harness = new RoomHarness();
  await harness.ready();
  for (const [index, id] of IDS.entries()) {
    vi.setSystemTime(BASE + index * 1_000);
    await harness.join({ playerId: id, accountId: `acct-${id}` });
  }
  vi.setSystemTime(BASE + 10_000);
  const sockets = new Map<string, FakeSocket>();
  for (const id of IDS) sockets.set(id, await harness.connect(id));
  const host = sockets.get("host");
  if (!host) throw new Error("no host socket");
  await harness.message(host, {
    t: "team_assign",
    assignments: IDS.map((id, index) => ({ playerId: id, team: index % 2 === 0 ? "A" : "B" })),
  });
  await harness.message(host, { t: "start_match" });
  harness.clearAll(sockets.values());
  return { harness, sockets };
}

describe("room host election", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("TC-ROOM-048: a host socket that dies in playing promotes the oldest peer with hostGeneration + 1", async () => {
    const { harness, sockets } = await playingRoom();
    const host = sockets.get("host")!;
    const snapshot = makeSnapshot(1, 1);
    await harness.message(host, { t: "snapshot_push", snapshot });
    harness.clearAll(sockets.values());
    const generationBefore = harness.state().hostGeneration;

    // `US-ROOM-005` AC1: authority cannot wait for the seat's grace window, so the promotion is immediate.
    await harness.close(host);

    const frames = sockets.get("p1")!.frames();
    const kinds = frames.map((frame) => frame["t"]);
    // `US-ROOM-004` AC1 also requires a `room_state` after the drop, so the suite pins the two
    // documented frames and their order instead of forbidding the roster refresh in between.
    expect(kinds[0]).toBe("peer_left");
    expect(kinds.filter((kind) => kind === "host_changed")).toHaveLength(1);
    expect(kinds.indexOf("host_changed")).toBeGreaterThan(0);
    expect(kinds.filter((kind) => kind === "room_state").length).toBeGreaterThanOrEqual(1);
    expect(frames[0]).toEqual({ t: "peer_left", playerId: "host", reason: "grace" });

    const changed = sockets.get("p1")!.framesOf("host_changed");
    expect(changed).toHaveLength(1);
    expect(Object.keys(changed[0]!).sort()).toEqual([
      "hostGeneration",
      "hostPlayerId",
      "lastSnapshot",
      "room",
      "t",
    ]);
    expect(changed[0]).toMatchObject({
      hostPlayerId: "p1",
      hostGeneration: generationBefore + 1,
      lastSnapshot: snapshot,
    });
    expect(changed[0]?.["room"]).toMatchObject({
      hostPlayerId: "p1",
      hostGeneration: generationBefore + 1,
    });

    const state = harness.state();
    expect(state.hostPlayerId).toBe("p1");
    expect(state.hostGeneration).toBe(generationBefore + 1);
    expect(state.members.find((member) => member.playerId === "p1")?.role).toBe("host");
    expect(state.members.find((member) => member.playerId === "host")?.role).toBe("player");

    for (const id of ["p2", "p3"]) {
      expect(sockets.get(id)!.framesOf("host_changed")).toHaveLength(1);
    }
  });

  it("TC-ROOM-048: a second promotion moves down the roster and bumps the generation again", async () => {
    const { harness, sockets } = await playingRoom();
    const generationBefore = harness.state().hostGeneration;
    await harness.close(sockets.get("host")!);

    harness.clearAll(sockets.values());
    await harness.close(sockets.get("p1")!);

    const changed = sockets.get("p3")!.framesOf("host_changed");
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({
      hostPlayerId: "p2",
      hostGeneration: generationBefore + 2,
    });
    expect(harness.state().hostPlayerId).toBe("p2");
    expect(harness.state().hostGeneration).toBe(generationBefore + 2);
  });

  it("TC-ROOM-048: the five-second recheck keeps a live host and never promotes twice", async () => {
    const { harness, sockets } = await playingRoom();
    const generationBefore = harness.state().hostGeneration;
    harness.clearAll(sockets.values());
    await harness.close(sockets.get("host")!);

    // `p1` answered, so the recheck at 5 s finds a live host and stops (`AC3` ends here, not in a retry).
    vi.setSystemTime(BASE + 10_000 + 5_000);
    await harness.alarm();

    expect(harness.state().hostPlayerId).toBe("p1");
    expect(harness.state().hostGeneration).toBe(generationBefore + 1);
    expect(sockets.get("p3")!.framesOf("host_changed")).toHaveLength(1);
  });

  it("TC-ROOM-169: when no connected peer is left the match is abandoned, not left hostless", async () => {
    const { harness, sockets } = await playingRoom();
    for (const socket of sockets.values()) await harness.close(socket);

    expect(harness.state().status).toBe("abandoned");
  });

  it("TC-ROOM-127: a peer socket close reports peer_left grace and arms the 20 s alarm", async () => {
    const harness = new RoomHarness();
    await harness.ready();
    vi.setSystemTime(BASE);
    await harness.join({ playerId: "host", accountId: "acct-host" });
    vi.setSystemTime(BASE + 1_000);
    await harness.join({ playerId: "peer", accountId: "acct-peer" });
    const host = await harness.connect("host");
    const peer = await harness.connect("peer");
    harness.clearAll([host, peer]);

    vi.setSystemTime(BASE + 20_000);
    await harness.close(peer);

    expect(host.framesOf("peer_left")).toEqual([{ t: "peer_left", playerId: "peer", reason: "grace" }]);
    expect(host.framesOf("error")).toEqual([]);
    expect(host.framesOf("room_state").length).toBeGreaterThanOrEqual(1);
    expect(harness.state().members.find((member) => member.playerId === "peer")?.connectionState).toBe("grace");
    expect(harness.alarmAt()).toBe(BASE + 20_000 + 20_000);
  });

  it("TC-ROOM-184: a reconnect inside the grace window returns on the same slot and team with the hp from lastSnapshot", async () => {
    // Arrange — the host pushed a snapshot whose slot 3 is down to 70 hp
    const { harness, sockets } = await playingRoom();
    const host = sockets.get("host")!;
    const base = makeSnapshot(4, 1);
    const template = base.players[0];
    if (!template) throw new Error("the harness snapshot has no player slot to copy");
    const wounded: Snapshot = {
      ...base,
      players: [0, 1, 2, 3].map((slot) => ({ ...template, slot, hp: 100 - slot * 10 })),
    };
    await harness.message(host, { t: "snapshot_push", snapshot: wounded });
    const slotBefore = harness.state().members.find((member) => member.playerId === "p3")?.slot;
    await harness.close(sockets.get("p3")!);
    expect(harness.state().members.find((member) => member.playerId === "p3")?.connectionState).toBe("grace");

    // Act — the same subject proves a fresh token 19 s later, still inside the 20 s window
    vi.setSystemTime(BASE + 10_000 + 19_000);
    const again = await harness.connect("p3");

    // Assert — seat, team and hp are the ones the room remembered (`US-ROOM-004` AC2)
    const [state] = again.framesOf("room_state");
    expect(state?.["you"]).toEqual({ playerId: "p3", slot: slotBefore });
    const member = (state?.["room"] as { members: readonly RoomMember[] }).members.find(
      (candidate) => candidate.playerId === "p3",
    );
    expect(member).toMatchObject({ slot: slotBefore, team: "B", connectionState: "connected" });
    expect(harness.state().members.find((candidate) => candidate.playerId === "p3")?.connectionState).toBe(
      "connected",
    );
    const [replay] = again.framesOf("snapshot_state");
    const snapshot = replay?.["snapshot"] as Snapshot;
    expect(snapshot.seq).toBe(4);
    expect(snapshot.players.find((player) => player.slot === slotBefore)?.hp).toBe(70);
  });

  it("TC-ROOM-185: a grace window that runs out turns the seat disconnected in the host's room_state", async () => {
    // Arrange
    const { harness, sockets } = await playingRoom();
    const host = sockets.get("host")!;
    await harness.close(sockets.get("p3")!);
    host.clear();

    // Act — the 20 s alarm that the close armed
    vi.setSystemTime(BASE + 10_000 + 20_000);
    await harness.alarm();

    // Assert — the seat is `disconnected` and the roster frame the host sees agrees.
    // The turn clock itself is host-owned (`snapshot.turn`), so this asserts only the state the DO owns.
    expect(harness.state().members.find((member) => member.playerId === "p3")?.connectionState).toBe(
      "disconnected",
    );
    expect(host.framesOf("peer_left")).toEqual([
      { t: "peer_left", playerId: "p3", reason: "disconnected" },
    ]);
    const rosters = host.framesOf("room_state");
    expect(rosters).toHaveLength(1);
    const members = (rosters[0]?.["room"] as { members: readonly RoomMember[] }).members;
    expect(members.map((member) => `${member.playerId}:${member.connectionState}`)).toEqual([
      "host:connected",
      "p1:connected",
      "p2:connected",
      "p3:disconnected",
    ]);
    expect(harness.state().status).toBe("playing");
  });

  it("TC-ROOM-061: after the host drops, the promoted host's snapshot still reaches the survivor", async () => {
    // Arrange — the old host pushed one snapshot, then its socket dies
    const { harness, sockets } = await playingRoom();
    const oldHost = sockets.get("host")!;
    const promoted = sockets.get("p1")!;
    const survivor = sockets.get("p3")!;
    await harness.message(oldHost, { t: "snapshot_push", snapshot: makeSnapshot(1, 1) });
    await harness.close(oldHost);
    expect(harness.state().hostPlayerId).toBe("p1");
    expect(harness.state().hostGeneration).toBe(2);
    harness.clearAll(sockets.values());

    // Act — the relay is fed by the new host, not by the one that left (`US-ROOM-005` AC6)
    await harness.message(promoted, { t: "snapshot_push", snapshot: makeSnapshot(2, 2) });

    // Assert
    expect(promoted.errors()).toEqual([]);
    expect(promoted.framesOf("snapshot_state")).toEqual([]);
    expect(survivor.errors()).toEqual([]);
    const [delivered] = survivor.framesOf("snapshot_state");
    expect(delivered?.["snapshot"]).toMatchObject({ seq: 2, hostGeneration: 2 });
    expect(harness.state().lastSnapshot?.seq).toBe(2);
  });

  it("TC-ROOM-194: the host that was replaced comes back inside grace as a plain player that cannot push", async () => {
    // `US-ROOM-005` AC4: after a promotion the old host may return, but it is a peer now.
    const { harness, sockets } = await playingRoom();
    const host = sockets.get("host")!;
    await harness.message(host, { t: "snapshot_push", snapshot: makeSnapshot(1, 1) });
    await harness.close(host);
    const latest = harness.state().lastSnapshot?.seq;
    expect(harness.state().hostPlayerId).toBe("p1");

    // Act — the old host reconnects inside the 20 s grace window, then pushes a snapshot
    const returned = await harness.connect("host");
    const roster = harness.state().members.find((member) => member.playerId === "host");
    await harness.message(returned, { t: "snapshot_push", snapshot: makeSnapshot(9, 1) });

    // Assert — it is seated again as a player, and the push is refused without touching the snapshot
    expect(harness.state().hostPlayerId).toBe("p1");
    expect(roster?.connectionState).toBe("connected");
    expect(roster?.role).toBe("player");
    expect(returned.errors()).toEqual([
      { t: "error", code: "not-host", detail: "only the host pushes snapshots" },
    ]);
    expect(harness.state().lastSnapshot?.seq).toBe(latest);
  });

  it("TC-ROOM-191: a promoted host that never becomes live is retried once with the next candidate, then the room is abandoned", async () => {
    // `US-ROOM-005` AC3: five seconds after a promotion the object checks that the new host is live.
    // A force-quit leaves the socket dead in the map the check reads, without a reconnect.
    const { harness, sockets } = await playingRoom();
    const host = sockets.get("host")!;
    const p2 = sockets.get("p2")!;
    const p3 = sockets.get("p3")!;
    harness.clearAll(sockets.values());
    const live = harness.do as unknown as { sockets: Map<string, unknown> };

    await harness.close(host);
    expect(harness.state().hostPlayerId).toBe("p1");
    expect(harness.state().hostGeneration).toBe(2);

    // Act 1 — `p1` was promoted but its socket is gone, so the recheck moves on to the next candidate.
    live.sockets.delete("p1");
    vi.setSystemTime(BASE + 16_000);
    await harness.alarm();

    // Assert — exactly one retry, and it is the next candidate in join order.
    expect(harness.state().hostPlayerId).toBe("p2");
    expect(harness.state().hostGeneration).toBe(3);

    // Act 2 — the single retry is spent: no candidate is left, so the object gives the match up.
    live.sockets.delete("p2");
    live.sockets.delete("p3");
    vi.setSystemTime(BASE + 21_000);
    await harness.alarm();

    // Assert — abandoned, never hostless and never a third promotion.
    expect(harness.state().status).toBe("abandoned");
    expect(harness.state().hostPlayerId).toBe("p2");
    expect(p3.framesOf("host_changed").map((frame) => frame["hostPlayerId"])).toEqual(["p1", "p2"]);
    expect(p2.framesOf("host_changed").map((frame) => frame["hostPlayerId"])).toEqual(["p1", "p2"]);
  });
});
