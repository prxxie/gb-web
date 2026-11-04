# Data — accounts

Two tables: identity (`account`) and public profile (`profile`). They are split so the leaderboard and profile reads
never touch the identity columns ([ADR-0003](../../04-decisions/adr/ADR-0003-data-d1.md)).

## `account`

| Column | Type | Null | Default | Description |
|--------|------|------|---------|-------------|
| `account_id` | TEXT | no | uuid | Primary key; the id every other table refers to |
| `clerk_user_id` | TEXT | no | — | Clerk `sub`; unique; the join to the identity provider |
| `status` | TEXT | no | `'active'` | `active` \| `deleted` (glossary status values) |
| `created_at` | TEXT | no | — | First authenticated request |
| `last_seen_at` | TEXT | no | — | Updated at most once per hour per account |

Keys and indexes: `PRIMARY KEY (account_id)`, `UNIQUE (clerk_user_id)`, `INDEX (status, last_seen_at)`.

Retention: purged 30 days after `status` becomes `deleted` (`NFR-13`, `NFR-15`).

## `profile`

| Column | Type | Null | Default | Description |
|--------|------|------|---------|-------------|
| `account_id` | TEXT | no | — | PK, FK → `account.account_id`, `ON DELETE CASCADE` |
| `display_name` | TEXT | no | — | 2–16 characters after trim; the form shown in game |
| `display_name_key` | TEXT | no | — | Lower-cased, diacritics-stripped name; unique; the uniqueness key |
| `avatar_id` | TEXT | no | `'default'` | One of the fixed avatar set; no uploads |
| `rating` | INTEGER | no | `1200` | Elo score; only the match pipeline writes it |
| `rated_matches` | INTEGER | no | `0` | Count of rated matches played (K-factor decay, `OQ-28`) |
| `updated_at` | TEXT | no | — | Last profile or rating write |

Keys and indexes: `PRIMARY KEY (account_id)`, `UNIQUE (display_name_key)`,
`INDEX (rating DESC, rated_matches DESC, account_id)` — the leaderboard index.

Validation enforced by `CHECK` constraints (mirrored in the Worker schema):

| Constraint | Rule | Error code |
|------------|------|-----------|
| `display_name` length | `length(trim(display_name)) BETWEEN 2 AND 16` | `validation_failed` |
| `avatar_id` | membership in the avatar allowlist table | `validation_failed` |
| `rating` | `rating BETWEEN 0 AND 4000` | — (server-only) |
| `rated_matches` | `>= 0` | — (server-only) |

## Name uniqueness and safety

`display_name_key` is the uniqueness key so `Nguyễn` and `nguyen` collide. The Worker normalises
(NFC → strip diacritics → lower-case → collapse whitespace) before comparing, and rejects reserved names and the vi/en
profanity lists (`OQ-29`). A collision returns `409 conflict` with problem type `.../display-name-taken`.

## Relations

- `account` 1—1 `profile` (created in the same transaction as the first sign-in request).
- `account` 1—N `match_player`, `rating_history`.
- Deleting an account cascades to `profile`; `match_player` rows keep the `account_id` (rating history stays coherent) and
  the retention job removes them with the account.

## Oracle

| Contract | Checked by |
|----------|-----------|
| Schema matches this table | `tests/worker/migrations.test.ts` — applies all migrations to an empty D1 and compares `PRAGMA table_info` with the column list above (TC-FND-100) |
| Sign-in creates exactly one account + profile | `tests/worker/auth.test.ts` — two requests with the same `sub` produce one row each (TC-AUTH-074) |
| `display_name_key` uniqueness | `tests/worker/profile.test.ts` — `Nguyễn` then `nguyen` → `409` (TC-AUTH-101) |
| `rating` is never client-written | `tests/worker/profile.test.ts` — a `PATCH /me` body containing `rating` is rejected or ignored, response rating unchanged (TC-AUTH-102) |
| Leaderboard ordering and deleted-account exclusion | `tests/worker/leaderboard.test.ts` (TC-RANK-104) |
