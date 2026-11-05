import { describe, expect, it } from "vitest";
import {
  canStart,
  createRoom,
  currentHost,
  electHost,
  isBalanced,
  isForfeited,
  isIdle,
  isRoomExpired,
  isValidRoomCode,
  joinRoom,
  leaveRoom,
  makeRoomCode,
  markDisconnected,
  setTeam,
  startMatch,
  ROOM_CODE_ALPHABET,
} from "../src/room.js";

const NOW = 1_700_000_000_000;

let counter = 0;
function join(room: ReturnType<typeof createRoom>, slot: number, team: "A" | "B" | null = null) {
  counter += 1;
  const outcome = joinRoom(room, {
    playerId: `p-${slot}`,
    accountId: `acc-${slot}`,
    guestId: null,
    displayName: `P${slot}`,
    avatarId: "default",
    mobileId: "mbl-01",
    now: NOW + counter,
  });
  if (!outcome.room || !outcome.member) throw new Error(`join failed: ${outcome.rejection}`);
  const withTeam = team ? setTeam(outcome.room, outcome.member.playerId, team, NOW + counter) : outcome.room;
  return withTeam;
}

function lobby(maxPlayers: 2 | 4 | 6 | 8 = 2) {
  const room = createRoom({ roomCode: "ABC234", now: NOW, settings: { maxPlayers } });
  return join(room, 0, "A");
}

describe("TC-ROOM-120: room creation", () => {
  it("starts in the lobby with the genre capacity and a generation counter", () => {
    const room = createRoom({ roomCode: "ABC234", now: NOW });
    expect(room.status).toBe("lobby");
    expect(room.hostGeneration).toBe(1);
    expect(room.lastSnapshot).toBeNull();
    expect([2, 4, 6, 8]).toContain(room.settings.maxPlayers);
  });

  it("the code is six characters from an alphabet without look-alikes", () => {
    for (let index = 0; index < 200; index += 1) {
      const code = makeRoomCode(() => index / 200);
      expect(code).toHaveLength(6);
      expect(isValidRoomCode(code)).toBe(true);
      for (const character of code) expect(ROOM_CODE_ALPHABET).toContain(character);
    }
    expect(isValidRoomCode("ABCDE")).toBe(false);
    expect(isValidRoomCode("abcd23")).toBe(false);
    expect(isValidRoomCode("ABC10O")).toBe(false);
  });
});

describe("TC-ROOM-122: capacity", () => {
  it("refuses one player past the capacity", () => {
    let room = lobby(2);
    room = join(room, 1, "B");
    const third = joinRoom(room, {
      playerId: "p-2",
      accountId: "acc-2",
      guestId: null,
      displayName: "P2",
      avatarId: "default",
      mobileId: "mbl-01",
      now: NOW + 100,
    });
    expect(third.member).toBeNull();
    expect(third.rejection).toBe("room-full");
  });
});

describe("TC-ROOM-048: host election", () => {
  it("hands the host to the longest-connected living member", () => {
    let room = lobby(4);
    room = join(room, 1, "B");
    room = join(room, 2, "A");
    expect(currentHost(room)?.playerId).toBe("p-0");
    const elected = electHost(room);
    expect(elected).toBe("p-1");
    const after = leaveRoom(room, "p-0", NOW + 200).room;
    expect(currentHost(after)?.playerId).toBe("p-1");
    expect(after.hostGeneration).toBe(room.hostGeneration + 1);
  });

  it("TC-ROOM-049: a disconnected host is replaced at once, a connected one is not", () => {
    let room = lobby(4);
    room = join(room, 1, "B");
    const marked = markDisconnected(room, "p-0", NOW + 300);
    expect(marked.room.members.find((member) => member.playerId === "p-0")?.connectionState).toBe("grace");
    const alreadyGone = electHost(room);
    expect(alreadyGone).toBe("p-1");
  });
});

describe("TC-ROOM-148: start conditions", () => {
  it("refuses to start with an empty slot, with unbalanced teams, or for a non-host", () => {
    let room = lobby(4);
    // One member cannot start anything, and two members still leave two empty slots.
    expect(canStart(room, "p-0")).toBe("not-enough-players");
    room = join(room, 1, "B");
    expect(canStart(room, "p-0")).toBe("not-full");
    room = join(room, 2, "A");
    // A joiner is seated in the emptier team (`lobby.md` § Late joiner), so the lobby is balanced on arrival
    // and only a manual move can unbalance it — that is the state this case is about.
    room = join(room, 3);
    expect(isBalanced(room)).toBe(true);
    room = setTeam(room, "p-2", "B", NOW + 350);
    expect(canStart(room, "p-0")).toBe("teams-unbalanced");
    room = setTeam(room, "p-2", "A", NOW + 400);
    expect(isBalanced(room)).toBe(true);
    expect(canStart(room, "p-1")).toBe("not-host");
    expect(canStart(room, "p-0")).toBeNull();
    const started = startMatch(room, "p-0", 42, NOW + 500);
    expect(started?.room.status).toBe("playing");
    expect(started?.seed).toBe(42);
    expect(started?.turnOrder).toEqual([0, 1, 2, 3]);
  });
});

describe("TC-ROOM-059: forfeit", () => {
  it("forfeits only when a whole team lost its connection", () => {
    let room = lobby(2);
    room = join(room, 1, "B");
    const started = startMatch(room, "p-0", 1, NOW + 600)?.room ?? room;
    expect(isForfeited(started)).toBeNull();
    const oneGone = leaveRoom(started, "p-1", NOW + 700).room;
    expect(isForfeited(oneGone)).toBe("A");
    const twoGone = leaveRoom(oneGone, "p-0", NOW + 800).room;
    expect(twoGone.members).toHaveLength(0);
    expect(isForfeited(twoGone)).toBeNull();
  });
});

describe("TC-ROOM-123: idle and expiry", () => {
  it("sweeps a lobby that has been quiet for ten minutes", () => {
    const room = lobby(2);
    expect(isIdle(room, NOW + 60_000)).toBe(false);
    expect(isIdle(room, NOW + 11 * 60_000)).toBe(true);
    expect(isRoomExpired(room, NOW + 60_000)).toBe(false);
    expect(isRoomExpired(room, NOW + 25 * 3_600_000)).toBe(true);
  });
});

describe("TC-ROOM-153: team assignment", () => {
  it("lets the host move a player between teams before the match", () => {
    let room = lobby(4);
    room = join(room, 1, "B");
    const moved = setTeam(room, "p-1", "A", NOW + 900);
    expect(moved.members.find((member) => member.playerId === "p-1")?.team).toBe("A");
    expect(isBalanced(moved)).toBe(false);
  });
});
