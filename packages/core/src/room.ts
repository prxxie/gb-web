import type { RoomMember, RoomSettings, RoomState, Team } from "./types.js";
import { TUNABLES } from "./tuning.js";

/** Room rules shared by the Durable Object and the client, kept pure so both sides test the same thing. */

export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;
export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;
export const ALLOWED_CAPACITIES: readonly number[] = [2, 4, 6, 8];

export function isValidCapacity(value: number): boolean {
  return ALLOWED_CAPACITIES.includes(value);
}

export function makeRoomCode(random: () => number): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    const index = Math.floor(random() * ROOM_CODE_ALPHABET.length) % ROOM_CODE_ALPHABET.length;
    code += ROOM_CODE_ALPHABET[index];
  }
  return code;
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  for (const character of code) {
    if (!ROOM_CODE_ALPHABET.includes(character)) return false;
  }
  return true;
}

export interface JoinRequest {
  readonly playerId: string;
  readonly accountId: string | null;
  readonly guestId: string | null;
  readonly displayName: string;
  readonly avatarId: string;
  readonly mobileId: string;
  readonly now: number;
}

export type JoinRejection =
  | "room-not-found"
  | "room-full"
  | "room-closed"
  | "not-enough-slots"
  | "already-joined";

export interface JoinOutcome {
  readonly room: RoomState;
  readonly member: RoomMember | null;
  readonly rejection: JoinRejection | null;
}

function lowestFreeSlot(room: RoomState): number | null {
  const used = new Set(room.members.map((member) => member.slot));
  for (let slot = 0; slot < room.settings.maxPlayers; slot += 1) {
    if (!used.has(slot)) return slot;
  }
  return null;
}

export function currentHost(room: RoomState): RoomMember | undefined {
  return room.members.find((member) => member.playerId === room.hostPlayerId);
}

/**
 * Longest-connected peer becomes host (`US-ROOM-005`): the oldest `joinedAt`, ties broken by slot.
 * Grace and disconnected members are skipped so a dropped peer cannot inherit the match.
 */
export function electHost(room: RoomState): string | null {
  const candidates = room.members
    .filter((member) => member.playerId !== room.hostPlayerId)
    .sort((a, b) => a.joinedAt - b.joinedAt || a.slot - b.slot);
  // A peer already inside its grace window cannot take the host role: promoting it would hand the room to a
  // socket that is gone, so the oldest *connected* peer wins and a disconnected one is only the last resort.
  const connected = candidates.filter((member) => member.connectionState === "connected");
  return (connected[0] ?? candidates[0])?.playerId ?? null;
}

export function joinRoom(room: RoomState, request: JoinRequest): JoinOutcome {
  if (room.status === "ended" || room.status === "abandoned") {
    return { room, member: null, rejection: "room-closed" };
  }
  const existing = room.members.find((member) => member.playerId === request.playerId);
  if (existing) {
    // Reconnect path: same playerId returns to its own slot (`US-ROOM-004`).
    const members = room.members.map((member) =>
      member.playerId === request.playerId ? { ...member, connectionState: "connected" as const } : member,
    );
    return {
      room: { ...room, members, lastActivityAt: request.now },
      member: members.find((member) => member.playerId === request.playerId) ?? null,
      rejection: null,
    };
  }
  const slot = lowestFreeSlot(room);
  if (slot === null) {
    return { room, member: null, rejection: "room-full" };
  }
  const member: RoomMember = {
    playerId: request.playerId,
    accountId: request.accountId,
    guestId: request.guestId,
    displayName: request.displayName,
    avatarId: request.avatarId,
    mobileId: request.mobileId,
    slot,
    // A joiner is seated in the emptier team, host first on A: a two-player room can start without the host
    // shuffling anybody, and `team_assign` remains the override (`US-ROOM-003`, `screens/lobby.md`).
    team: lessPopulatedTeam(room),
    role: room.members.length === 0 ? "host" : "player",
    connectionState: "connected",
    joinedAt: request.now,
    seenConnected: true,
  };
  const members = [...room.members, member];
  return {
    room: {
      ...room,
      members,
      hostPlayerId: room.hostPlayerId || member.playerId,
      lastActivityAt: request.now,
    },
    member,
    rejection: null,
  };
}

export interface LeaveOutcome {
  readonly room: RoomState;
  readonly member: RoomMember | null;
  readonly reason: "left" | "grace" | "disconnected";
}

/** A dropped socket starts the grace timer instead of removing the member (`US-ROOM-004`). */
export function markDisconnected(room: RoomState, playerId: string, now: number): LeaveOutcome {
  const member = room.members.find((candidate) => candidate.playerId === playerId);
  if (!member) return { room, member: null, reason: "left" };
  const members = room.members.map((candidate) =>
    candidate.playerId === playerId ? { ...candidate, connectionState: "grace" as const } : candidate,
  );
  return {
    room: { ...room, members, lastActivityAt: requestNow(now) },
    member: members.find((candidate) => candidate.playerId === playerId) ?? null,
    reason: "grace",
  };
}

