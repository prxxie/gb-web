---
id: US-RANK-003
title: Show my match history
epic: EPIC-06-ranked
status: done
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
| AC2 | The same request with the returned cursor | It is sent | The next page contains the following matches with no duplicates and no gaps, and the last page says `has_more: false` (`TC-RANK-142`) |
| AC3 | A match the player lost | It is rendered | Win/loss, team size, damage and the rating delta (or `—` when unranked) are shown (`TC-RANK-143`, `TC-RANK-152`) |
| AC4 | An unranked match | It is rendered | No rating numbers appear, only the reason (`guest`, `bot`, `abandoned`, `ruleset_mismatch`) (`TC-RANK-148`, `TC-RANK-152`) |
| AC5 | Any request | The response is inspected | It contains no other player's `accountId` and no other player's rating anywhere in the body; opponents appear as a display name and a team, which is what the match already showed on screen (`TC-RANK-149`) |
| AC6 | A request for another account's history | `?accountId=` is supplied | The parameter is ignored; the response is always the caller's own history (`TC-RANK-150`) |

## 4. Contract

`GET /api/v1/me/matches?limit=20&cursor=<opaque>` (Clerk JWT) → `200`:

This section is the story's summary of the contract; `docs/02-reference/api/matches.md` § GET /me/matches is the
normative table and the two must agree field for field.

| Field | Type | Notes |
|-------|------|-------|
| `items` | array | `{matchId, playedAt, team, result, playerCount, opponents[{displayName, team}], damageDealt, shotsFired, hits, ratingDelta, ranked, rankedReason, rulesetVersion}` |
| `next_cursor` | string \| null | Opaque base64url of `(ended_at, match_id)` **plus** an HMAC-SHA-256 signature over that payload |
| `has_more` | boolean | — |

`limit` 1–100, default 20. Cursor is keyset, not offset. The response carries the caller's own row only: no other
account id and no other player's rating (`AC5`).

## 5. Rules and edge cases

- The cursor is opaque and signed with HMAC-SHA-256 over the encoded `(ended_at, match_id)` payload, using
  `SESSION_TOKEN_SECRET`; a tampered or unsigned cursor yields `400 bad-request`, not a page and not a 500
  (`TC-RANK-151`).
- An empty history returns `items: []`, `next_cursor: null`, `has_more: false` — never 404.
- A deleted account keeps its rows with an anonymised name; the player's own history is unaffected while signed in.
- The query uses the `(account_id, ended_at DESC)` index through `findHistoryPage`; no full scan of
  `match_record`.
- History is capped at 200 rows in the UI (10 pages); older pages are not fetchable in v1.

## 6. Implementation notes

- `apps/worker/src/routes/matches.ts` `myMatches` (the route is `/me/matches`, the handler lives with the submission);
  keyset predicate `(m.ended_at < ? OR (m.ended_at = ? AND m.match_id < ?))` in `apps/worker/src/lib/db.ts`
  `findHistoryPage`, with the opponents fetched in chunks of 50 (`findOpponents`).
- `apps/web/src/routes/ProfilePage.tsx` renders the history section inline (there is no `profile/history.tsx`): one row
  per item and a `Tải thêm` button that appends; no infinite scroll.

## 7. Out of scope

- Replays or per-turn detail of a past match.
- Deleting a single match from the history.

## 8. Test notes

Red: `apps/worker/tests/history.test.ts` and `apps/web/tests/profile.test.tsx` — 20 of 30 matches, the second page's
continuation, the unranked row, the "no other account id" sweep and the forged cursor had no case, and the client's
`HistoryItem` interface named fields the server never sends (`endedAt`, `opponentTeam`, `ratingBefore`), so every row
rendered `Invalid Date`.

`TC-RANK-141` (first page of 30), `TC-RANK-142` (cursor continuation), `TC-RANK-143` (worker row), `TC-RANK-148`
(unranked), `TC-RANK-149` (no other account id or rating in the body), `TC-RANK-150` (`?accountId=` ignored),
`TC-RANK-151` (forged cursor → 400), `TC-RANK-152` (the rendered row, web).

## 9. Open questions

None.

<!-- delivery:2026-11-07 -->

## Delivery status — 2026-11-07

**done.**

| Criterion | Evidence |
|-----------|----------|
| AC1 | `TC-RANK-141` — 30 recorded matches, `?limit=20` answers 20 newest first with `has_more: true` |
| AC2 | `TC-RANK-142` — the cursor's page holds the other 10, in order, with no repeat and no gap |
| AC3 | `TC-RANK-143` (the item: `result`, `playerCount`, own damage, negative `ratingDelta`) and `TC-RANK-152` (the rendered row: `Thắng`, `2v2`, opponents, `240 dmg`, `+16`) |
| AC4 | `TC-RANK-148` (`ranked: false`, reason, `ratingDelta: null`) and `TC-RANK-152` (the row prints `—` and the reason) |
| AC5 | `TC-RANK-149` — the whole body carries no other account id and no other rating; `opponents[]` is exactly `{displayName, team}` |
| AC6 | `TC-RANK-150` — `?accountId=` is ignored and the caller reads their own row |
| § 5 | `TC-RANK-151` — a cursor the server did not mint is `400 bad-request` |

**What this pass changed.** `playerCount`, `ranked` and `rankedReason` were selected by `findHistoryPage` and then
dropped on the way out, so the row could print neither `2v2` nor why nothing moved; they now ride the item. The cursor
was unsigned base64 — the page marker is now HMAC-SHA-256 signed with `SESSION_TOKEN_SECRET`, and an unsigned one is
`400`. On the client, `HistoryItem` described a shape the server never sent (`endedAt`, `opponentTeam`, `ratingBefore`,
`ratingAfter`), which is why the date column read `Invalid Date` and the result column printed the raw enum; the
interface, the row and the copy keys are now the wire's.

**Amended, on the owner's decision.** AC5 forbade "another player's name"; `api/matches.md` and `screens/profile.md`
both document `opponents: {displayName, team}`, which is what the match itself already showed on screen. AC5 now reads
"no other player's `accountId` and no other player's rating"; the display name stays, and `TC-RANK-149` sweeps the whole
body for the identifiers.

**Not changed.** The screen's own cap of 200 rows (10 pages) is not enforced anywhere yet: `Tải thêm` keeps following
the cursor. Left as written rather than inventing a limit the server does not have.
