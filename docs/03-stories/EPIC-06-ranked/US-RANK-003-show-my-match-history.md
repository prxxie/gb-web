---
id: US-RANK-003
title: Show my match history
epic: EPIC-06-ranked
status: ready
priority: P2
size: S
depends_on: [US-RANK-001, US-AUTH-002]
open_questions: []
accepted_assumptions: []
refs: [02-reference/api/matches.md, 02-reference/screens/profile.md, 01-overview/nonfunctional-requirements.md]
---

# US-RANK-003 — Show my match history

## 1. Story

**As a** registered player
**I want** my last matches with the outcome and the rating change
**so that** I can see whether the last session moved me up.

## 2. Context

`GET /me/matches` is a cursor-paginated read of `match_player` joined to `match_record`, newest first, limited to the
caller's own rows. It is the only screen where a rating change is shown per match outside the result screen.

| Topic | Reference |
|-------|-----------|
| `GET /me/matches` | [api/matches.md](../../02-reference/api/matches.md) |
| Profile screen history section | [screens/profile.md](../../02-reference/screens/profile.md) |
| NFR-13 no other player's PII | [nonfunctional-requirements.md](../../01-overview/nonfunctional-requirements.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A player with 30 matches | `GET /api/v1/me/matches?limit=20` | `200` with 20 items newest first, `next_cursor` and `has_more: true` (`TC-RANK-141`) |
| AC2 | The same request with the returned cursor | It is sent | The next page contains the following 20 matches with no duplicates and no gaps |
| AC3 | A match the player lost | It is rendered | Win/loss, duration, team size, damage and the rating delta (or `—` when unranked) are shown |
| AC4 | An unranked match | It is rendered | No rating numbers appear, only the reason (`guest`, `bot`, `abandoned`, `ruleset_mismatch`) |
| AC5 | Any request | The response is inspected | It contains no other player's `accountId`, name or rating; only aggregate counts |
| AC6 | A request for another account's history | `?accountId=` is supplied | The parameter is ignored; the response is always the caller's own history |

## 4. Contract

`GET /api/v1/me/matches?limit=20&cursor=<opaque>` (Clerk JWT) → `200`:

| Field | Type | Notes |
|-------|------|-------|
| `items` | array | `{matchId, roomCode, endedAt, result, winnerTeam, playerCount, damageDealt, shotsFired, hits, ranked, rankedReason, ratingBefore, ratingAfter, delta}` |
| `next_cursor` | string \| null | Opaque base64 of `(ended_at, match_id)` |
| `has_more` | boolean | — |

`limit` 1–100, default 20. Cursor is keyset, not offset.

## 5. Rules and edge cases

- The cursor is opaque and signed; a tampered cursor yields `400 bad-request`, not a 500.
- An empty history returns `items: []`, `next_cursor: null`, `has_more: false` — never 404.
- A deleted account keeps its rows with an anonymised name; the player's own history is unaffected while signed in.
- The query uses the `(account_id, ended_at DESC)` index; no full scan of `match_record`.
- History is capped at 200 rows in the UI (10 pages); older pages are not fetchable in v1.

## 6. Implementation notes

- `apps/worker/src/routes/me.ts` (`GET /me/matches`); keyset predicate `(ended_at, match_id) < (?, ?)`.
- `apps/web/src/routes/profile/history.tsx` with a `Tải thêm` button that appends; no infinite scroll.

## 7. Out of scope

- Replays or per-turn detail of a past match.
- Deleting a single match from the history.

## 8. Test notes

`TC-RANK-141` (worker: pagination without duplicates over 3 pages; web: renders 20 rows and appends 10 more).

## 9. Open questions

None.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**in-progress.** history with keyset pagination is implemented; needs D1 plus a signed-in account.
