/**
 * Host-only oracle for the `Room` Durable Object (`US-NET-004` sender table, `US-ROOM-003` guards).
 * Only the host may push a snapshot, assign teams, start the match or end it; the guards from
 * `docs/01-overview/workflow-state-machine.md` name the exact rejection code.
 */
import { describe, expect, it } from "vitest";
import { makeSnapshot, RoomHarness, type FakeSocket } from "./support/room-harness";

const IDS = ["host", "p1", "p2", "p3"] as const;

async function lobby(ids: readonly string[] = IDS): Promise<{
  harness: RoomHarness;
  sockets: Map<string, FakeSocket>;
}> {
  const harness = new RoomHarness();
  await harness.ready();
  for (const id of ids) await harness.join({ playerId: id, accountId: `acct-${id}` });
  const sockets = new Map<string, FakeSocket>();
  for (const id of ids) sockets.set(id, await harness.connect(id));
  harness.clearAll(sockets.values());
  return { harness, sockets };
}

async function playing(): Promise<{ harness: RoomHarness; sockets: Map<string, FakeSocket> }> {
  const harness = new RoomHarness();
  await harness.ready();
  const sockets = await harness.startPlaying(IDS);
  harness.clearAll(sockets.values());
  return { harness, sockets };
}

describe("room host-only commands", () => {
  it("TC-NET-044: a peer snapshot_push is not-host and leaves lastSnapshot untouched", async () => {
    const { harness, sockets } = await playing();
    const host = sockets.get("host")!;
    const p1 = sockets.get("p1")!;
    const snapshot = makeSnapshot(1, 1);
    await harness.message(host, { t: "snapshot_push", snapshot });
    host.clear();

    await harness.message(p1, { t: "snapshot_push", snapshot: makeSnapshot(2, 1) });

    expect(p1.errors()).toEqual([
      { t: "error", code: "not-host", detail: "only the host pushes snapshots" },
    ]);
    expect(harness.state().lastSnapshot).toEqual(snapshot);
    expect(host.framesOf("snapshot_state")).toEqual([]);
  });

  it("TC-ROOM-124: a snapshot_push over 8 KB is snapshot-too-large and the previous one is kept", async () => {
    const { harness, sockets } = await playing();
    const host = sockets.get("host")!;
    const previous = makeSnapshot(1, 1);
    await harness.message(host, { t: "snapshot_push", snapshot: previous });
    host.clear();

    const oversized = JSON.stringify({
      t: "snapshot_push",
      snapshot: { ...makeSnapshot(2, 1), filler: "x".repeat(9_000) },
    });
    await harness.message(host, oversized);

    expect(host.errors()).toEqual([
      { t: "error", code: "snapshot-too-large", detail: "a snapshot over 8192 bytes is refused" },
    ]);
    expect(harness.state().lastSnapshot).toEqual(previous);
  });

  it("TC-ROOM-066: a non-host team_assign and start_match are not-host and change no roster", async () => {
    const { harness, sockets } = await lobby();
    const p1 = sockets.get("p1")!;

    await harness.message(p1, {
      t: "team_assign",
      assignments: [
        { playerId: "host", team: "A" },
        { playerId: "p1", team: "B" },
      ],
    });
    expect(p1.errors()).toEqual([
      { t: "error", code: "not-host", detail: "only the host assigns teams" },
    ]);

    p1.clear();
    await harness.message(p1, { t: "start_match" });
    expect(p1.errors()).toEqual([
      { t: "error", code: "not-host", detail: "the room is not ready to start" },
    ]);

    expect(harness.state().status).toBe("lobby");
    // Seats alternate as players join (`US-ROOM-003`), and a refused command leaves them exactly where they were.
    expect(harness.state().members.map((member) => member.team)).toEqual(["A", "B", "A", "B"]);
    for (const socket of sockets.values()) expect(socket.framesOf("match_started")).toEqual([]);
  });

  it("TC-ROOM-164: start_match in a lobby that is not full is room-not-full", async () => {
    const { harness, sockets } = await lobby(["host", "p1"]);
    const host = sockets.get("host")!;
    await harness.message(host, {
      t: "team_assign",
      assignments: [
        { playerId: "host", team: "A" },
        { playerId: "p1", team: "B" },
      ],
    });
    host.clear();

    await harness.message(host, { t: "start_match" });

    expect(host.errors()).toEqual([
      { t: "error", code: "room-not-full", detail: "the room is not ready to start" },
    ]);
    expect(harness.state().status).toBe("lobby");
    expect(harness.state().hostGeneration).toBe(1);
  });

  it("TC-ROOM-165: start_match with unbalanced teams is teams-not-balanced", async () => {
    const { harness, sockets } = await lobby();
    const host = sockets.get("host")!;
    await harness.message(host, {
      t: "team_assign",
      assignments: [
        { playerId: "host", team: "A" },
        { playerId: "p1", team: "A" },
        { playerId: "p2", team: "B" },
        { playerId: "p3", team: null },
      ],
    });
    host.clear();

    await harness.message(host, { t: "start_match" });

    expect(host.errors()).toEqual([
      { t: "error", code: "teams-not-balanced", detail: "the room is not ready to start" },
    ]);
    expect(harness.state().status).toBe("lobby");
    expect(harness.state().hostGeneration).toBe(1);
  });

  it("TC-ROOM-162: settings, teams and loadout are locked in playing and match_end is host-only", async () => {
    const { harness, sockets } = await playing();
    const host = sockets.get("host")!;
    const p1 = sockets.get("p1")!;
    const settingsBefore = harness.state().settings;
    const teamsBefore = harness.state().members.map((member) => member.team);

    await harness.message(host, { t: "room_settings", mode: "score", mapId: "map-07" });
    expect(host.errors()).toEqual([
      { t: "error", code: "invalid-state", detail: "settings are locked once the match starts" },
    ]);

    host.clear();
    await harness.message(host, {
      t: "team_assign",
      assignments: [{ playerId: "p1", team: "B" }],
    });
    expect(host.errors()).toEqual([
      { t: "error", code: "invalid-state", detail: "teams are locked once the match starts" },
    ]);

    p1.clear();
    await harness.message(p1, { t: "loadout", items: [{ id: "itm-grenade", qty: 1 }] });
    expect(p1.errors()).toEqual([
      { t: "error", code: "invalid-state", detail: "the loadout is locked once the match starts" },
    ]);

    host.clear();
    p1.clear();
    await harness.message(p1, {
      t: "match_end",
      winnerTeam: "A",
      stats: [{ slot: 0, damageDealt: 0, shotsFired: 0, hits: 0 }],
    });
    expect(p1.errors()).toEqual([
      { t: "error", code: "not-host", detail: "only the host ends the match" },
    ]);
    expect(host.framesOf("match_recorded")).toEqual([]);

    expect(harness.state().settings).toEqual(settingsBefore);
    expect(harness.state().members.map((member) => member.team)).toEqual(teamsBefore);
    expect(harness.state().status).toBe("playing");
  });
});
