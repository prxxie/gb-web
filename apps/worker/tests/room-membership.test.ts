/**
 * Roster and slot oracle for the `Room` Durable Object (`US-ROOM-002` AC5, `docs/02-reference/api/signaling.md` §2).
 * A seat is a slot, not a person: leaving in the lobby releases it, the next joiner takes it, and the roster
 * never holds the same player or the same slot twice.
 */
import { describe, expect, it } from "vitest";
import { RoomHarness } from "./support/room-harness";

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
});
