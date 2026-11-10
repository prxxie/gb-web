/**
 * The seat data a lobby frame writes: the batched team assignment, the loadout and the room settings
 * (`US-ROOM-003`, `US-ROOM-007`).
 *
 * Each function answers with the room it would leave behind and the frames that announce it, or the refusal
 * the object must send. Nothing here persists or sends: that stays with the Durable Object.
 */
import {
  isModeId,
  setRoomSettings,
  type LoadoutEntry,
  type RoomState,
  type TeamAssignment,
} from "@gbw/core";
import { withActivity } from "./presence.js";
import { refuse, roomState, type Decision } from "./wire.js";

/** One frame carries the whole roster, so a half-applied assignment cannot exist (`US-ROOM-003`). */
export function assignTeams(
  room: RoomState,
  playerId: string,
  assignments: readonly TeamAssignment[],
): Decision {
  if (playerId !== room.hostPlayerId) return refuse("not-host", "only the host assigns teams");
  if (room.status !== "lobby") return refuse("invalid-state", "teams are locked once the match starts");
  const known = new Set(room.members.map((member) => member.playerId));
  const unknown = assignments.find((assignment) => !known.has(assignment.playerId));
  if (unknown) return refuse("bad-request", `${unknown.playerId} is not in this room`);
  const members = room.members.map((member) => {
    const found = assignments.find((assignment) => assignment.playerId === member.playerId);
    return found ? { ...member, team: found.team } : member;
  });
  // Equality is `start_match`'s rule, not this one: a host has to be able to seat the first player.
  // What is enforced here is capacity — a team never holds more than its share of the seats.
  const seats = Math.floor(room.settings.maxPlayers / 2);
  const counts = { A: 0, B: 0 };
  for (const member of members) if (member.team) counts[member.team] += 1;
  if (counts.A > seats || counts.B > seats) {
    return refuse("bad-request", `a team holds at most ${seats} players at ${room.settings.maxPlayers} seats`);
  }
  const next = withActivity({ ...room, members });
  return { ok: true, room: next, out: [{ to: null, payload: roomState(next) }] };
}

/**
 * Any member, lobby only; the eleven-item budget and the mobile allowlist are checked by the parser
 * (`US-ROOM-007`). Each half is written only when the frame carries it, so a mobile tap and an item tap never
 * undo each other. Two members may hold the same mobile — the grid shows every mobile once per team tint, not
 * once per seat.
 */
export function applyLoadout(
  room: RoomState,
  playerId: string,
  frame: { items?: readonly LoadoutEntry[] | undefined; mobileId?: string | undefined },
): Decision {
  if (room.status !== "lobby") return refuse("invalid-state", "the loadout is locked once the match starts");
  const next = withActivity({
    ...room,
    members: room.members.map((member) =>
      member.playerId === playerId
        ? {
            ...member,
            // Each half is written only when the frame carries it: a mobile tap must not wipe the items a second tab built.
            ...(frame.items === undefined ? {} : { loadout: frame.items }),
            ...(frame.mobileId === undefined ? {} : { mobileId: frame.mobileId }),
          }
        : member,
    ),
  });
  return { ok: true, room: next, out: [{ to: null, payload: roomState(next) }] };
}

/** Host-only, lobby-only settings (`US-ROOM-007`). */
export function applyRoomSettings(
  room: RoomState,
  playerId: string,
  frame: { mode: string; mapId: string; maxPlayers?: 2 | 4 | 6 | 8 | undefined; isPrivate?: boolean | undefined },
): Decision {
  if (playerId !== room.hostPlayerId) return refuse("not-host", "only the host changes the room settings");
  if (room.status !== "lobby") return refuse("invalid-state", "settings are locked once the match starts");
  if (!isModeId(frame.mode)) return refuse("bad-request", `${frame.mode} is not a mode`);
  // The rule lives in core, next to `createRoom`, so a test can hold it without a Durable Object.
  const outcome = setRoomSettings(room, {
    mode: frame.mode,
    mapId: frame.mapId,
    ...(frame.maxPlayers === undefined ? {} : { maxPlayers: frame.maxPlayers }),
    ...(frame.isPrivate === undefined ? {} : { isPrivate: frame.isPrivate }),
  });
  if (!outcome.ok) return refuse("invalid-state", `${room.members.length} players are already seated`);
  const next = withActivity(outcome.room);
  return { ok: true, room: next, out: [{ to: null, payload: roomState(next) }] };
}
