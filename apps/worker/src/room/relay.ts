/**
 * `signal`, `move` and `item` are relayed, never interpreted: the Worker has no board, no energy and no
 * inventory, which is what keeps the room socket from being a gameplay authority (`ADR-0004`).
 */
import type { RoomState, SignalPayload } from "@gbw/core";
import { refuse, toPlayer, type Decision } from "./wire.js";

/** `signal` reaches only its `to`, and never the sender (`US-ROOM-006`, TC-ROOM-050). */
export function relaySignal(
  room: RoomState,
  sockets: ReadonlyMap<string, WebSocket>,
  playerId: string,
  frame: { to: string; payload: SignalPayload },
): Decision {
  if (frame.to === playerId) return refuse("bad-request", "a client cannot signal itself");
  const member = room.members.find((candidate) => candidate.playerId === frame.to);
  // An offline peer and a stranger are answered identically, so the socket cannot be used to probe
  // who is in the room (`US-ROOM-006` AC2).
  if (!sockets.get(frame.to) || !member) return refuse("peer-not-connected", "the peer has no open socket");
  return { ok: true, out: [toPlayer(frame.to, { t: "signal", from: playerId, payload: frame.payload })] };
}

/**
 * `move` and `item` are validated by the host, not here: the Worker has no board, no energy and no inventory.
 * The object only checks that there is a match to act in, that the sender holds the turn, and that the host
 * still has a socket to receive it.
 */
export function relayInput(
  room: RoomState,
  sockets: ReadonlyMap<string, WebSocket>,
  playerId: string,
  frame: { t: "move"; direction: 0 | 1; run: boolean } | { t: "item"; id: string },
): Decision {
  if (playerId === room.hostPlayerId) return { ok: true, out: [] };
  if (room.status !== "playing") return refuse("invalid-state", "the match has not started");
  // Only the active slot may act (`US-NET-004` AC2, `TC-NET-067`); the last snapshot is the DO's only view of
  // the turn, and before the first one no slot is active, so nothing may be relayed yet.
  const activeSlot = room.lastSnapshot?.turn.activeSlot;
  const senderSlot = room.members.find((member) => member.playerId === playerId)?.slot;
  if (activeSlot === undefined) return refuse("unsupported-message", "No slot is active yet");
  if (senderSlot !== undefined && senderSlot !== activeSlot) {
    return refuse("unsupported-message", "only the active player may act");
  }
  const hostId = room.hostPlayerId;
  if (!hostId || !sockets.get(hostId)) return refuse("peer-not-connected", "the host has no open socket");
  return {
    ok: true,
    out: [
      toPlayer(
        hostId,
        frame.t === "move"
          ? { t: "move", from: playerId, direction: frame.direction, run: frame.run }
          : { t: "item", from: playerId, id: frame.id },
      ),
    ],
  };
}
