/**
 * The socket itself: the 101 upgrade, the 5 s auth timeout, and the `auth` frame that binds a socket to the seat
 * the Worker already authenticated (`signaling.md` § 2, § 3).
 *
 * Nothing here persists: the object takes the room the binding leaves behind, hands the role on if it has to,
 * writes the record and only then delivers the frames, in the order this module produced them.
 */
import { electHost, parseClientFrame, type ClientFrame, type ErrorCode, type RoomState } from "@gbw/core";
import { verifySession, type SessionSubject } from "../lib/session.js";
import { withPromotion } from "./election.js";
import { applyIdentity, hasOtherConnected, isReturningHost } from "./identity.js";
import { seatOf } from "./presence.js";
import {
  AUTH_TIMEOUT_MS,
  CLOSE_RATE_LIMITED,
  CLOSE_ROOM_FULL,
  CLOSE_ROOM_NOT_FOUND,
  CLOSE_UNAUTHENTICATED,
  type SocketMeta,
} from "./protocol.js";
import { chargeFrame, emptyWindow } from "./rate-limit.js";
import { snapshotState } from "./snapshot-relay.js";
import {
  peerJoined,
  refusal,
  refusalLine,
  roomStateOf,
  sendFrame,
  toAll,
  toSocket,
  type Outgoing,
} from "./wire.js";

/** The two halves of a fresh `WebSocketPair`, and the origin the Worker declared for it. */
export interface SocketOpening {
  readonly client: WebSocket;
  readonly server: WebSocket;
  readonly origin: string | null;
}

/** A closed room refuses the socket outright (`TC-ROOM-056`); anything else gets the 101 upgrade. */
export function openSocket(request: Request, room: RoomState): SocketOpening | null {
  if (room.status === "ended" || room.status === "abandoned") return null;
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
  // `request.url` here is the proxy's `https://room.internal/...` stub, so the public origin comes in on a
  // header. The object keeps it for the alarms, which run with no request in hand.
  return { client, server, origin: request.headers.get("x-room-origin") };
}

/** A socket nobody has spoken on yet: no identity, and a budget window that has not started. */
export function freshMeta(): SocketMeta {
  return {
    playerId: null,
    authed: false,
    accountId: null,
    guestId: null,
    token: null,
    lastPingAt: 0,
    window: emptyWindow(0),
  };
}

/** Nothing may be sent before `auth`: five seconds, then the socket closes with `4401` (`signaling.md` § 2). */
export function armAuthTimeout(server: WebSocket, meta: WeakMap<WebSocket, SocketMeta>): void {
  setTimeout(() => {
    const current = meta.get(server);
    if (current && !current.authed && server.readyState === 1) {
      server.close(CLOSE_UNAUTHENTICATED, "auth timeout");
    }
  }, AUTH_TIMEOUT_MS);
}

/** What an `auth` frame leaves behind once the socket holds a seat. */
export interface SocketBinding {
  readonly room: RoomState;
  readonly playerId: string;
  /** The peer that took the role off a returning host, or `null` when nobody did (`NFR-07`). */
  readonly promoted: string | null;
  readonly out: readonly Outgoing[];
}

export interface BindInput {
  readonly ws: WebSocket;
  readonly frame: { token: string; mobileId?: string; displayName?: string; avatarId?: string };
  readonly room: RoomState;
  readonly sockets: Map<string, WebSocket>;
  readonly meta: WeakMap<WebSocket, SocketMeta>;
  /** `SESSION_TOKEN_SECRET`: the object's binding, passed in so this module reads no environment. */
  readonly secret: string;
}

/**
 * Binds the socket to the member the Worker already authenticated (`docs/02-reference/api/signaling.md`).
 * The mobile id and display name arrive on the frame; identity comes from the proxy headers.
 *
 * `null` means the socket was closed here instead: a session that does not verify, or a seat that does not exist
 * (in a full room, that is `4409` — the ninth player of an eight-slot room, `US-ROOM-002` AC3).
 */
