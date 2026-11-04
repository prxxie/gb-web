-- 0001_init.sql — accounts, profiles, matches and ratings (`docs/02-reference/data/*.md`, `ADR-0003`).
-- Conventions: TEXT UUID primary keys, ISO-8601 UTC timestamps, 0/1 integers for booleans,
-- TEXT enumerations with CHECK constraints, snake_case columns (see data/README.md).

CREATE TABLE account (
  account_id     TEXT PRIMARY KEY,
  clerk_user_id  TEXT NOT NULL UNIQUE,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  created_at     TEXT NOT NULL,
  last_seen_at   TEXT NOT NULL
) STRICT;

CREATE TABLE profile (
  account_id        TEXT PRIMARY KEY REFERENCES account (account_id) ON DELETE CASCADE,
  display_name      TEXT NOT NULL CHECK (length(display_name) BETWEEN 2 AND 16),
  display_name_key  TEXT NOT NULL UNIQUE,
  avatar_id         TEXT NOT NULL DEFAULT 'avatar-01',
  rating            INTEGER NOT NULL DEFAULT 1200 CHECK (rating BETWEEN 0 AND 4000),
  rated_matches     INTEGER NOT NULL DEFAULT 0 CHECK (rated_matches >= 0),
  updated_at        TEXT NOT NULL
) STRICT;

CREATE INDEX idx_profile_leaderboard ON profile (rating DESC, rated_matches DESC, account_id ASC);

CREATE TABLE match_record (
  match_id        TEXT PRIMARY KEY,
  room_code       TEXT NOT NULL,
  player_count    INTEGER NOT NULL CHECK (player_count BETWEEN 2 AND 8),
  team_a_slots    INTEGER NOT NULL CHECK (team_a_slots BETWEEN 1 AND 4),
  team_b_slots    INTEGER NOT NULL CHECK (team_b_slots BETWEEN 1 AND 4),
  winner_team     TEXT CHECK (winner_team IN ('A', 'B')),
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
CREATE INDEX idx_match_ended ON match_record (ended_at DESC);

CREATE TABLE match_player (
  match_id       TEXT NOT NULL REFERENCES match_record (match_id) ON DELETE CASCADE,
  account_id     TEXT NOT NULL REFERENCES account (account_id) ON DELETE CASCADE,
  slot           INTEGER NOT NULL CHECK (slot BETWEEN 0 AND 7),
  result         TEXT NOT NULL CHECK (result IN ('win', 'loss', 'abandon')),
  damage_dealt   INTEGER NOT NULL DEFAULT 0 CHECK (damage_dealt >= 0),
  shots_fired    INTEGER NOT NULL DEFAULT 0 CHECK (shots_fired >= 0),
  hits           INTEGER NOT NULL DEFAULT 0 CHECK (hits >= 0),
  rating_before  INTEGER CHECK (rating_before BETWEEN 0 AND 4000),
  rating_after   INTEGER CHECK (rating_after BETWEEN 0 AND 4000),
  PRIMARY KEY (match_id, account_id),
  UNIQUE (match_id, slot)
) STRICT;

CREATE INDEX idx_match_player_account ON match_player (account_id);

CREATE TABLE rating_history (
  account_id  TEXT NOT NULL REFERENCES account (account_id) ON DELETE CASCADE,
  match_id    TEXT NOT NULL REFERENCES match_record (match_id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 0 AND 4000),
  delta       INTEGER NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (account_id, match_id)
) STRICT;

CREATE INDEX idx_rating_history_created ON rating_history (created_at DESC);
