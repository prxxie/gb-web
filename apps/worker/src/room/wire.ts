/**
 * The outbound half of the room: the public roster and the frames built from it (`signaling.md` § 3).
 *
 * A builder is a pure function over a `RoomState`; delivery is one function over the socket map the object
 * owns. A handler answers with a `Decision`, so the object is the only thing that persists or sends.
 */
import type { ErrorCode, RoomState } from "@gbw/core";
import { FRAME_STATUS } from "./protocol.js";
import type { RecordedMatch } from "./protocol.js";

/** One frame to deliver: `to: null` is every socket but `except`, a `string` is one player's socket. */
export interface Outgoing {
  readonly to: null | string | WebSocket;
  readonly except?: string;
  readonly payload: unknown;
}

/**
 * What a frame handler decided: the room to commit (then persist, then deliver `out`, in that order), or
 * the refusal the object logs and sends to the sender (`signaling.md` § 3).
 */
export type Decision =
  | { readonly ok: true; readonly room?: RoomState; readonly out?: readonly Outgoing[] }
  | { readonly ok: false; readonly code: ErrorCode; readonly detail: string };

export function refuse(code: ErrorCode, detail: string): Decision {
  return { ok: false, code, detail };
}

export function toAll(payload: unknown, except?: string): Outgoing {
  return except === undefined ? { to: null, payload } : { to: null, except, payload };
}

export function toPlayer(playerId: string, payload: unknown): Outgoing {
  return { to: playerId, payload };
}

export function toSocket(ws: WebSocket, payload: unknown): Outgoing {
  return { to: ws, payload };
}

/** The roster as the browser sees it: no snapshot blob, only the sequence a rejoin replays from (`TC-ROOM-055`). */
export function publicRoom(room: RoomState): Omit<RoomState, "lastSnapshot"> & { lastSnapshotSeq: number | null } {
  const { lastSnapshot, ...rest } = room;
  return { ...rest, lastSnapshotSeq: lastSnapshot?.seq ?? null };
}

export function roomState(room: RoomState) {
  return { t: "room_state", room: publicRoom(room) };
}

export function roomStateOf(room: RoomState, playerId: string, slot: number) {
  return { t: "room_state", room: publicRoom(room), you: { playerId, slot } };
}

export function peerJoined(room: RoomState, playerId: string, slot: number) {
  return { t: "peer_joined", playerId, slot, room: publicRoom(room) };
}

export function peerLeft(playerId: string, reason: "left" | "grace" | "disconnected") {
  return { t: "peer_left", playerId, reason };
}

export function hostChanged(room: RoomState) {
  return {
    t: "host_changed",
    hostPlayerId: room.hostPlayerId,
    hostGeneration: room.hostGeneration,
    lastSnapshot: room.lastSnapshot ?? null,
    room: publicRoom(room),
  };
}

export function roomClosed(reason: "expired" | "empty" | "closed") {
  return { t: "room_closed", reason };
}

export function matchRecorded(value: RecordedMatch) {
  return { t: "match_recorded", ...value };
}

/** One shape for every refusal: `{t:"error", code, detail}` (`signaling.md` § 3). */
export function refusal(code: ErrorCode, detail: string) {
  return { t: "error", code, detail };
}

/** Never throws: the socket may be gone, and `webSocketClose` is what fixes the roster there. */
export function sendFrame(ws: WebSocket, payload: unknown): void {
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    /* the socket is gone; webSocketClose handles the roster */
  }
}

export function broadcastFrame(
  sockets: ReadonlyMap<string, WebSocket>,
  payload: unknown,
  exceptPlayerId?: string,
): void {
  for (const [playerId, socket] of sockets) {
    if (exceptPlayerId && playerId === exceptPlayerId) continue;
    sendFrame(socket, payload);
  }
}

/** Delivers an ordered list of frames; the order the list carries is the order the clients see. */
export function deliver(sockets: ReadonlyMap<string, WebSocket>, out: readonly Outgoing[]): void {
  for (const frame of out) {
    if (frame.to === null) {
      broadcastFrame(sockets, frame.payload, frame.except);
    } else if (typeof frame.to === "string") {
      const socket = sockets.get(frame.to);
      if (socket) sendFrame(socket, frame.payload);
    } else {
      sendFrame(frame.to, frame.payload);
    }
  }
}

/**
 * The line a refused frame writes (`US-NET-004` AC6), as JSON for the runbook's query.
 *
 * It carries the identity the socket authenticated as — never a `playerId` from the frame, which any browser
 * can edit (`US-NET-004` AC5) — and none of the refused payload, because a snapshot holds every player's HP and a
 * `signal` holds SDP (`NFR-13`, `NFR-24`). `detail` stays out too: it quotes field names from the message.
 */
export function refusalLine(roomCode: string, playerId: string | null | undefined, code: ErrorCode): string {
  return JSON.stringify({
    level: "warn",
    request_id: crypto.randomUUID(),
    route: "WS /api/v1/rooms/:code/ws",
    method: "WS",
    status: FRAME_STATUS[code],
    duration_ms: 0,
    room_code: roomCode,
    player_id: playerId ?? undefined,
    code,
  });
}
