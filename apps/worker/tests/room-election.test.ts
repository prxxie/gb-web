/**
 * Host election and grace oracle for the `Room` Durable Object (`US-ROOM-005`, `US-ROOM-004`).
 * `docs/02-reference/api/signaling.md` § Host election: the longest-connected peer takes over, the
 * generation goes up by one, and every peer gets `host_changed` with the last snapshot to adopt.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

    // `US-ROOM-005`: the host keeps the role for its 20 s grace window; the alarm elects after it.
    await harness.close(host);
    vi.setSystemTime(BASE + 20_000);
    await harness.alarm();

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
    vi.setSystemTime(BASE + 20_000);
    await harness.alarm();

    harness.clearAll(sockets.values());
    await harness.close(sockets.get("p1")!);
    vi.setSystemTime(BASE + 40_000);
    await harness.alarm();

    const changed = sockets.get("p3")!.framesOf("host_changed");
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({
      hostPlayerId: "p2",
      hostGeneration: generationBefore + 2,
    });
    expect(harness.state().hostPlayerId).toBe("p2");
    expect(harness.state().hostGeneration).toBe(generationBefore + 2);
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
});
