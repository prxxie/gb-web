/**
 * The 10 Hz path: accept the host's snapshot, keep the newest one, relay it packed (`US-NET-002`, `US-ROOM-006`).
 *
 * The host sends the packed form to save uplink (`US-NET-002` AC7); the object stores and relays the expanded
 * object, because a rejoin replay is one message and every client reads it the same way.
 */
import {
  expandWire,
  isWireSnapshot,
  packSnapshot,
  type ErrorCode,
  type RoomState,
  type Snapshot,
  type WireSnapshot,
} from "@gbw/core";
import { toPlayer, type Outgoing } from "./wire.js";

/**
 * The snapshot this push carries, expanded. A stale `seq` is dropped silently — the roster already has a
 * newer board (`signaling.md` § 2) — and `null` says so.
 */
function acceptSnapshot(
  room: RoomState,
  snapshot: Snapshot | WireSnapshot,
): { readonly room: RoomState; readonly snapshot: Snapshot } | null {
  const expanded = isWireSnapshot(snapshot) ? expandWire(snapshot) : snapshot;
  if (room.lastSnapshot && expanded.seq <= room.lastSnapshot.seq) return null;
  return {
    room: { ...room, lastSnapshot: expanded, lastActivityAt: Date.now() },
    snapshot: expanded,
  };
}

/** A `snapshot_push`: the host's only write, refused or accepted on the same guards as the rest of the table. */
export type PushOutcome =
  | { readonly ok: false; readonly code: ErrorCode; readonly detail: string }
  /** `accepted: null` is a stale `seq`: the roster already has a newer board. */
  | { readonly ok: true; readonly accepted: { readonly room: RoomState; readonly snapshot: Snapshot } | null };

export function pushSnapshot(
  room: RoomState,
  playerId: string,
  snapshot: Snapshot | WireSnapshot,
): PushOutcome {
  if (playerId !== room.hostPlayerId) {
    return { ok: false, code: "not-host", detail: "only the host pushes snapshots" };
  }
  if (room.status !== "playing") {
    return { ok: false, code: "invalid-state", detail: "the room is not playing" };
  }
  return { ok: true, accepted: acceptSnapshot(room, snapshot) };
}

/**
 * The relay: everyone but the sender, packed again. The relay is the 10 Hz path on a congested room and the
 * point of `AC7` is that no snapshot on the wire is bigger than 800 B (`US-NET-002`).
 */
export function relaySnapshot(snapshot: Snapshot, recipients: readonly string[]): readonly Outgoing[] {
  const payload = { t: "snapshot_state", snapshot: packSnapshot(snapshot) };
  return recipients.map((playerId) => toPlayer(playerId, payload));
}

/** The rejoin replay: one message, the same shape as a relay, so a peer cannot tell the two apart. */
export function snapshotState(snapshot: Snapshot) {
  return { t: "snapshot_state", snapshot: packSnapshot(snapshot) };
}
