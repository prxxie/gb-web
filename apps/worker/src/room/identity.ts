/**
 * The identity a seat carries: display name, avatar and mobile (`US-ROOM-001`, `US-AUTH-003` AC5).
 *
 * Gameplay data is the host's to validate, but a mobile id is a stat line the host imports, so an unknown one
 * is refused here, and every one of these writes is lobby-only: a rename mid-match would desync the roster a
 * peer is already rendering.
 */
import { isMobileId, type RoomState } from "@gbw/core";
import { withActivity } from "./presence.js";

/** The identity fields an `auth` frame may carry (`signaling.md` § 2). */
export interface IdentityFrame {
  readonly mobileId?: string | undefined;
  readonly displayName?: string | undefined;
  readonly avatarId?: string | undefined;
}

/** Binds the seat to its socket: `connected`, seen, and holding whatever the frame was allowed to change. */
export function applyIdentity(room: RoomState, playerId: string, frame: IdentityFrame): RoomState {
  const lobby = room.status === "lobby";
  return withActivity({
    ...room,
    members: room.members.map((member) =>
      member.playerId === playerId
        ? {
            ...member,
            connectionState: "connected",
            seenConnected: true,
            ...(frame.mobileId && lobby && isMobileId(frame.mobileId) ? { mobileId: frame.mobileId } : {}),
            ...(frame.displayName && lobby ? { displayName: frame.displayName } : {}),
            // The avatar is a cosmetic pick, so it may change wherever the name may (`US-AUTH-003` AC5): the
            // roster a peer renders reads it from the member record, not from the profile row.
            ...(frame.avatarId && lobby ? { avatarId: frame.avatarId } : {}),
          }
        : member,
    ),
  });
}

/**
 * A host coming back inside its grace window keeps its slot but not the role (`NFR-07`): the room has already
 * learned to live without it, so the role goes to the longest-connected peer that stayed.
 */
export function isReturningHost(room: RoomState, playerId: string): boolean {
  const member = room.members.find((candidate) => candidate.playerId === playerId);
  return member?.connectionState === "grace" && room.hostPlayerId === playerId;
}

/** Anybody else still connected — what makes a returning host a plain peer rather than the room's authority. */
export function hasOtherConnected(room: RoomState, playerId: string): boolean {
  return room.members.some(
    (candidate) => candidate.playerId !== playerId && candidate.connectionState === "connected",
  );
}
