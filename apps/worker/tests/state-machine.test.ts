/**
 * `docs/01-overview/workflow-state-machine.md` — every row of the lifecycle table, legal and illegal.
 *
 * The table is the contract the Worker relies on: a transition that is not listed must be refused, and a
 * listed one must leave the room in exactly the documented state. `TC-ROOM-162` is the "ended is final" row.
 */
import { describe, expect, it } from "vitest";
import type { RoomState } from "@gbw/core";
import { RoomHarness, makeSnapshot, type FakeSocket } from "./support/room-harness";
import { createRig } from "./support/fake-env";

type Mutable = { room: RoomState };

function instance(harness: RoomHarness): Mutable {
  return harness.do as unknown as Mutable;
}

function status(harness: RoomHarness): string {
  return instance(harness).room.status;
}

function moveClock(harness: RoomHarness, patch: Partial<Pick<RoomState, "createdAt" | "lastActivityAt">>): void {
  instance(harness).room = { ...instance(harness).room, ...patch };
}

async function lobby(seats = 4): Promise<{ harness: RoomHarness; sockets: Map<string, FakeSocket>; ids: string[] }> {
  const harness = new RoomHarness();
  await harness.ready();
  const ids = ["h", "p2", "p3", "p4"].slice(0, seats);
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
  return { harness, sockets, ids };
}

async function play(seats = 4): Promise<{ harness: RoomHarness; sockets: Map<string, FakeSocket>; ids: string[] }> {
  const room = await lobby(seats);
  const host = room.sockets.get(room.ids[0]!)!;
  await room.harness.message(host, {
    t: "team_assign",
    assignments: room.ids.map((id, index) => ({ playerId: id, team: index % 2 === 0 ? "A" : "B" })),
  });
  await room.harness.message(host, { t: "start_match" });
  expect(status(room.harness)).toBe("playing");
  return room;
}

describe("— → lobby (POST /rooms)", () => {
  it("TC-ROOM-155: a created room starts in the lobby with a ten-minute idle alarm", async () => {
    // Arrange
    const rig = createRig();
    const token = await rig.token({ kind: "account", accountId: "acct-1", guestId: null });

    // Act
    const response = await rig.request("POST", "/rooms", { body: { displayName: "Host", maxPlayers: 4 }, token });

    // Assert
    expect(response.status).toBe(201);
    const body = (await response.json()) as { roomCode: string };
    const room = await rig.rooms.room(body.roomCode);
    expect((room as unknown as Mutable).room.status).toBe("lobby");
    rig.db.close();
  });
});

describe("lobby → lobby, lobby → playing", () => {
  it("TC-ROOM-156: team_assign and peer_joined leave the status in the lobby", async () => {
    // Arrange
    const { harness, sockets, ids } = await lobby();
    const host = sockets.get(ids[0]!)!;

    // Act
    await harness.message(host, {
      t: "team_assign",
      assignments: ids.map((id, index) => ({ playerId: id, team: index % 2 === 0 ? "A" : "B" })),
    });

    // Assert
    expect(status(harness)).toBe("lobby");
    expect(harness.state().members.every((member) => member.team !== null)).toBe(true);
  });

  it("TC-ROOM-157: start_match satisfies the playing invariant (slots, teams, status)", async () => {
    // Arrange
    const { harness, ids } = await lobby();

    // Act — `play` asserts the transition itself
    const started = await play();

    // Assert — "playing ⇒ matchStartedAt is set and every member has a slot and a team"
    expect(status(started.harness)).toBe("playing");
    expect(started.harness.state().members.map((member) => member.slot).sort()).toEqual([0, 1, 2, 3]);
    expect(started.harness.state().members.every((member) => member.team === "A" || member.team === "B")).toBe(true);
    expect(started.ids).toEqual(ids);
    expect(harness).not.toBe(started.harness);
  });
});

describe("playing → playing", () => {
  it("TC-ROOM-158: a snapshot keeps the room playing and stores one snapshot", async () => {
    // Arrange
    const { harness, sockets, ids } = await play();
    const host = sockets.get(ids[0]!)!;

    // Act
    await harness.message(host, { t: "snapshot_push", snapshot: makeSnapshot(1) });

    // Assert
    expect(status(harness)).toBe("playing");
    expect(harness.state().lastSnapshot?.seq).toBe(1);
  });
});

