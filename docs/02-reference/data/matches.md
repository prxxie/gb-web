# Data — matches and rating

Three tables written in **one D1 batch transaction** by `POST /api/v1/matches` ([ADR-0003](../../04-decisions/adr/ADR-0003-data-d1.md)).
A match that is not rated still writes `match_record` + `match_player`; it writes no `rating_history` row and leaves the
rating columns `NULL`.

## `match_record`

| Column | Type | Null | Default | Description |
|--------|------|------|---------|-------------|
| `match_id` | TEXT | no | uuid | Primary key, minted by the server (never trusted from the client) |
| `room_code` | TEXT | no | — | Room the match was played in; not unique — a room replays |
| `player_count` | INTEGER | no | — | 2–8, the number of seats submitted (a guest seat counts here even though it gets no `match_player` row) |
| `team_a_slots` | TEXT | no | — | JSON array of slots, e.g. `[0,1]` |
| `team_b_slots` | TEXT | no | — | JSON array of slots |
| `winner_team` | TEXT | no | — | `A` \| `B` |
| `ranked` | INTEGER | no | `0` | 1 when at least one registered player sits on each side, no bot, no abandonment and the ruleset matches — a guest seat does **not** void it |
| `ruleset_version` | TEXT | no | — | Tunables version in force, e.g. `2026-11-01` |
| `duration_ms` | INTEGER | no | — | `ended_at − started_at`, server-computed from client timestamps clamped to [60 s, 30 min] |
| `started_at` | TEXT | no | — | Host-reported ISO-8601, clamped |
| `ended_at` | TEXT | no | — | Host-reported ISO-8601, must be after `started_at` |
| `submitted_by` | TEXT | no | — | `account_id` of the submitter (must be the host and a participant) |
| `delay_table` | TEXT | no | `[]` | JSON array of the accumulated delay of each slot at the end, in slot order — the table that produced the turn order (`US-CORE-002` AC7); kept so a disputed match can be replayed |
| `created_at` | TEXT | no | — | Server receive time |

Keys and indexes: `PRIMARY KEY (match_id)`, `INDEX (created_at DESC)`, `INDEX (room_code, created_at DESC)`.

## `match_player`

| Column | Type | Null | Default | Description |
|--------|------|------|---------|-------------|
| `match_id` | TEXT | no | — | FK → `match_record.match_id`, `ON DELETE CASCADE` |
| `account_id` | TEXT | no | — | FK → `account.account_id` |
| `slot` | INTEGER | no | — | 0–7, unique within the match |
| `team` | TEXT | no | — | `A` \| `B` |
| `result` | TEXT | no | — | `win` \| `loss` \| `abandon` |
| `damage_dealt` | INTEGER | no | `0` | Sum of damage caused to opponents, `>= 0` |
| `shots_fired` | INTEGER | no | `0` | `>= 0` |
| `hits` | INTEGER | no | `0` | `0 <= hits <= shots_fired` |
| `rating_before` | INTEGER | yes | NULL | `NULL` when unranked |
| `rating_after` | INTEGER | yes | NULL | `NULL` when unranked |

Keys and indexes: `PRIMARY KEY (match_id, account_id)`, `UNIQUE (match_id, slot)`,
`INDEX (account_id, match_id)` — "my match history" reads through this index.

A seat with no account (a guest) is not stored here, because `account_id` is the first half of the primary key;
`match_record.player_count` still counts the seat, so the two agree only for a match where every seat has an account.

## `rating_history`

| Column | Type | Null | Default | Description |
|--------|------|------|---------|-------------|
| `id` | TEXT | no | uuid | Primary key |
| `account_id` | TEXT | no | — | FK → `account.account_id` |
| `match_id` | TEXT | no | — | FK → `match_record.match_id` |
| `rating_before` | INTEGER | no | — | Copied from `profile.rating` at write time |
| `rating_after` | INTEGER | no | — | `rating_before + delta`, clamped to `[0, 4000]` |
| `delta` | INTEGER | no | — | The change actually applied, so `rating_before + delta = rating_after` always holds — a clamped match shows a smaller delta, not a contradiction |
| `created_at` | TEXT | no | — | Equals `match_record.created_at` |

Keys and indexes: `PRIMARY KEY (id)`, `UNIQUE (account_id, match_id)` (a match rates an account once),
`INDEX (account_id, created_at DESC)`.

## Rules the write path enforces

| Rule | Behaviour on violation |
|------|------------------------|
| `player_count` equals the number of seats in the submission | `422 validation_failed` |
| Submitter is a participant and was the host | `403 forbidden` |
| Every player row maps to an existing `account` | `422 validation_failed` |
| Slot uniqueness and slot ↔ team consistency | `422 validation_failed` |
| `duration_ms` within [60 s, 30 min] | `422 validation_failed` |
| `winner_team` consistent with `result` per player (winner team rows are `win`) | `422 validation_failed` |
| Same `room_code` + `started_at` not already recorded | `409 match_already_recorded` |
| `ranked = 1` needs a registered player on each side, no bot, no abandonment, the current ruleset | server forces `ranked = 0` and names the reason (`abandoned`, `ruleset_mismatch`, `guest`) |
| Rating maths | server-side only (`OQ-28`); client-sent `rating_*` fields are ignored |

Anti-cheat boundary: the server validates shape and plausibility only — a tampered host can still claim a false
outcome (`OQ-30`). Abuse is handled by report + manual review in v1.

## Rating maths (v1, `OQ-28`)

```
expected(teamA) = 1 / (1 + 10 ** ((avgRatingB - avgRatingA) / 400))
delta           = round(K * (score - expected))     # score 1 win, 0 loss
K               = 32 while rated_matches < 30, else 16
newRating       = clamp(rating + delta, 0, 4000)
```

`abandon` counts as a loss for the seat that forfeited a rated match and does not change teammates' deltas beyond the team
result. A fully abandoned match is unranked, so no row of it carries a delta at all (`matches.md` § `abandoned`).

## Oracle

| Contract | Checked by |
|----------|-----------|
| Schema matches this page | `apps/worker/tests/migrations.test.ts` (TC-FND-100) |
| One transaction: record + players + history | `apps/worker/tests/matches.test.ts` — a forced failure mid-write leaves zero rows (TC-RANK-110) |
| Validation table above | `apps/worker/tests/matches.test.ts` — one case per rule, asserting the status and problem type (TC-RANK-115) |
| Elo maths and clamping | `apps/worker/tests/elo.test.ts` and `packages/core/tests/rating.test.ts` — table-driven vectors incl. K-decay once `rated_matches` reaches 30 (TC-RANK-113, TC-RANK-114) |
| Clamp visible in the stored rows | `apps/worker/tests/matches.test.ts` — 3999 won stores `4000`/`1`, 3 lost stores `0`/`-3` (TC-RANK-160) |
| One rating per account per match | `apps/worker/tests/matches.test.ts` — the second `rating_history` row for a pair hits `UNIQUE (account_id, match_id)` (TC-RANK-161) |
| Unranked path writes no rating rows | `apps/worker/tests/matches.test.ts` (TC-RANK-116) |
| A guest seat is left out of the average and of both tables | `apps/worker/tests/matches.test.ts` — team B rated below team A, so a guest counted in the average would move a different number (TC-RANK-162) |
| Duplicate submission is idempotent by `room_code` + `started_at` | `apps/worker/tests/matches.test.ts` (TC-RANK-111) |
