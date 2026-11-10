/**
 * The host role: who is next, the one generation counter, and the 5 s recheck that turns "promoted" into
 * "playable" (`US-ROOM-005` AC1/AC3, `NFR-06`).
 *
 * Candidate choice, promotion and the recheck stay in one module on purpose: splitting the timer from the
 * promotion is how a promoted-but-dead host would stall a room.
 */
import { electHost, type RoomMember, type RoomState } from "@gbw/core";
import { withActivity } from "./presence.js";

/** Exactly one `role: "host"` on the roster, everyone else a player. */
function withRoles(room: RoomState, hostPlayerId: string): readonly RoomMember[] {
  return room.members.map((member) =>
    member.playerId === hostPlayerId
      ? { ...member, role: "host" as const }
      : member.role === "host"
        ? { ...member, role: "player" as const }
        : member,
  );
}

/** A promotion decided inside a frame: the generation moves by one and the caller's stamp of activity stands. */
export function withPromotion(room: RoomState, hostPlayerId: string): RoomState {
  return {
    ...room,
    hostPlayerId,
    hostGeneration: room.hostGeneration + 1,
    members: withRoles(room, hostPlayerId),
  };
}

/** `announceHostChange`'s transition: the generation moves only when the host actually changed. */
export function withHostChange(room: RoomState, previousHostId: string): RoomState {
  const nextHost = room.hostPlayerId ?? "";
  return withActivity({
    ...room,
    hostGeneration: room.hostGeneration + (previousHostId === nextHost ? 0 : 1),
    members: withRoles(room, nextHost),
  });
}

/** The oldest member that is connected right now and has not already been tried (`AC1`, `AC3`). */
function nextCandidate(
  room: RoomState,
  tried: readonly string[],
  isOpen: (playerId: string) => boolean,
): string | null {
  return (
    room.members
      .filter(
        (member) =>
          member.playerId !== undefined &&
          member.playerId !== room.hostPlayerId &&
          !tried.includes(member.playerId) &&
          isOpen(member.playerId) &&
          member.connectionState === "connected",
      )
      .sort((left, right) => left.joinedAt - right.joinedAt || left.slot - right.slot)[0]?.playerId ?? null
  );
}

/** What a promotion changes, and what it costs when nobody is left to promote. */
export interface PromotionPlan {
  readonly room: RoomState;
  readonly hostCheck: readonly string[];
  readonly promoted: string | null;
  readonly previousHostId: string;
  /** The room went `abandoned`: a live match cannot continue without a host (`US-ROOM-005` AC3). */
  readonly abandoned: boolean;
}

/**
 * The promotion itself: candidate choice and the generation counter move together here, because splitting the
 * two is how a promoted-but-dead host would stall a room. An empty `hostCheck` on the way in means "start a
 * migration"; the list it returns is what the recheck alarm reads.
 */
export function planPromotion(
  room: RoomState,
  hostCheck: readonly string[],
  isOpen: (playerId: string) => boolean,
): PromotionPlan {
  const promoted = nextCandidate(room, hostCheck, isOpen);
  const previousHostId = room.hostPlayerId ?? "";
  if (!promoted) {
    const abandoned = room.status === "playing";
    return {
      room: abandoned ? { ...room, status: "abandoned" } : room,
      hostCheck,
      promoted: null,
      previousHostId,
      abandoned,
    };
  }
  return {
    room: { ...room, hostPlayerId: promoted },
    hostCheck: [...hostCheck, promoted],
    promoted,
    previousHostId,
    abandoned: false,
  };
}

/** A promoted host is live once its seat says `connected` and its socket is still open (`AC3`). */
export function isLiveHost(room: RoomState, isOpen: (playerId: string) => boolean): boolean {
  const host = room.members.find((member) => member.playerId === room.hostPlayerId);
  return host?.connectionState === "connected" && isOpen(host.playerId ?? "");
}

/** The current host, by id, for the frames that have to name who left. */
export function hostOf(room: RoomState): RoomMember | undefined {
  return room.members.find((member) => member.playerId === room.hostPlayerId);
}

/** The role moves only once the grace window it was given has run out (`US-ROOM-005`). */
export function hostIsGone(room: RoomState): boolean {
  const host = hostOf(room);
  return !host || host.connectionState === "disconnected";
}

/** With nobody connected there is nobody to promote: the room is abandoned instead (`TC-ROOM-050`). */
export function anyConnected(room: RoomState): boolean {
  return room.members.some((member) => member.connectionState === "connected");
}

/** The next host for an alarm that found the current one gone — `null` when nobody is connected. */
export function electNext(room: RoomState): string | null {
  return anyConnected(room) ? electHost(room) : null;
}
