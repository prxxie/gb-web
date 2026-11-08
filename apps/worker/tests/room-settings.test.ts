/**
 * Settings / loadout / input-relay oracle for the `Room` Durable Object (`US-ROOM-007`, `US-NET-004`
 * § Contract). A host owns the mode and map in the lobby, every member owns its loadout, and
 * `move`/`item` are relayed to the host only — the Worker is not a gameplay authority (`ADR-0004`).
 */
import { describe, expect, it, vi } from "vitest";
import { ITEMS } from "@gbw/core";
import { RoomHarness, makeSnapshot, type FakeSocket } from "./support/room-harness";

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
    // `US-NET-004` AC2: an input is only relayed for the slot the last snapshot says is active.
    await harness.message(host, { t: "snapshot_push", snapshot: { ...makeSnapshot(1), turn: { ...makeSnapshot(1).turn, activeSlot: 1 } } });
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

  it("TC-ROOM-708: a loadout frame carries the mobile and room_state echoes it", async () => {
    const { harness, sockets } = await lobby(["host", "p1"]);
    const p1 = sockets.get("p1")!;

    await harness.message(p1, { t: "loadout", items: [{ id: "itm-blood", qty: 2 }], mobileId: "mbl-07" });

    expect(p1.errors()).toEqual([]);
    const mine = harness.state().members.find((member) => member.playerId === "p1");
    expect(mine).toMatchObject({ mobileId: "mbl-07", loadout: [{ id: "itm-blood", qty: 2 }] });
    // The AC is about the room carrying it, not this socket remembering it.
    for (const socket of sockets.values()) {
      expect(socket.framesOf("room_state").at(-1)).toMatchObject({
        room: { members: expect.arrayContaining([expect.objectContaining({ playerId: "p1", mobileId: "mbl-07" })]) },
      });
    }
  });

  it("TC-ROOM-708: an items-only loadout keeps the mobile already picked", async () => {
    const { harness, sockets } = await lobby(["host", "p1"]);
    const p1 = sockets.get("p1")!;

    await harness.message(p1, { t: "loadout", items: [], mobileId: "mbl-07" });
    // The item picker sends `items` alone; it must not reset the mobile to the seat's join default.
    await harness.message(p1, { t: "loadout", items: [{ id: "itm-blood", qty: 1 }] });

    expect(p1.errors()).toEqual([]);
    expect(harness.state().members.find((member) => member.playerId === "p1")).toMatchObject({
      mobileId: "mbl-07",
      loadout: [{ id: "itm-blood", qty: 1 }],
    });
  });

  it("TC-ROOM-708: a mobile-only loadout keeps the items already picked", async () => {
    const { harness, sockets } = await lobby(["host", "p1"]);
    const p1 = sockets.get("p1")!;

    await harness.message(p1, { t: "loadout", items: [{ id: "itm-blood", qty: 2 }] });
    // The grid sends the mobile alone; a second tab's item list must survive it.
    await harness.message(p1, { t: "loadout", mobileId: "mbl-11" });

    expect(p1.errors()).toEqual([]);
    expect(harness.state().members.find((member) => member.playerId === "p1")).toMatchObject({
      mobileId: "mbl-11",
      loadout: [{ id: "itm-blood", qty: 2 }],
    });
  });

  it("TC-ROOM-708: a loadout frame that says nothing is refused", async () => {
    const { harness, sockets } = await lobby(["host", "p1"]);
    const p1 = sockets.get("p1")!;

    await harness.message(p1, { t: "loadout" });

    expect(p1.errors().map((frame) => frame["detail"])).toEqual(["loadout needs items, mobileId, or both"]);
  });

  it("TC-ROOM-708: two members may hold the same mobile", async () => {
    const { harness, sockets } = await lobby(["host", "p1", "p2"]);

    await harness.message(sockets.get("p1")!, { t: "loadout", items: [], mobileId: "mbl-05" });
    await harness.message(sockets.get("p2")!, { t: "loadout", items: [], mobileId: "mbl-05" });

    expect(sockets.get("p1")!.errors()).toEqual([]);
    expect(sockets.get("p2")!.errors()).toEqual([]);
    const seated = harness.state().members.filter((member) => member.mobileId === "mbl-05").map((member) => member.playerId);
    expect(seated).toEqual(["p1", "p2"]);
  });

  it("TC-ROOM-708: an unknown mobile is refused and leaves the record alone", async () => {
    const { harness, sockets } = await lobby(["host", "p1"]);
    const p1 = sockets.get("p1")!;

    await harness.message(p1, { t: "loadout", items: [], mobileId: "mbl-99" });

    expect(p1.errors()).toEqual([{ t: "error", code: "bad-request", detail: "loadout.mobileId must be a shipped mobile" }]);
    expect(harness.state().members.find((member) => member.playerId === "p1")?.mobileId).toBe("mbl-01");
  });

  it("TC-ROOM-708: the pick survives a reconnect that does not resend it", async () => {
    const { harness, sockets } = await lobby(["host", "p1"]);
    const first = sockets.get("p1")!;
    await harness.message(first, { t: "loadout", items: [], mobileId: "mbl-09" });
    await harness.close(first);

    // A reloaded page authenticates without a mobile (`apps/web/src/routes/LobbyPage.tsx`), which must not
    // quietly reset the record to the room's default.
    const second = await harness.connect("p1");

    expect(second.errors()).toEqual([]);
    expect(harness.state().members.find((member) => member.playerId === "p1")?.mobileId).toBe("mbl-09");
    expect(second.framesOf("room_state").at(-1)).toMatchObject({
      room: { members: expect.arrayContaining([expect.objectContaining({ playerId: "p1", mobileId: "mbl-09" })]) },
    });
  });

  it("TC-ROOM-712: a hand at the loadout screen never trips the budget", async () => {
    // A frozen clock: the window is one real second, and a loaded CI box would otherwise scroll past it mid-loop.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-08T10:00:00Z"));
    const { harness, sockets } = await lobby(["host", "p1"]);
    const p1 = sockets.get("p1")!;

    // Eleven item taps plus a mobile tap: the busiest second the UI can produce, well inside `control` (20/s).
    // Tripping it would close the socket with `4429`, which the client reads as fatal — a pick must never end a lobby.
    for (const item of ITEMS) await harness.message(p1, { t: "loadout", items: [{ id: item.itemId, qty: 1 }] });
    await harness.message(p1, { t: "loadout", mobileId: "mbl-03" });

    expect(p1.errors()).toEqual([]);
    expect(p1.closes).toEqual([]);
    expect(harness.state().members.find((member) => member.playerId === "p1")?.mobileId).toBe("mbl-03");
    vi.useRealTimers();
  });

  it("TC-ROOM-712: a flood of lobby writes in one second is rate-limited", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-08T10:00:00Z"));
    const { harness, sockets } = await lobby(["host", "p1"]);
    const p1 = sockets.get("p1")!;

    // Twenty are the budget (`signaling.md` § Budgets: `control` ≤ 20/s); each one persists and broadcasts.
    for (let attempt = 0; attempt < 21; attempt += 1) {
      await harness.message(p1, { t: "loadout", mobileId: "mbl-03" });
    }

    expect(p1.errors().map((frame) => frame["code"])).toEqual(["rate-limited"]);
    // The refusal ends the socket (`4429`), which is why the budget has to sit far above a hand.
    expect(p1.closes.map((close) => close.code)).toEqual([4429]);
    expect(harness.state().members.find((member) => member.playerId === "p1")?.mobileId).toBe("mbl-03");
    vi.useRealTimers();
  });

  it("TC-ROOM-708: a loadout padded past the frame budget is refused", async () => {
    const { harness, sockets } = await lobby(["host", "p1"]);
    const p1 = sockets.get("p1")!;

    // `signaling.md` § Budgets caps the lobby writes at 1 KB; padding with `qty: 0` entries must not buy more.
    const padding = Array.from({ length: 200 }, () => ({ id: "itm-blood", qty: 0 }));
    await harness.message(p1, { t: "loadout", items: padding });

    expect(p1.errors().map((frame) => frame["code"])).toEqual(["payload-too-large"]);
    expect(harness.state().members.find((member) => member.playerId === "p1")?.loadout).toBeUndefined();
  });

  it("TC-ROOM-711: match_started carries the mobile each member picked", async () => {
    const { harness, sockets } = await lobby();
    const host = sockets.get("host")!;

    await harness.message(sockets.get("p1")!, { t: "loadout", items: [], mobileId: "mbl-12" });
    await harness.message(host, {
      t: "team_assign",
      assignments: IDS.map((id, index) => ({ playerId: id, team: index % 2 === 0 ? "A" : "B" })),
    });
    harness.clearAll(sockets.values());

    await harness.message(host, { t: "start_match" });

    const assignments = sockets.get("p1")!.framesOf("match_started")[0]!["assignments"] as readonly {
      readonly playerId: string;
      readonly mobileId: string;
    }[];
    expect(assignments.find((assignment) => assignment.playerId === "p1")?.mobileId).toBe("mbl-12");
    // The client builds its seats from `room.members` (`apps/web/src/routes/LobbyPage.tsx`), so both views must agree.
    const room = sockets.get("p1")!.framesOf("match_started")[0]!["room"] as {
      readonly members: readonly { readonly playerId: string; readonly mobileId: string }[];
    };
    expect(room.members.find((member) => member.playerId === "p1")?.mobileId).toBe("mbl-12");
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

describe("TC-ROOM-206: only the active player's input is relayed (US-CORE-008 AC6)", () => {
  it("drops a move from a peer whose slot the host did not make active", async () => {
    const { harness, sockets } = await lobby();
    const host = sockets.get("host")!;
    const p1 = sockets.get("p1")!;
    const p2 = sockets.get("p2")!;
    await harness.message(host, {
      t: "team_assign",
      assignments: IDS.map((id, index) => ({ playerId: id, team: index % 2 === 0 ? "A" : "B" })),
    });
    await harness.message(host, { t: "start_match" });
    // The host is authoritative: it names slot 1 as active, so p1 may act and p2 may not.
    const active = { ...makeSnapshot(1), turn: { ...makeSnapshot(1).turn, activeSlot: 1 } };
    await harness.message(host, { t: "snapshot_push", snapshot: active });
    harness.clearAll(sockets.values());

    await harness.message(p2, { t: "move", direction: 1, run: true });

    expect(host.frames()).toEqual([]);
    expect(p1.frames()).toEqual([]);

    await harness.message(p1, { t: "move", direction: 1, run: true });
    expect(host.frames()).toEqual([{ t: "move", from: "p1", direction: 1, run: true }]);
  });
});

describe("TC-ROOM-207: the host's settings reach the match (US-CORE-012 AC4)", () => {
  it("keeps mode and map on the room and announces them in `match_started`", async () => {
    const { harness, sockets } = await lobby();
    const host = sockets.get("host")!;
    await harness.message(host, { t: "room_settings", mode: "jewel", mapId: "map-06" });
    expect(harness.state().settings).toMatchObject({ mode: "jewel", mapId: "map-06" });

    await harness.message(host, {
      t: "team_assign",
      assignments: IDS.map((id, index) => ({ playerId: id, team: index % 2 === 0 ? "A" : "B" })),
    });
    harness.clearAll(sockets.values());
    await harness.message(host, { t: "start_match" });

    // Every peer learns the map and mode from the frame, not from its own memory of the lobby.
    for (const id of IDS) {
      if (id === "host") continue;
      const [started] = sockets.get(id)!.framesOf("match_started");
      expect(started?.["room"]).toMatchObject({ settings: { mode: "jewel", mapId: "map-06" } });
    }
  });
});

