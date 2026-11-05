-- 0001_init.sql — accounts, profiles, matches, ratings and submission idempotency
-- (`docs/02-reference/data/*.md`, `ADR-0003`).
-- Conventions: TEXT UUID primary keys, ISO-8601 UTC timestamps, 0/1 integers for booleans,
-- TEXT enumerations with CHECK constraints, snake_case columns (see data/README.md).

CREATE TABLE account (
  account_id     TEXT PRIMARY KEY,
  clerk_user_id  TEXT NOT NULL UNIQUE,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  created_at     TEXT NOT NULL,
  last_seen_at   TEXT NOT NULL,
  -- Set when deletion was requested; the purge clock counts 30 days from here (`NFR-13`, `NFR-15`).
  deleted_at     TEXT
) STRICT;

CREATE INDEX idx_account_status ON account (status, last_seen_at);

CREATE TABLE profile (
  account_id        TEXT PRIMARY KEY REFERENCES account (account_id) ON DELETE CASCADE,
  display_name      TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 16),
  display_name_key  TEXT NOT NULL UNIQUE,
  avatar_id         TEXT NOT NULL DEFAULT 'default',
  rating            INTEGER NOT NULL DEFAULT 1200 CHECK (rating BETWEEN 0 AND 4000),
  rated_matches     INTEGER NOT NULL DEFAULT 0 CHECK (rated_matches >= 0),
  -- The room this player is sitting in right now, written on join and cleared when the room is left or the
  -- account is deleted. `DELETE /me` must refuse while a match is running, and a room lives in a Durable
  -- Object the Worker cannot enumerate, so the code has to be remembered here (`US-AUTH-004`, TC-AUTH-069).
  current_room_code TEXT,
  updated_at        TEXT NOT NULL
) STRICT;

CREATE INDEX idx_profile_leaderboard ON profile (rating DESC, rated_matches DESC, account_id ASC);

CREATE TABLE match_record (
  match_id        TEXT PRIMARY KEY,
  room_code       TEXT NOT NULL,
  player_count    INTEGER NOT NULL CHECK (player_count BETWEEN 2 AND 8),
  -- JSON arrays of slots, e.g. '[0,1]' — the read model needs the grouping, not a count.
  team_a_slots    TEXT NOT NULL,
  team_b_slots    TEXT NOT NULL,
  winner_team     TEXT NOT NULL CHECK (winner_team IN ('A', 'B')),
  ranked          INTEGER NOT NULL DEFAULT 0 CHECK (ranked IN (0, 1)),
  ruleset_version TEXT NOT NULL,
  duration_ms     INTEGER NOT NULL CHECK (duration_ms BETWEEN 60000 AND 1800000),
  started_at      TEXT NOT NULL,
  ended_at        TEXT NOT NULL,
  submitted_by    TEXT NOT NULL,
  created_at      TEXT NOT NULL
) STRICT;

-- One row per room occurrence: a code is reused after ten minutes of inactivity, so the pair
-- (room_code, started_at) is what identifies a match (`US-RANK-001`).
CREATE UNIQUE INDEX idx_match_unique ON match_record (room_code, started_at);
CREATE INDEX idx_match_created ON match_record (created_at DESC);
CREATE INDEX idx_match_room_created ON match_record (room_code, created_at DESC);

CREATE TABLE match_player (
  match_id       TEXT NOT NULL REFERENCES match_record (match_id) ON DELETE CASCADE,
  -- Kept after the account is deleted (`NFR-13`), so this is a logical reference only: a real
  -- FOREIGN KEY would make the account purge fail or null the column, and both lose the history.
  account_id     TEXT NOT NULL,
  slot           INTEGER NOT NULL CHECK (slot BETWEEN 0 AND 7),
  team           TEXT NOT NULL CHECK (team IN ('A', 'B')),
  result         TEXT NOT NULL CHECK (result IN ('win', 'loss', 'abandon')),
  damage_dealt   INTEGER NOT NULL DEFAULT 0 CHECK (damage_dealt >= 0),
  shots_fired    INTEGER NOT NULL DEFAULT 0 CHECK (shots_fired >= 0),
  hits           INTEGER NOT NULL DEFAULT 0 CHECK (hits BETWEEN 0 AND shots_fired),
  rating_before  INTEGER CHECK (rating_before BETWEEN 0 AND 4000),
  rating_after   INTEGER CHECK (rating_after BETWEEN 0 AND 4000),
  PRIMARY KEY (match_id, account_id),
  UNIQUE (match_id, slot)
) STRICT;

CREATE INDEX idx_match_player_account ON match_player (account_id, match_id);

CREATE TABLE rating_history (
  id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  -- Logical reference only, like `match_player.account_id`: the audit trail outlives the account.
  account_id     TEXT NOT NULL,
  match_id       TEXT NOT NULL REFERENCES match_record (match_id) ON DELETE CASCADE,
  rating_before  INTEGER NOT NULL CHECK (rating_before BETWEEN 0 AND 4000),
  rating_after   INTEGER NOT NULL CHECK (rating_after BETWEEN 0 AND 4000),
  delta          INTEGER NOT NULL,
  created_at     TEXT NOT NULL,
  UNIQUE (account_id, match_id)
) STRICT;

CREATE INDEX idx_rating_history_account ON rating_history (account_id, created_at DESC);

-- `Idempotency-Key` replay store (matches.md: "Idempotent … for 24 h"). Not part of the public data
-- model: it holds the first answer so a client retry never records a second match. Rows expire after
-- 24 hours; the response body is replayed verbatim.
CREATE TABLE match_submission (
  idempotency_key TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL,
  request_hash    TEXT NOT NULL,
  status_code     INTEGER NOT NULL,
  response_body   TEXT NOT NULL,
  created_at      TEXT NOT NULL
) STRICT;

CREATE INDEX idx_match_submission_created ON match_submission (created_at);
