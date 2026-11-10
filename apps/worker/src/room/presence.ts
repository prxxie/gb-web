/**
 * Who holds a seat and how alive it is: the join, the activity stamp, the grace window and the silence
 * that opens it (`US-ROOM-001`, `US-ROOM-002` AC6, `US-ROOM-004`).
 *
 * Every transition is a function over the roster; the object decides when to persist and who hears about it.
 */
import {
  PING_INTERVAL_MS,
  PING_MISSES_BEFORE_GRACE,
  electHost,
  joinRoom,
  leaveRoom,
  markDisconnected,
  type JoinRequest,
  type RoomMember,
  type RoomState,
  type RoomSettings,
} from "@gbw/core";
import type { SocketMeta } from "./protocol.js";
import { peerLeft, roomState, type Outgoing } from "./wire.js";

/** Every write to the room stamps activity, so the idle sweep measures the last frame, not the last join. */
export function withActivity(room: RoomState): RoomState {
  return { ...room, lastActivityAt: Date.now() };
}

/**
 * The first join names the room: the object is created by the Worker before it knows the code, so the
 * code and the requested settings arrive with the host's first request (`docs/02-reference/data/room-state.md`).
 */
function nameRoom(room: RoomState, body: { roomCode?: string; settings?: Partial<RoomSettings> }): RoomState {
  if (room.members.length > 0) return room;
  return {
    ...room,
    ...(body.roomCode ? { roomCode: body.roomCode } : {}),
    ...(body.settings && room.status === "lobby"
      ? { settings: { ...room.settings, ...body.settings } }
      : {}),
  };
}

/**
 * The seat this identity already owns. A join is idempotent for the same session: a page that mounts twice
 * (React's StrictMode does) must not take two seats, and a reloaded lobby must land back on the seat it
 * already owns rather than on a new one (`US-ROOM-001` AC3).
 */
export function seatOf(
  room: RoomState,
  identity: { accountId: string | null; guestId: string | null },
): RoomMember | undefined {
  return room.members.find(
    (member) =>
      (identity.accountId !== null && member.accountId === identity.accountId) ||
      (identity.guestId !== null && member.guestId === identity.guestId),
  );
}

/** A rejoin marks its seat as seen; it takes no second seat. */
function withSeen(room: RoomState, playerId: string): RoomState {
  return {
    ...room,
    members: room.members.map((member) =>
      member.playerId === playerId ? { ...member, seenConnected: true } : member,
    ),
  };
}

/** A host that comes back inside its grace window keeps its slot, not the role (`NFR-07`). */
function isGraceHost(room: RoomState, playerId: string): boolean {
  return (
    room.hostPlayerId === playerId &&
    room.members.find((member) => member.playerId === playerId)?.connectionState === "grace"
  );
}

/** A dropped socket starts the 20 s grace timer instead of removing the member (`US-ROOM-004`). */
export function withGrace(room: RoomState, playerId: string, now: number): RoomState {
  return withActivity(markDisconnected(room, playerId, now).room);
}

/**
 * Grace that ran out becomes `disconnected` (`US-ROOM-004` AC3). The sweep that *creates* a grace runs after
 * this pass, so a seat marked `grace` in this one is visible as `grace` to its peers before the next alarm can
 * expire it (`US-ROOM-002` AC6).
 */
export function expireGrace(room: RoomState): { readonly room: RoomState; readonly expired: readonly string[] } {
  const expired = room.members.filter((member) => member.connectionState === "grace");
  if (expired.length === 0) return { room, expired: [] };
  return {
    room: {
      ...room,
      members: room.members.map((member) =>
        expired.some((gone) => gone.playerId === member.playerId)
          ? { ...member, connectionState: "disconnected" as const }
          : member,
      ),
    },
    expired: expired.map((member) => member.playerId),
  };
}

/**
 * A `ping` every `PING_INTERVAL_MS` with three missed ones allowed (`US-ROOM-002` AC6). The client cannot lie
 * about this: silence is what is measured, not a claimed timestamp.
 */
export function isSilent(meta: SocketMeta | undefined, now: number, deadline: number): boolean {
  if (!meta?.playerId || !meta.authed) return false;
  return now - meta.lastPingAt > deadline;
}

/** How long a socket may stay quiet before the roster calls it `grace`. */
export function silenceDeadline(): number {
  return PING_INTERVAL_MS * PING_MISSES_BEFORE_GRACE;
}

