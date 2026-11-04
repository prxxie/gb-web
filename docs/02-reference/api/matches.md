# API — matches and leaderboard

The host submits the finished match; the Worker validates it, computes the rating and writes three tables in one D1
batch ([data/matches.md](../data/matches.md)).

## POST /matches

Auth: Clerk JWT. Rate limit: 20/min per account. Idempotent by `Idempotency-Key` for 24 h.

Request body:

| Field | Type | Required | Rule |
|-------|------|----------|------|
| `roomCode` | string | yes | `^[A-HJ-NP-Z2-9]{6}$` |
| `startedAt` / `endedAt` | string | yes | ISO-8601 UTC; `duration` clamped to [60 s, 30 min] |
| `rulesetVersion` | string | yes | Must equal the server's current tunables version, else the match is recorded **unranked** |
| `winnerTeam` | enum | yes | `A` \| `B` |
| `players` | array | yes | 2–8 entries, one per participant |
| `players[].slot` | integer | yes | 0–7, unique |
| `players[].team` | enum | yes | `A` \| `B`, equal sizes |
| `players[].accountId` | string \| null | yes | `null` for a guest or a bot |
| `players[].displayName` | string | yes | For the record's readability; the server does not trust it for identity |
| `players[].damageDealt` / `.shotsFired` / `.hits` | integer | yes | `0 ≤ hits ≤ shotsFired`; damage `≥ 0` |
| `players[].forfeited` | boolean | no | `true` marks `result = 'abandon'` |

```json
{
  "roomCode": "K7M2QX",
  "startedAt": "2026-11-04T09:15:00Z",
  "endedAt": "2026-11-04T09:21:12Z",
  "rulesetVersion": "2026-11-01",
  "winnerTeam": "A",
  "players": [
    { "slot": 0, "team": "A", "accountId": "1f2e…", "displayName": "Bao", "damageDealt": 240, "shotsFired": 9, "hits": 6 },
    { "slot": 1, "team": "B", "accountId": "9a8b…", "displayName": "Linh", "damageDealt": 130, "shotsFired": 8, "hits": 3 }
  ]
}
```

Response `201`:

| Field | Type | Meaning |
|-------|------|---------|
| `matchId` | string | Server-minted |
| `ranked` | boolean | `false` when any participant is a guest/bot or the ruleset is stale |
| `ratings` | array | `{ accountId, before, after, delta }` per registered participant; empty when unranked |

Errors: `403 forbidden` (submitter is not a participant or was not the host), `422 validation` (any rule above),
`409 match-already-recorded`, `401`, `429`.

## GET /me/matches

Auth: Clerk JWT. Query: `limit` (default 20, max 100), `cursor`.

Response `200`: `{ items[], next_cursor, has_more }` where each item is

| Field | Type | Meaning |
|-------|------|---------|
| `matchId` | string | — |
| `playedAt` | string | `match_record.ended_at` |
| `team` / `result` | enum | `A`/`B`, `win`/`loss`/`abandon` |
| `opponents` | array | `{ displayName, team }`, no account ids |
| `damageDealt` / `shotsFired` / `hits` | integer | Own row |
| `ratingDelta` | integer \| null | `null` for unranked |
| `rulesetVersion` | string | — |

Ordered by `ended_at DESC, match_id DESC`; the cursor encodes `(ended_at, match_id)`.

## GET /leaderboard

Public, no auth. Query: `limit` (default 20, max 100), `cursor`.

Response `200`: `{ items[], next_cursor, has_more }`, each item

| Field | Type | Meaning |
|-------|------|---------|
| `rank` | integer | 1-based, dense within the page (cursor pages continue the count) |
| `displayName` | string | — |
| `avatarId` | string | — |
| `rating` | integer | — |
| `ratedMatches` | integer | Lets the UI label low-sample players |

Ordered by `rating DESC, rated_matches DESC, account_id ASC`; only `account.status = 'active'` and
`rated_matches > 0` are listed. `Cache-Control: public, max-age=30` (`NFR-05` headroom).

## Oracle

| Contract | Checked by |
|----------|-----------|
| Request validation table (one case per row) | `tests/worker/matches.test.ts` (TC-RANK-115) |
| Rating maths, K-decay, clamping | `tests/core/rating.test.ts` (TC-RANK-113) |
| Transaction atomicity | `tests/worker/matches.test.ts` (TC-RANK-110) |
| Unranked paths (guest, bot, stale ruleset) | `tests/worker/matches.test.ts` (TC-RANK-116) |
| Idempotency and duplicate detection | `tests/worker/matches.test.ts` (TC-RANK-111) |
| History ordering and cursor stability under inserts | `tests/worker/history.test.ts` (TC-RANK-141) |
| Leaderboard ordering, exclusions, cache header | `tests/worker/leaderboard.test.ts` (TC-RANK-104) |
