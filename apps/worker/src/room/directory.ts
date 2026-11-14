/**
 * The narrow D1 projection behind `GET /rooms` (`ADR-0008`, `US-ROOM-013`).
 *
 * The Room DO owns the live state. This adapter maps only the lifecycle fields the public browser may see, and
 * deliberately has no socket, identity, token or snapshot input. Calling it is cheap; the object still avoids calling
 * it when the projected fields have not changed, so heartbeat and snapshot traffic never writes D1.
 */
import type { RoomState } from "@gbw/core";

const WAITING_TTL_MS = 10 * 60_000;
const PLAYING_TTL_MS = 24 * 60 * 60_000;
const DIRECTORY_KEY = "roomDirectoryKey";

export interface DirectoryStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
}

export interface RoomDirectoryProjection {
  readonly roomCode: string;
  readonly status: "waiting" | "playing";
  readonly mode: RoomState["settings"]["mode"];
  readonly mapId: string;
  readonly seated: number;
  readonly maxPlayers: RoomState["settings"]["maxPlayers"];
  readonly isPrivate: boolean;
  readonly joinable: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt: string;
}

/** The fields whose change requires a D1 write; activity-only room updates do not. */
export function roomDirectoryKey(room: RoomState, matchStartedAt: number | null): string {
  return [
    room.roomCode,
    room.status,
    room.settings.mode,
    room.settings.mapId,
    room.members.length,
    room.settings.maxPlayers,
    room.settings.isPrivate ? "1" : "0",
    matchStartedAt ?? "",
  ].join("|");
}

/**
 * `null` means the row must be deleted rather than projected: closed/abandoned rooms, private rooms and objects that
 * never received a code are not discoverable.
 */
export function publicDirectoryProjection(
  room: RoomState,
  matchStartedAt: number | null,
  now: number,
): RoomDirectoryProjection | null {
  if (room.roomCode === "" || room.settings.isPrivate) return null;
  if (room.status !== "lobby" && room.status !== "playing") return null;

  const waiting = room.status === "lobby";
  const status = waiting ? "waiting" : "playing";
  const expiryBase = waiting ? now : (matchStartedAt ?? now);
  return {
    roomCode: room.roomCode,
    status,
    mode: room.settings.mode,
    mapId: room.settings.mapId,
    seated: room.members.length,
    maxPlayers: room.settings.maxPlayers,
    isPrivate: false,
    joinable: waiting && room.members.length < room.settings.maxPlayers,
    createdAt: new Date(room.createdAt).toISOString(),
    updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(expiryBase + (waiting ? WAITING_TTL_MS : PLAYING_TTL_MS)).toISOString(),
  };
}

export async function deleteRoomDirectory(db: D1Database | undefined, roomCode: string): Promise<void> {
  if (!db || roomCode === "") return;
  await db.prepare("DELETE FROM room_directory WHERE room_code = ?").bind(roomCode).run();
}

export async function tryDeleteRoomDirectory(db: D1Database | undefined, roomCode: string): Promise<void> {
  try {
    await deleteRoomDirectory(db, roomCode);
  } catch (error) {
    console.warn("room directory cleanup failed", error instanceof Error ? error.message : "unknown");
  }
}

export async function syncRoomDirectory(
  db: D1Database | undefined,
  room: RoomState,
  matchStartedAt: number | null,
  currentKey: string | null,
  now = Date.now(),
): Promise<string | null> {
  const key = roomDirectoryKey(room, matchStartedAt);
  if (!db || key === currentKey) return key;
  try {
    const projection = publicDirectoryProjection(room, matchStartedAt, now);
    if (!projection) {
      await deleteRoomDirectory(db, room.roomCode);
      return key;
    }
    await db
      .prepare(
        `INSERT INTO room_directory
          (room_code, status, mode, map_id, seated, max_players, is_private, joinable, created_at, updated_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
         ON CONFLICT(room_code) DO UPDATE SET
           status = excluded.status,
           mode = excluded.mode,
           map_id = excluded.map_id,
           seated = excluded.seated,
           max_players = excluded.max_players,
           is_private = excluded.is_private,
           joinable = excluded.joinable,
           updated_at = excluded.updated_at,
           expires_at = excluded.expires_at`,
      )
      .bind(
        projection.roomCode,
        projection.status,
        projection.mode,
        projection.mapId,
        projection.seated,
        projection.maxPlayers,
        projection.joinable ? 1 : 0,
        projection.createdAt,
        projection.updatedAt,
        projection.expiresAt,
      )
      .run();
    return key;
  } catch (error) {
    console.warn("room directory projection failed", error instanceof Error ? error.message : "unknown");
    return currentKey;
  }
}

/** Dedupes the projection across a DO's lifetime and persists the last successful key for hibernation restarts. */
export class RoomDirectoryWriter {
  private key: string | null = null;
  private restored = false;

  constructor(private readonly db: D1Database | undefined) {}

  async persist(
    storage: DirectoryStorage,
    room: RoomState,
    matchStartedAt: number | null,
    now = Date.now(),
  ): Promise<void> {
    if (!this.restored) {
      this.key = (await storage.get<string>(DIRECTORY_KEY)) ?? null;
      this.restored = true;
    }
    const key = await syncRoomDirectory(this.db, room, matchStartedAt, this.key, now);
    if (key === null || key === this.key) return;
    this.key = key;
    await storage.put(DIRECTORY_KEY, key);
  }

  async close(roomCode: string): Promise<void> {
    await tryDeleteRoomDirectory(this.db, roomCode);
  }
}