describe("playing → ended, and ended is final (TC-ROOM-162)", () => {
  it("TC-ROOM-162: match_end ends the room and nothing returns it to playing", async () => {
    // Arrange
    const { harness, sockets, ids } = await play();
    const host = sockets.get(ids[0]!)!;

    // Act
    await harness.message(host, { t: "match_end", winnerTeam: "A", stats: [] });
    expect(status(harness)).toBe("ended");

    // Assert — the illegal moves: start again, push a snapshot, end twice, assign teams
    for (const frame of [
      { t: "start_match" },
      { t: "snapshot_push", snapshot: makeSnapshot(1) },
      { t: "team_assign", assignments: [{ playerId: ids[0], team: "B" }] },
    ]) {
      const before = host.errors().length;
      await harness.message(host, frame);
      expect(host.errors()).toHaveLength(before + 1);
      expect(host.errors().at(-1)?.["code"]).toBe("invalid-state");
      expect(status(harness)).toBe("ended");
    }
    // A second `match_end` is the documented retry path, so it must not mutate the result either.
    await harness.message(host, { t: "match_end", winnerTeam: "B", stats: [] });
    expect(status(harness)).toBe("ended");
  });

  it("TC-ROOM-162: a room that never started cannot jump straight to ended", async () => {
    // Arrange
    const { harness, sockets, ids } = await lobby();
    const host = sockets.get(ids[0]!)!;

    // Act
    await harness.message(host, { t: "match_end", winnerTeam: "A", stats: [] });

    // Assert — lobby → ended is not in the table
    expect(status(harness)).toBe("lobby");
    expect(host.errors().map((frame) => frame["code"])).toEqual(["invalid-state"]);
  });

  it("TC-ROOM-162: a member's leave after the match ended does not reopen it", async () => {
    // Arrange
    const { harness, sockets, ids } = await play();
    const host = sockets.get(ids[0]!)!;
    await harness.message(host, { t: "match_end", winnerTeam: "B", stats: [] });

    // Act
    await harness.message(sockets.get("p2")!, { t: "leave" });

    // Assert
    expect(status(harness)).toBe("ended");
    const join = await harness.do.fetch(
      new Request("https://room.gbw.test/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId: "p9", guestId: "guest-p9", displayName: "p9", roomCode: "ABCD23" }),
      }),
    );
    expect(join.status).toBe(410);
  });
});

describe("playing → abandoned", () => {
  it("TC-ROOM-159: a room whose members all expired their grace is abandoned", async () => {
    // Arrange
    const { harness, sockets } = await play();
    for (const socket of sockets.values()) await harness.close(socket);

    // Act — two sweeps: the first marks grace, the second disconnects
    await harness.alarm();
    await harness.alarm();

    // Assert — table row: "playing → abandoned: every member's grace expired"
    expect(status(harness)).toBe("abandoned");
  });
});

describe("ended / abandoned → closed", () => {
  it("TC-ROOM-160: an idle abandoned room is deleted and refuses further joins", async () => {
    // Arrange
    const { harness, sockets, ids } = await play();
    await harness.message(sockets.get(ids[0]!)!, { t: "match_end", winnerTeam: "A", stats: [] });
    moveClock(harness, { lastActivityAt: Date.now() - 11 * 60_000 });

    // Act
    await harness.alarm();

    // Assert
    expect(harness.storageKeys()).toEqual([]);
    expect(status(harness)).not.toBe("playing");
    const join = await harness.do.fetch(
      new Request("https://room.gbw.test/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId: "late", guestId: "guest-late", displayName: "late", roomCode: "ABCD23" }),
      }),
    );
    expect(join.status).toBe(410);
  });

  it("TC-ROOM-160: a room abandoned before it started cannot be restarted", async () => {
    // Arrange
    const { harness, sockets, ids } = await lobby();
    await harness.do.fetch(
      new Request("https://room.gbw.test/leave", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId: ids[1] }),
      }),
    );
    for (const socket of sockets.values()) await harness.close(socket);
    moveClock(harness, { lastActivityAt: Date.now() - 11 * 60_000 });
    await harness.alarm();

    // Act
    await harness.message(sockets.get(ids[0]!)!, { t: "start_match" });

    // Assert
    expect(status(harness)).not.toBe("playing");
    expect(status(harness)).toBe("abandoned");
  });
});

describe("illegal transitions out of the lobby", () => {
  it("TC-ROOM-161: the lobby cannot be re-entered once the match is playing", async () => {
    // Arrange
    const { harness, sockets, ids } = await play();
    const host = sockets.get(ids[0]!)!;

    // Act — no frame in the protocol moves a playing room back to the lobby
    await harness.message(host, { t: "room_settings", mode: "score", mapId: "map-02" });
    await harness.message(host, { t: "team_assign", assignments: [{ playerId: ids[1], team: "A" }] });
    await harness.message(host, { t: "start_match" });

    // Assert
    expect(status(harness)).toBe("playing");
    expect(host.errors().map((frame) => frame["code"])).toEqual(["invalid-state", "invalid-state", "invalid-state"]);
  });
});
