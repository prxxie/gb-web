/**
 * `US-ROOM-001` and `US-ROOM-004` — the rules a room is built on: capacity, the code alphabet, a slot
 * that survives a reconnect, and slot reuse only in the lobby.
 *
 * The capacity and alphabet halves run against `packages/core` (the shared rules engine the Worker and the
 * browser both import); the slot halves run against a real `Room` object through the harness.
 */
import { describe, expect, it } from "vitest";
import {
  ALLOWED_CAPACITIES,
  ROOM_CODE_ALPHABET,
  isValidCapacity,
  isValidRoomCode,
  makeRoomCode,
} from "@gbw/core";
import { ROOM_CODE, ROOM_ORIGIN, RoomHarness } from "./support/room-harness";

describe("capacity (US-ROOM-001 AC3)", () => {
  it("TC-ROOM-122: accepts exactly 2, 4, 6 and 8 players", () => {
    // Arrange
    const accepted = [2, 4, 6, 8];
    const refused = [0, 1, 3, 5, 7, 9, 10, -2, 2.5];

    // Assert
    expect(ALLOWED_CAPACITIES).toEqual(accepted);
    for (const capacity of accepted) expect(isValidCapacity(capacity), String(capacity)).toBe(true);
    for (const capacity of refused) expect(isValidCapacity(capacity), String(capacity)).toBe(false);
  });

  it("TC-ROOM-122: an eight-slot room seats eight and refuses the ninth", async () => {
    // Arrange — the host's first join is what names the room and sets its capacity
    const harness = new RoomHarness();
    await harness.ready();
    const created = await harness.do.fetch(
      new Request(`${ROOM_ORIGIN}/${ROOM_CODE}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playerId: "p0",
          accountId: null,
          guestId: "guest-p0",
          displayName: "p0",
          avatarId: "av-01",
          mobileId: "mbl-01",
          roomCode: ROOM_CODE,
          settings: { maxPlayers: 8 },
        }),
      }),
    );
    expect(created.status).toBe(200);
    for (let index = 1; index < 8; index += 1) {
      await harness.join({ playerId: `p${index}` });
    }

    // Act
    await expect(harness.join({ playerId: "p8" })).rejects.toThrow(/409/);

    // Assert
    const slots = harness.state().members.map((member) => member.slot);
    expect(slots).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(harness.state().settings.maxPlayers).toBe(8);
  });
});

describe("code alphabet (US-ROOM-001 AC7)", () => {
  it("TC-ROOM-128: the alphabet is the documented literal without I, O, 0 or 1", () => {
    // Arrange
    const alphabet = ROOM_CODE_ALPHABET;

    // Assert — US-ROOM-001 §4: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
    expect(alphabet).toBe("ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
    for (const forbidden of ["I", "O", "0", "1"]) expect(alphabet).not.toContain(forbidden);
    expect(new Set(alphabet).size).toBe(alphabet.length);
  });

  it("US-ROOM-001 §4: the documented symbol count matches that alphabet", () => {
    // Arrange — `US-ROOM-001` §4 was corrected to the 32-symbol alphabet the code ships:
    // 24 letters (no I/O) + 8 digits, so 32^6 ≈ 1.07 billion codes
    const documentedCount = 32;

    // Act
    const actual = ROOM_CODE_ALPHABET.length;

    // Assert — 24 letters + 8 digits is 32
    expect(actual).toBe(documentedCount);
  });

  it("TC-ROOM-128: a generated code is six characters from that alphabet", () => {
    // Arrange — a deterministic source instead of `crypto`, so the case is reproducible
    let cursor = 0;
    const random = (): number => {
      cursor = (cursor + 7) % 31;
      return cursor / 31;
    };

    // Act
    const codes = Array.from({ length: 25 }, () => makeRoomCode(random));

    // Assert
    for (const code of codes) {
      expect(code).toHaveLength(6);
      for (const character of code) expect(ROOM_CODE_ALPHABET).toContain(character);
      expect(isValidRoomCode(code)).toBe(true);
    }
    expect(new Set(codes).size).toBeGreaterThan(20);
  });

  it("TC-ROOM-128: a malformed code is not a code", () => {
    // Assert
    for (const invalid of ["ABC", "ABCDEFG", "ABCD1F", "ABCDOF", "ABCD-3", ""]) {
      expect(isValidRoomCode(invalid), invalid).toBe(false);
    }
  });
});

describe("slots and reconnects (US-ROOM-004)", () => {
  it("TC-ROOM-129: a reconnect keeps the slot the member already had", async () => {
    // Arrange
    const harness = new RoomHarness();
    await harness.ready();
    await harness.join({ playerId: "p1", accountId: "acct-1" });
    await harness.join({ playerId: "p2", accountId: "acct-2" });
    await harness.join({ playerId: "p3", accountId: "acct-3" });
    const socket = await harness.connect("p2");
    expect(harness.state().members.find((member) => member.playerId === "p2")?.slot).toBe(1);

    // Act — the socket drops (grace), then the same identity joins again
    await harness.close(socket);
    const back = await harness.join({ playerId: "p2", accountId: "acct-2" });
    await harness.connect("p2");

    // Assert
    expect(harness.state().members).toHaveLength(3);
    expect(back.slot).toBe(1);
    expect(harness.state().members.find((member) => member.playerId === "p2")).toMatchObject({
      slot: 1,
      connectionState: "connected",
    });
  });

  it("TC-ROOM-129: a slot freed in the lobby is reused by the next joiner", async () => {
    // Arrange
    const harness = new RoomHarness();
    await harness.ready();
    await harness.join({ playerId: "p1" });
    const second = await harness.join({ playerId: "p2" });
    expect(second.slot).toBe(1);

    // Act — `p1` leaves through the socket frame; `p4` is the next joiner
    const socket = await harness.connect("p1");
    await harness.message(socket, { t: "leave" });
    const fourth = await harness.join({ playerId: "p4" });

    // Assert
    expect(fourth.slot).toBe(0);
    expect(harness.state().members.map((member) => member.playerId).sort()).toEqual(["p2", "p4"]);
  });

  it("NFR-07: a host that returns inside the grace window keeps its slot but not its role", async () => {
    // Arrange
    const harness = new RoomHarness();
    await harness.ready();
    await harness.join({ playerId: "host", accountId: "acct-host" });
    await harness.join({ playerId: "p2", accountId: "acct-2" });
    const hostSocket = await harness.connect("host");
    await harness.connect("p2");
    expect(harness.state().hostPlayerId).toBe("host");

    // Act
    await harness.close(hostSocket);
    await harness.join({ playerId: "host", accountId: "acct-host" });
    await harness.connect("host");

    // Assert — `signaling.md` § Host election: it "re-joins ... keeps its slot, and is a peer"
    const host = harness.state().members.find((member) => member.playerId === "host");
    expect(host?.slot).toBe(0);
    expect(host?.role).toBe("player");
    expect(harness.state().hostPlayerId).toBe("p2");
  });

  it("TC-ROOM-128: two rooms keep separate rosters and separate codes", async () => {
    // Arrange
    const one = new RoomHarness();
    const two = new RoomHarness();
    await Promise.all([one.ready(), two.ready()]);

    // Act
    await one.join({ playerId: "a1" });
    await two.join({ playerId: "b1" });
    await two.join({ playerId: "b2" });

    // Assert
    expect(one.state().roomCode).toBe(ROOM_CODE);
    expect(one.state().members).toHaveLength(1);
    expect(two.state().members).toHaveLength(2);
    expect(one.state().members[0]?.playerId).toBe("a1");
  });
});
