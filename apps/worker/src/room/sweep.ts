/**
 * What an alarm decides: grace expiry, the forfeit, the silent sockets, the host role and the room's own end
 * (`workflow-state-machine.md`, `US-ROOM-004`, `US-ROOM-005`).
 *
 * The plan is a list because the alarm is a sequence — which seat is retired before which frame goes out is
 * what the client sees. The object plays it (persist, deliver, close a socket, re-arm the alarm), so storage
 * stays behind its single `persist()` and this file stays a readable order of events.
 */
import { TUNABLES, isForfeited, isRoomExpired, type RoomState, type Team } from "@gbw/core";
import { anyConnected, electNext, hostIsGone } from "./election.js";
import { withStatus } from "./match-lifecycle.js";
import { expireGrace, withGrace } from "./presence.js";
import { peerLeft, roomState, type Outgoing } from "./wire.js";

export type SweepAction =
  | { readonly kind: "commit"; readonly room: RoomState; readonly out: readonly Outgoing[]; readonly persist: boolean }
  /** The abandoning team is recorded as abandoned before the "nobody connected" rule hides the winner. */
  | { readonly kind: "forfeit"; readonly winnerTeam: Team }
  /** Announce, then drop and close the sockets that went quiet (`US-ROOM-002` AC4). */
  | { readonly kind: "silence"; readonly playerIds: readonly string[] }
  /** Re-arm the heartbeat sweep the silence above just served. */
  | { readonly kind: "heartbeat" }
  | { readonly kind: "promote"; readonly hostPlayerId: string; readonly previousHostId: string }
  | { readonly kind: "close"; readonly room: RoomState; readonly reason: "expired" | "empty" | "closed" };

export interface SweepInput {
  readonly room: RoomState;
  /** `match_started.startedAt`: the 24 h cap is measured from it, not from room creation (`TC-ROOM-053`). */
  readonly matchStartedAt: number | null;
  /** The seats whose socket missed three heartbeats (`isSilent`). */
  readonly silent: readonly string[];
  readonly now: number;
}

/**
 * When the next sweep is due, or `null` while a socket is still open. `workflow-state-machine.md`: a lobby whose
 * last member left is deleted sixty seconds later; an ended room rides the normal idle window.
 */
export function sweepAt(room: RoomState, openSockets: number): number | null {
  if (openSockets > 0) return null;
  return room.status === "lobby" || room.members.length === 0
    ? room.lastActivityAt + 60_000
    : room.lastActivityAt + TUNABLES.roomIdleMs;
}

export function planSweep(input: SweepInput): readonly SweepAction[] {
  const actions: SweepAction[] = [];
  let room = input.room;

  // A grace that ran out becomes `disconnected`, and every peer hears about it (`US-ROOM-004` AC3).
  const grace = expireGrace(room);
  room = grace.room;
  const expiredOut: Outgoing[] = grace.expired.map((playerId) => ({
    to: null,
    payload: peerLeft(playerId, "disconnected"),
  }));
  if (grace.expired.length > 0) expiredOut.push({ to: null, payload: roomState(room) });
  actions.push({ kind: "commit", room, out: expiredOut, persist: false });

  // A team that lost every member forfeits, and the match is recorded as abandoned (`US-ROOM-004` AC5/AC6)
  // before the "nobody is connected any more" rule below gets a chance to hide the winner.
  if (room.status === "playing") {
    const forfeited = isForfeited(room);
    if (forfeited !== null) {
      room = withStatus(room, "abandoned");
      actions.push({ kind: "commit", room, out: [{ to: null, payload: roomState(room) }], persist: true });
      actions.push({ kind: "forfeit", winnerTeam: forfeited });
    }
  }

  // Nobody connected and nobody left in the roster: the room is over, not merely quiet (`US-ROOM-005`).
  if (!anyConnected(room) && room.status === "playing") {
    room = withStatus(room, "abandoned");
    actions.push({ kind: "commit", room, out: [], persist: false });
  }

  // Silence is noticed last, so a socket that stops answering is announced as `grace` (not as gone) and the
  // expiry pass above can only retire it on a later alarm (`US-ROOM-002` AC4).
  if (input.silent.length > 0) {
    const silentOut: Outgoing[] = [];
    for (const playerId of input.silent) {
      room = withGrace(room, playerId, input.now);
      silentOut.push({ to: null, payload: peerLeft(playerId, "grace") });
    }
    silentOut.push({ to: null, payload: roomState(room) });
    actions.push({ kind: "commit", room, out: silentOut, persist: true });
    actions.push({ kind: "silence", playerIds: input.silent });
    actions.push({ kind: "heartbeat" });
  }

  // The host role moves only once the grace window it was given has run out — a host that is merely `grace`
  // is not replaced — and only to a peer that is actually connected (`US-ROOM-005`).
  if (hostIsGone(room)) {
    const promoted = electNext(room);
    if (promoted && promoted !== room.hostPlayerId) {
      actions.push({ kind: "promote", hostPlayerId: promoted, previousHostId: room.hostPlayerId ?? "" });
      room = { ...room, hostPlayerId: promoted };
    }
  }

  // An empty lobby goes sixty seconds after its last member left; everything else rides the idle window
  // and the 24 h cap measured from the match start (`workflow-state-machine.md`).
  const emptyLobby =
    room.members.length === 0 && room.status !== "playing" && input.now - room.lastActivityAt >= 60_000;
  const gone = emptyLobby || isRoomExpired(room, input.now, input.matchStartedAt);
  if (gone) {
    actions.push({
      kind: "close",
      room: withStatus(room, "abandoned"),
      reason: emptyLobby ? "empty" : room.members.length > 0 ? "expired" : "closed",
    });
  }
  return actions;
}
