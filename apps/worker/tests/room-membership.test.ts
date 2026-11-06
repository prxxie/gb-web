/**
 * Roster and slot oracle for the `Room` Durable Object (`US-ROOM-002` AC5, `docs/02-reference/api/signaling.md` §2).
 * A seat is a slot, not a person: leaving in the lobby releases it, the next joiner takes it, and the roster
 * never holds the same player or the same slot twice.
 */
import { describe, expect, it } from "vitest";
import type { RoomState } from "@gbw/core";
import { RoomHarness, type FakeSocket } from "./support/room-harness";

describe("room membership", () => {
  it("TC-ROOM-128: a member that leaves the lobby frees its slot for the next joiner without a duplicate", async () => {
    // Arrange — three seats taken, the middle one connected so it can send `leave`
    const harness = new RoomHarness();
    await harness.ready();
    await harness.join({ playerId: "p1", accountId: "acct-p1" });
    await harness.join({ playerId: "p2", accountId: "acct-p2" });
    await harness.join({ playerId: "p3", accountId: "acct-p3" });
    const p2 = await harness.connect("p2");
    expect(harness.state().members.map((member) => `${member.playerId}:${member.slot}`)).toEqual([
      "p1:0",
      "p2:1",
      "p3:2",
    ]);

    // Act — the middle member leaves, then a fourth player joins
    await harness.message(p2, { t: "leave" });
    expect(harness.state().members.map((member) => member.playerId)).toEqual(["p1", "p3"]);
    const joined = await harness.join({ playerId: "p4", accountId: "acct-p4" });

    // Assert — the freed slot is the one reused, and the roster stays duplicate-free and contiguous
    expect(joined.slot).toBe(1);
    const seats = harness
      .state()
      .members.map((member) => `${member.slot}:${member.playerId}`)
      .sort();
    expect(seats).toEqual(["0:p1", "1:p4", "2:p3"]);
    const members = harness.state().members;
    expect(new Set(members.map((member) => member.playerId)).size).toBe(members.length);
    expect(new Set(members.map((member) => member.slot)).size).toBe(members.length);
    expect([...members.map((member) => member.slot)].sort((left, right) => left - right)).toEqual([0, 1, 2]);
  });

  it("TC-ROOM-195: two clients in the same room are handed the same roster, slots and teams", async () => {
    // `US-ROOM-002` AC4: two independent contexts must render one room, so every socket is sent the
    // same `members` array rather than a per-viewer copy.
    const harness = new RoomHarness();
    await harness.ready();
    await harness.join({ playerId: "p1", accountId: "acct-p1" });
    await harness.join({ playerId: "p2", accountId: "acct-p2" });
    const one: FakeSocket = await harness.connect("p1");
    const two: FakeSocket = await harness.connect("p2");
    await harness.message(one, {
      t: "team_assign",
      assignments: [
        { playerId: "p1", team: "A" },
        { playerId: "p2", team: "B" },
      ],
    });

    // Act — read the newest roster each socket was handed
    const rosterOf = (socket: FakeSocket): string[] => {
      const frames = socket.framesOf("room_state");
      const latest = frames[frames.length - 1]?.["room"] as RoomState | undefined;
      return (latest?.members ?? []).map((member) => `${member.playerId}:${member.slot}:${member.team}`);
    };

    // Assert — byte-for-byte the same seats, and the server holds that same roster
    expect(rosterOf(one)).toEqual(["p1:0:A", "p2:1:B"]);
    expect(rosterOf(two)).toEqual(rosterOf(one));
    expect(
      harness
        .state()
        .members.map((member) => `${member.playerId}:${member.slot}:${member.team}`),
    ).toEqual(rosterOf(one));
  });
});
