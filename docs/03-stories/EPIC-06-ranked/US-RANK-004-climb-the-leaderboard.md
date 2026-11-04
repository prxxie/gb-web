---
id: US-RANK-004
title: Show the leaderboard with the caller's own row
epic: EPIC-06-ranked
status: ready
priority: P2
size: M
depends_on: [US-RANK-002]
open_questions: []
accepted_assumptions: [OQ-29]
refs: [02-reference/api/matches.md, 02-reference/screens/leaderboard.md, 02-reference/data/accounts.md]
---

# US-RANK-004 — Show the leaderboard with the caller's own row

## 1. Story

**As a** competitive player
**I want** to see the top players and where I stand
**so that** the rating has a visible ladder behind it.

## 2. Context

A public read of the top 100 by rating with a stable tie-break, cached for 30 seconds, plus the caller's own position
when signed in. Only `display_name`, `avatar_id`, `rating` and `rated_matches` are public.

| Topic | Reference |
|-------|-----------|
| `GET /leaderboard` | [api/matches.md](../../02-reference/api/matches.md) |
| Leaderboard screen | [screens/leaderboard.md](../../02-reference/screens/leaderboard.md) |
| Leaderboard index | [data/accounts.md](../../02-reference/data/accounts.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | 150 rated players | `GET /api/v1/leaderboard` | `200` with the top 100 ordered by `rating DESC, rated_matches DESC, account_id ASC` (`TC-RANK-104`) |
| AC2 | Two players with equal rating and equal `rated_matches` | The list is requested | The order is stable across requests and deployments |
| AC3 | A signed-in player ranked 42nd | The leaderboard screen loads | Their row is highlighted and a sticky footer shows `#42` even though it is outside the first page (`TC-RANK-144`) |
| AC4 | A player with fewer than 10 rated matches in the top 100 | The list renders | Their row carries the `Mới` badge (`TC-RANK-145`) |
| AC5 | A display name containing `<b>` or an emoji sequence | It is rendered | It is shown as literal escaped text, truncated at 16 characters with an ellipsis (`TC-RANK-146`) |
| AC6 | Two requests within 30 s | The second is made | It is served with `Cache-Control: public, max-age=30` and returns identical content |
| AC7 | A signed-out visitor | The screen loads | The list renders, the own-row footer is absent, and no request to `/me` is made  (`TC-RANK-147`) |

## 4. Contract

`GET /api/v1/leaderboard?limit=100` (no auth) → `200`:

| Field | Type | Notes |
|-------|------|-------|
| `items` | array | `{rank, displayName, avatarId, rating, ratedMatches}` |
| `generatedAt` | string | ISO-8601, when the query ran |
| `you` | object \| null | `{rank, rating}` when a Clerk JWT is present |

`limit` 1–100, default 100. No cursor: the leaderboard is one page in v1.

## 5. Rules and edge cases

- An account with `status != 'active'` never appears.
- `rank` is positional and may change between requests — it is not stored.
- The own-row rank uses the same ordering; a `COUNT(*)` over the index is acceptable at the target scale (`OQ-33`).
- Display names are unique by `display_name_key`, so no dedup is needed in the list.
- The response never contains an `accountId`.

## 6. Implementation notes

- `apps/worker/src/routes/leaderboard.ts`; query hits `idx_leaderboard` from `data/accounts.md`.
- Cache header set on the response; the client revalidates on window focus.
- `you` is computed only when the JWT is valid; a stale JWT degrades to `null` rather than `401`.

## 7. Out of scope

- Friends leaderboards, per-mode ladders, seasons.
- Reporting an offensive display name (`OQ-29`).

## 8. Test notes

`TC-RANK-104` (ordering and tie-break), `TC-RANK-144` (own row outside the page), `TC-RANK-145` (badge),
`TC-RANK-146` (escaping). 150 accounts seeded in miniflare D1.

## 9. Open questions

- **OQ-29** (accepted assumption) — no report button and no name filter in v1; an offensive name is handled by support
  through the provider dashboard. Adding a report flow changes this story and `US-AUTH-003`.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**in-progress.** the leaderboard query, ordering and 30-second cache are implemented; needs D1 with seeded ratings.
