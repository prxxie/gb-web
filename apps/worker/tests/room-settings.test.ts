/**
 * Settings / loadout / input-relay oracle for the `Room` Durable Object (`US-ROOM-007`, `US-NET-004`
 * § Contract). A host owns the mode and map in the lobby, every member owns its loadout, and
 * `move`/`item` are relayed to the host only — the Worker is not a gameplay authority (`ADR-0004`).
 */
import { describe, expect, it } from "vitest";
import { RoomHarness, type FakeSocket } from "./support/room-harness";

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

describe("room settings and input relay", () => {
  it("TC-NET-067: room_settings from the host applies mode and map and broadcasts room_state", async () => {
    const { harness, sockets } = await lobby();
    const host = sockets.get("host")!;

    await harness.message(host, { t: "room_settings", mode: "score", mapId: "map-07" });

    expect(harness.state().settings).toMatchObject({ mode: "score", mapId: "map-07", maxPlayers: 4 });
    for (const socket of sockets.values()) {
      const broadcasts = socket.frames();
      expect(broadcasts).toHaveLength(1);
      expect(broadcasts[0]).toMatchObject({
        t: "room_state",
        room: { settings: { mode: "score", mapId: "map-07" } },
      });
    }
    expect(sockets.get("p1")!.errors()).toEqual([]);
  });

  it("TC-NET-067: room_settings from a member is not-host and leaves the settings alone", async () => {
    const { harness, sockets } = await lobby();
    const host = sockets.get("host")!;
    const p1 = sockets.get("p1")!;
    const before = harness.state().settings;

    await harness.message(p1, { t: "room_settings", mode: "jewel", mapId: "map-03" });

    expect(p1.errors()).toEqual([
      { t: "error", code: "not-host", detail: "only the host changes the room settings" },
    ]);
    expect(harness.state().settings).toEqual(before);
    expect(host.frames()).toEqual([]);
  });

  it("TC-NET-067: move and item from a peer reach the host only", async () => {
    const { harness, sockets } = await lobby();
    const host = sockets.get("host")!;
    const p1 = sockets.get("p1")!;
    const p2 = sockets.get("p2")!;
    const p3 = sockets.get("p3")!;
    await harness.message(host, {
      t: "team_assign",
      assignments: IDS.map((id, index) => ({ playerId: id, team: index % 2 === 0 ? "A" : "B" })),
    });
    await harness.message(host, { t: "start_match" });
    harness.clearAll(sockets.values());

    await harness.message(p1, { t: "move", direction: 1, run: true });

    expect(host.frames()).toEqual([{ t: "move", from: "p1", direction: 1, run: true }]);
    expect(p1.frames()).toEqual([]);
    expect(p2.frames()).toEqual([]);
    expect(p3.frames()).toEqual([]);

    host.clear();
    await harness.message(p1, { t: "item", id: "itm-grenade" });

    expect(host.frames()).toEqual([{ t: "item", from: "p1", id: "itm-grenade" }]);
    expect(p2.frames()).toEqual([]);
    expect(p3.frames()).toEqual([]);

    host.clear();
    await harness.message(host, { t: "move", direction: 0, run: false });
    expect(host.frames()).toEqual([]);
  });

  it("TC-NET-067: move and item outside playing are invalid-state and are not relayed", async () => {
    const { harness, sockets } = await lobby(["host", "p1"]);
    const host = sockets.get("host")!;
    const p1 = sockets.get("p1")!;

    await harness.message(p1, { t: "move", direction: 0, run: false });
    expect(p1.errors()).toEqual([
      { t: "error", code: "invalid-state", detail: "the match has not started" },
    ]);

    p1.clear();
    await harness.message(p1, { t: "item", id: "itm-grenade" });
    expect(p1.errors()).toEqual([
      { t: "error", code: "invalid-state", detail: "the match has not started" },
    ]);
    expect(host.frames()).toEqual([]);
  });

  it("TC-ROOM-167: a lobby loadout of eleven is kept and a twelfth item is refused", async () => {
    const { harness, sockets } = await lobby(["host", "p1"]);
    const p1 = sockets.get("p1")!;

    await harness.message(p1, { t: "loadout", items: [{ id: "itm-grenade", qty: 11 }] });
    expect(harness.state().members.find((member) => member.playerId === "p1")?.loadout).toEqual([
      { id: "itm-grenade", qty: 11 },
    ]);

    p1.clear();
    await harness.message(p1, { t: "loadout", items: [{ id: "itm-grenade", qty: 11 }, { id: "itm-medkit", qty: 1 }] });

    expect(p1.errors()).toEqual([
      { t: "error", code: "bad-request", detail: "a loadout may hold at most 11 items in total" },
    ]);
    expect(harness.state().members.find((member) => member.playerId === "p1")?.loadout).toEqual([
      { id: "itm-grenade", qty: 11 },
    ]);
  });

  it("TC-ROOM-166: match_started carries the chosen mode, map and each assignment's loadout", async () => {
    const { harness, sockets } = await lobby();
    const host = sockets.get("host")!;
    const loadout = [{ id: "itm-grenade", qty: 2 }];
    await harness.message(host, { t: "room_settings", mode: "tag", mapId: "map-03" });
    await harness.message(sockets.get("p1")!, { t: "loadout", items: loadout });
    await harness.message(host, {
      t: "team_assign",
      assignments: IDS.map((id, index) => ({ playerId: id, team: index % 2 === 0 ? "A" : "B" })),
    });
    harness.clearAll(sockets.values());

    await harness.message(host, { t: "start_match" });

    const started = sockets.get("p1")!.framesOf("match_started");
    expect(started).toHaveLength(1);
    const frame = started[0]!;
    expect(Object.keys(frame).sort()).toEqual([
      "assignments",
      "hostGeneration",
      "hostPlayerId",
      "room",
      "rulesetVersion",
      "seed",
      "startedAt",
      "t",
    ]);
    expect(frame["room"]).toMatchObject({ settings: { mode: "tag", mapId: "map-03" } });
    const assignments = frame["assignments"] as readonly {
      readonly playerId: string;
      readonly loadout: readonly { readonly id: string; readonly qty: number }[];
    }[];
    expect(assignments.find((assignment) => assignment.playerId === "p1")?.loadout).toEqual(loadout);
    expect(harness.state().status).toBe("playing");
  });
});
