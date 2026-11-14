-- 0003_room_directory.sql — bounded public room discovery (`US-ROOM-013`, `ADR-0008`).
--
-- This is a read model, not a copy of RoomState. The Room DO writes only lifecycle metadata here; seat
-- ownership, sockets and signaling stay in the object. No backfill: rooms created before this deploy become
-- visible after their next lifecycle write.

CREATE TABLE room_directory (
  room_code   TEXT PRIMARY KEY,
  status      TEXT NOT NULL CHECK (status IN ('waiting', 'playing')),
  mode        TEXT NOT NULL CHECK (mode IN ('solo', 'score', 'tag', 'jewel')),
  map_id      TEXT NOT NULL,
  seated      INTEGER NOT NULL CHECK (seated >= 0),
  max_players INTEGER NOT NULL CHECK (max_players IN (2, 4, 6, 8)),
  is_private  INTEGER NOT NULL CHECK (is_private IN (0, 1)),
  joinable    INTEGER NOT NULL CHECK (joinable IN (0, 1)),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
) STRICT;

CREATE INDEX idx_room_directory_public
  ON room_directory (is_private, status, updated_at DESC, room_code);

CREATE INDEX idx_room_directory_expiry ON room_directory (expires_at);