/** The seats whose socket missed three heartbeats, in map order (`US-ROOM-002` AC6). */
export function silentSeats(
  sockets: ReadonlyMap<string, WebSocket>,
  meta: WeakMap<WebSocket, SocketMeta>,
  now: number,
): readonly string[] {
  const deadline = silenceDeadline();
  return [...sockets.entries()]
    .filter(([, socket]) => isSilent(meta.get(socket), now, deadline))
    .map(([playerId]) => playerId);
}

/**
 * Drops the sockets an alarm has already announced as `grace` (`US-ROOM-002` AC4). The announcement has to go
 * out first: a peer that is still listening must hear `peer_left` even when every silent socket goes in one pass.
 */
export function dropSilentSockets(
  sockets: Map<string, WebSocket>,
  meta: WeakMap<WebSocket, SocketMeta>,
  playerIds: readonly string[],
): void {
  for (const playerId of playerIds) {
    const socket = sockets.get(playerId);
    sockets.delete(playerId);
    if (!socket) continue;
    meta.delete(socket);
    if (socket.readyState === 1) socket.close(4408, "heartbeat timeout");
  }
}

/** Where a member's seat goes, and what the others hear about it before the roster is re-sent. */
export interface DeparturePlan {
  readonly room: RoomState;
  /** The `peer_left` line for the departing seat; `room_state` follows, after any role change. */
  readonly out: readonly Outgoing[];
  /** The host that has to be replaced, or `null` when the departing member was not the host. */
  readonly previousHostId: string | null;
}

/** `leave`: the seat goes now (`US-ROOM-002` AC7). */
export function planDeparture(room: RoomState, playerId: string): DeparturePlan {
  return {
    room: withActivity(leaveRoom(room, playerId, Date.now()).room),
    out: [{ to: null, payload: peerLeft(playerId, "left") }],
    previousHostId: room.hostPlayerId === playerId ? playerId : null,
  };
}

/** A dropped socket: the seat keeps a 20 s grace window instead of disappearing (`US-ROOM-004`). */
export function planDisconnect(room: RoomState, playerId: string, now: number): DeparturePlan {
  const next = withGrace(room, playerId, now);
  return {
    room: next,
    out: [
      { to: null, payload: peerLeft(playerId, "grace") },
      { to: null, payload: roomState(next) },
    ],
    previousHostId: playerId === room.hostPlayerId ? playerId : null,
  };
}

/** What a `POST …/join` decides, before anything is written or announced. */
export interface JoinPlan {
  /** A seat this session already holds: a rejoin takes no second one (`US-ROOM-001` AC3). */
  readonly existing: { readonly room: RoomState; readonly member: RoomMember } | null;
  /** The refusal, with the status the REST side gives it (`rooms.md`). */
  readonly rejection: { readonly type: string; readonly status: number } | null;
  /** The room after the join — the named room when the request was refused. */
  readonly room: RoomState;
  readonly member: RoomMember | null;
  /** The peer the role goes to because a host came back inside its grace window (`NFR-07`), or `null`. */
  readonly promoted: string | null;
}

export function planJoin(
  room: RoomState,
  body: JoinRequest & { roomCode?: string; settings?: Partial<RoomSettings> },
): JoinPlan {
  const named = nameRoom(room, body);
  const graceHost = isGraceHost(named, body.playerId);
  const existing = seatOf(named, body);
  if (existing) {
    return {
      existing: { room: withActivity(withSeen(named, existing.playerId)), member: existing },
      rejection: null,
      room: named,
      member: existing,
      promoted: null,
    };
  }
  const outcome = joinRoom(named, { ...body, now: Date.now() });
  if (outcome.rejection) {
    const status = outcome.rejection === "room-full" ? 409 : outcome.rejection === "room-closed" ? 410 : 400;
    return { existing: null, rejection: { type: outcome.rejection, status }, room: named, member: null, promoted: null };
  }
  const joined = withActivity(outcome.room);
  // `NFR-07`: a host that comes back inside its grace window keeps its slot, not the role — the room has
  // already been handed on, and taking it back would be a second silent migration.
  return {
    existing: null,
    rejection: null,
    room: joined,
    member: outcome.member,
    promoted: graceHost ? electHost(joined) : null,
  };
}