export function leaveRoom(room: RoomState, playerId: string, now: number): LeaveOutcome {
  const member = room.members.find((candidate) => candidate.playerId === playerId);
  if (!member) return { room, member: null, reason: "left" };
  const members = room.members.filter((candidate) => candidate.playerId !== playerId);
  if (members.length === 0) {
    return { room: { ...room, members, status: "abandoned", lastActivityAt: now }, member, reason: "left" };
  }
  const hostGone = room.hostPlayerId === playerId;
  const nextHost = hostGone ? (electHost({ ...room, members }) ?? room.hostPlayerId) : room.hostPlayerId;
  return {
    room: {
      ...room,
      members,
      hostPlayerId: nextHost,
      hostGeneration: hostGone ? room.hostGeneration + 1 : room.hostGeneration,
      lastActivityAt: now,
    },
    member,
    reason: "left",
  };
}

/** The team with fewer members; a tie seats on A. */
function lessPopulatedTeam(room: RoomState): Team {
  const a = room.members.filter((member) => member.team === "A").length;
  const b = room.members.filter((member) => member.team === "B").length;
  return a <= b ? "A" : "B";
}

export function setTeam(room: RoomState, playerId: string, team: Team, now: number): RoomState {
  if (room.status !== "lobby") return room;
  const members = room.members.map((member) =>
    member.playerId === playerId ? { ...member, team } : member,
  );
  return { ...room, members, lastActivityAt: now };
}

/** Host picks team sizes; the guard is equality and at least one per side (`US-ROOM-003`). */
export function isBalanced(room: RoomState): boolean {
  const occupied = room.members.filter((member) => member.team !== null);
  if (occupied.length === 0) return false;
  const a = occupied.filter((member) => member.team === "A").length;
  const b = occupied.filter((member) => member.team === "B").length;
  return a > 0 && a === b;
}

export function allSlotsFilled(room: RoomState): boolean {
  return room.members.length === room.settings.maxPlayers;
}

export type StartRejection = "not-host" | "not-lobby" | "not-full" | "teams-unbalanced" | "not-enough-players";

export function canStart(room: RoomState, playerId: string): StartRejection | null {
  if (room.status !== "lobby") return "not-lobby";
  if (room.hostPlayerId !== playerId) return "not-host";
  if (room.members.length < MIN_PLAYERS) return "not-enough-players";
  if (!allSlotsFilled(room)) return "not-full";
  if (!isBalanced(room)) return "teams-unbalanced";
  return null;
}

export interface StartOutcome {
  readonly room: RoomState;
  /** Slots in queue order: sorted by delay, ties by slot. */
  readonly turnOrder: readonly number[];
  readonly seed: number;
  readonly startedAt: number;
}

export function startMatch(room: RoomState, playerId: string, seed: number, now: number): StartOutcome | null {
  if (canStart(room, playerId) !== null) return null;
  const turnOrder = room.members.map((member) => member.slot).sort((a, b) => a - b);
  return {
    room: { ...room, status: "playing", lastActivityAt: now },
    turnOrder,
    seed,
    startedAt: now,
  };
}

export function membersWithTeams(room: RoomState): readonly Team[] {
  return room.members.map((member) => member.team ?? "A");
}

/** Forfeit: a team with no connected or grace member loses (`US-ROOM-004`). */
export function isForfeited(room: RoomState): Team | null {
  const alive: Record<Team, number> = { A: 0, B: 0 };
  for (const member of room.members) {
    if (member.team === null) continue;
    if (member.connectionState !== "disconnected") alive[member.team] += 1;
  }
  if (alive.A === 0 && alive.B === 0) return null;
  if (alive.A === 0) return "B";
  if (alive.B === 0) return "A";
  return null;
}

/** Grace expiry is a Durable Object alarm; the pure layer only exposes the window. */
export function graceWindowMs(): number {
  return TUNABLES.roomGraceMs;
}

function requestNow(now: number): number {
  return now;
}

export function isIdle(room: RoomState, now: number): boolean {
  return now - room.lastActivityAt >= TUNABLES.roomIdleMs;
}

/**
 * The 24 h cap runs from the match start, not from room creation: a room can sit in a lobby for hours
 * and still get its full day of play (`workflow-state-machine.md`).
 */
export function isRoomExpired(room: RoomState, now: number, matchStartedAt: number | null = null): boolean {
  const startedAt = matchStartedAt ?? room.createdAt;
  return isIdle(room, now) || now - startedAt >= TUNABLES.roomMatchCapMs;
}

/** True once no member is connected and none can come back: the grace windows have all run out. */
export function isAbandoned(room: RoomState): boolean {
  return room.members.every((member) => member.connectionState === "disconnected");
}

export function defaultSettings(maxPlayers: RoomSettings["maxPlayers"]): RoomSettings {
  return {
    maxPlayers,
    mode: "solo",
    mapId: "map-01",
    isPrivate: false,
  };
}

export interface CreateRoomOptions {
  readonly roomCode: string;
  readonly now: number;
  readonly settings?: Partial<RoomSettings>;
}

/** A fresh lobby. The worker creates one per code; tests create one per case. */
export function createRoom(options: CreateRoomOptions): RoomState {
  const maxPlayers = (options.settings?.maxPlayers ?? 4) as RoomSettings["maxPlayers"];
  return {
    roomCode: options.roomCode,
    status: "lobby",
    hostPlayerId: null,
    hostGeneration: 1,
    settings: { ...defaultSettings(maxPlayers), ...(options.settings ?? {}) },
    members: [],
    createdAt: options.now,
    lastActivityAt: options.now,
    lastSnapshot: null,
  };
}