async function bindSocket(input: BindInput): Promise<SocketBinding | null> {
  const { ws, frame, sockets, meta } = input;
  const current = meta.get(ws);
  if (!current) return null;
  let subject: SessionSubject;
  try {
    subject = (await verifySession(frame.token, input.secret)).sub;
  } catch {
    ws.close(CLOSE_UNAUTHENTICATED, "invalid session token");
    return null;
  }
  const member = seatOf(input.room, subject);
  if (!member) {
    const full = input.room.members.length >= input.room.settings.maxPlayers;
    ws.close(full ? CLOSE_ROOM_FULL : CLOSE_ROOM_NOT_FOUND, full ? "room full" : "unknown player");
    return null;
  }
  const playerId = member.playerId;
  const previous = sockets.get(playerId);
  if (previous && previous !== ws) {
    sendFrame(previous, refusal("unsupported-message", "replaced by a newer connection"));
    previous.close(4408, "replaced");
  }
  meta.set(ws, { ...current, playerId, authed: true, token: frame.token, lastPingAt: Date.now() });
  sockets.set(playerId, ws);
  // A host coming back inside its grace window keeps its slot but not the role (`NFR-07`): the room has
  // already learned to live without it, so the role goes to the longest-connected peer that stayed.
  const returned = isReturningHost(input.room, playerId) && hasOtherConnected(input.room, playerId);
  let room = applyIdentity(input.room, playerId, frame);
  const promoted = returned ? electHost(room) : null;
  if (promoted) room = withPromotion(room, promoted);
  const out: Outgoing[] = [
    toSocket(ws, roomStateOf(room, playerId, member.slot)),
    toAll(peerJoined(room, playerId, member.slot), playerId),
  ];
  // A rejoin replays the board: one message, the same shape as a relay (`US-NET-002`).
  if (room.status === "playing" && room.lastSnapshot) out.push(toSocket(ws, snapshotState(room.lastSnapshot)));
  return { room, playerId, promoted, out };
}

/** One refusal: the sender hears `{t:"error"}`, and the runbook gets one structured line (`US-NET-004` AC6). */
export function refuseFrame(
  ws: WebSocket,
  roomCode: string,
  meta: WeakMap<WebSocket, SocketMeta>,
  code: ErrorCode,
  detail: string,
): void {
  console.info(refusalLine(roomCode, meta.get(ws)?.playerId, code));
  sendFrame(ws, refusal(code, detail));
}

/** What the gate decided: the socket is done, an `auth` frame produced a binding, or a frame is ready to route. */
export type Gated =
  | { readonly kind: "drop" }
  | { readonly kind: "auth"; readonly binding: SocketBinding | null }
  | { readonly kind: "ready"; readonly frame: ClientFrame; readonly playerId: string; readonly meta: SocketMeta };

/** The gate's inputs: the socket, its bytes, and the roster and tables it is judged against. */
export interface GateInput extends Omit<BindInput, "frame"> {
  readonly raw: string | ArrayBuffer;
}

/**
 * Everything that has to happen before a frame is routed. It must parse; nothing but `auth` may arrive before the
 * socket is bound (`4401`); and every other frame is charged to the socket's per-second budget first, so a flood
 * costs the same whether or not the payload is well formed (`US-NET-004` §5). `drop` means a refusal went out or
 * the socket was closed here, and there is nothing left to route.
 */
export async function gateFrame(input: GateInput): Promise<Gated> {
  const { ws, room, meta } = input;
  const parsed = parseClientFrame(typeof input.raw === "string" ? input.raw : new TextDecoder().decode(input.raw));
  if (!parsed.ok) {
    refuseFrame(ws, room.roomCode, meta, parsed.code, parsed.detail);
    return { kind: "drop" };
  }
  const frame = parsed.frame;
  if (frame.t === "auth") {
    return { kind: "auth", binding: await bindSocket({ ...input, frame }) };
  }
  const current = meta.get(ws);
  if (!current?.authed || !current.playerId) {
    ws.close(CLOSE_UNAUTHENTICATED, "auth required");
    return { kind: "drop" };
  }
  const charged = chargeFrame(current.window, frame.t, Date.now());
  const next = { ...current, window: charged.window };
  meta.set(ws, next);
  if (!charged.charged) {
    refuseFrame(ws, room.roomCode, meta, "rate-limited", `more than ${charged.limit} ${frame.t} frames in a second`);
    // One refusal, then the socket goes: flooding must not cost the room a frame per attempt, and `4429` is the
    // close code `signaling.md` documents for exactly this (`US-NET-004` §5).
    meta.delete(ws);
    ws.close(CLOSE_RATE_LIMITED, "rate limited");
    return { kind: "drop" };
  }
  return { kind: "ready", frame, playerId: current.playerId, meta: next };
}
