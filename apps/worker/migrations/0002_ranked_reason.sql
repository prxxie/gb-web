-- `US-RANK-001` AC6 and `US-RANK-003` AC4: why a stored match did not change a rating.
--
-- The `POST /matches` response and every history row carry that reason, and it cannot be reconstructed
-- later: `ranked = 0` is the same bit for a guest seat, an abandoned match and a stale ruleset, and
-- `match_player.result = 'abandon'` also covers a forfeit in a match that *was* rated. Additive migration:
-- the column is nullable so the table stays writable by a database created before this file; every row
-- `POST /matches` writes from now on fills it (`NULL` exactly when the match was rated).
ALTER TABLE match_record ADD COLUMN ranked_reason TEXT;
