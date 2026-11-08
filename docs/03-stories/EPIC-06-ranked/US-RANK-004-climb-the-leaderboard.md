---
id: US-RANK-004
title: Show the leaderboard with the caller's own row
epic: EPIC-06-ranked
status: done
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
| AC1 | 150 rated players | `GET /api/v1/leaderboard?limit=100` | `200` with 100 items ordered by `rating DESC, rated_matches DESC, account_id ASC` (`TC-RANK-104`) |
| AC2 | Two players with equal rating and equal `rated_matches` | The list is requested | The order is stable across requests and deployments |
| AC3 | A signed-in player ranked 42nd | The leaderboard screen loads | Their row is highlighted and a sticky footer shows `#42` even though it is outside the first page (`TC-RANK-144`) |
| AC4 | A player with fewer than 10 rated matches in the top 100 | The list renders | Their row carries the `Mới` badge (`TC-RANK-145`) |
| AC5 | A display name containing `<b>` or an emoji sequence | It is rendered | It is shown as literal escaped text, truncated at 16 characters with an ellipsis (`TC-RANK-146`) |
| AC6 | Two anonymous requests within 30 s | The second is made | It is served with `Cache-Control: public, max-age=30` and returns identical content; a request carrying a session is `private, no-store` instead, so neither a shared cache nor the browser can return one reader's `you` to another (`TC-RANK-163`) |
| AC7 | A signed-out visitor | The screen loads | The list renders, the own-row footer is absent, and no request to `/me` is made  (`TC-RANK-147`) |

## 4. Contract

`GET /api/v1/leaderboard?limit=20&cursor=<token>` (no auth) → `200`:

| Field | Type | Notes |
|-------|------|-------|
| `items` | array | `{rank, displayName, avatarId, rating, ratedMatches}`; `rank` is positional across pages |
| `next_cursor` | string \| null | opaque offset token; `null` on the last page |
| `has_more` | boolean | `true` exactly when `next_cursor` is not `null` |
| `you` | object \| null | `{rank, rating}` when a Clerk JWT is present; `null` for a guest, a stale token, or an account with no rated match |
| `request_id` | string | per-request correlation id (the same field every route returns) |

`limit` 1–100, default 20 (`api/matches.md`). `Cache-Control` is `public, max-age=30` for an anonymous read and
`private, no-store` when a session accompanied the request, both with `Vary: authorization, x-session-token`; a
cursor that does not decode is `422` (`type: validation`), never a `500`.

## 5. Rules and edge cases

- An account with `status != 'active'` never appears.
- `rank` is positional and may change between requests — it is not stored.
- The own-row rank uses the same ordering; a `COUNT(*)` over the index is acceptable at the target scale (`OQ-33`).
- Display names are unique by `display_name_key`, so no dedup is needed in the list.
- A page is `LIMIT/OFFSET`, so a rating change between two requests can repeat a rank; the screen drops a repeated
  rank when it appends a page rather than tinting two rows as the caller's.
- The response never contains an `accountId`.
- The screen shows the own-row footer only while the caller's row is outside the pages it has fetched; when the row
  is on screen it is tinted and the footer is absent.
- A long name is clipped in graphemes, so a ZWJ emoji sequence is never cut in half.

## 6. Implementation notes

- `apps/worker/src/routes/leaderboard.ts`; query hits `idx_leaderboard` from `data/accounts.md`.
- Cache header set on the response; the screen sends no cache-busting parameter, so a second visit within 30 s is
  answered from the browser cache by design.
- `you` is computed only when the JWT is valid, names an `active` account and that account has a rated match; an
  expired or forged JWT degrades to `null` rather than `401`.

## 7. Out of scope

- Friends leaderboards, per-mode ladders, seasons.
- Reporting an offensive display name (`OQ-29`).

## 8. Test notes

Red: `apps/web/tests/leaderboard.test.tsx` — the page printed the API's name untruncated, had no `Mới` badge and no footer
(markup was escaped already, because React escapes), and `LeaderboardEntry` declared `accountId` and `isNew`, neither of
which `/leaderboard` sends. `TC-RANK-144`, `TC-RANK-145` and `TC-RANK-146` failed first; the server cases
(`TC-RANK-104`, `TC-RANK-144`) went green against the shipped query, which already ordered and ranked correctly.

`TC-RANK-104` (ordering, tie-break, the top-100 cap), `TC-RANK-144` (own row outside the page, rank 42 of 50),
`TC-RANK-145` (badge at 9 against 10), `TC-RANK-146` (escaping and the 16-grapheme clip), `TC-RANK-147` (signed out:
no footer, no `/me`). 150 accounts seeded in the in-memory D1 harness (`apps/worker/tests/support/fake-env.ts`);
`tests/e2e/leaderboard.spec.ts` serves the list from a route double so the screen can be asked for a caller at rank 42
without seeding ninety more accounts. The screen's own suite covers the append path: a repeated rank is printed once,
a later page that answers `you: null` clears the footer, a failed read states the failure and retries the first page.

## 9. Open questions

- **OQ-29** (accepted assumption) — no report button and no name filter in v1; an offensive name is handled by support
  through the provider dashboard. Adding a report flow changes this story and `US-AUTH-003`.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-08

**done.** The screen reads `you` from the one list response (no `GET /me`), tints the caller's row or sticks `#42` to
the bottom when it is outside the fetched pages, badges a name under ten rated matches and clips it in graphemes.
§ 4 was reconciled with `api/matches.md`: cursor pagination at a default `limit=20`, not a single page of 100.
