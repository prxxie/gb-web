---
id: US-RANK-001
title: Record a finished match exactly once and rank it
epic: EPIC-06-ranked
status: ready
priority: P1
size: M
depends_on: [US-CORE-003, US-ROOM-005, US-AUTH-002]
open_questions: []
accepted_assumptions: [OQ-30]
refs: [02-reference/api/matches.md, 02-reference/data/matches.md, 01-overview/workflow-state-machine.md]
---

# US-RANK-001 — Record a finished match exactly once and rank it

## 1. Story

**As a** registered player
**I want** my finished match stored once with the right outcome
**so that** my rating and history reflect what actually happened.

## 2. Context

The host submits the result; the worker validates that the submitter is the host of that room, that every player is a
real participant, and that the match is not already recorded. Three tables are written in one transaction, and the
rating is computed server-side only.

| Topic | Reference |
|-------|-----------|
| `POST /matches` request and responses | [api/matches.md](../../02-reference/api/matches.md) |
| `match_record`, `match_player` columns | [data/matches.md](../../02-reference/data/matches.md) |
| `playing → ended` transition | [workflow-state-machine.md](../../01-overview/workflow-state-machine.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A host of a finished match | `POST /api/v1/matches` with the result payload | `201` and exactly one `match_record` with its `match_player` rows, in one transaction (`TC-RANK-110`) |
| AC2 | The same `roomCode` and same `startedAt` | The host retries the call | `409 match-already-recorded` with the existing `matchId`; no second row (`TC-RANK-111`) |
| AC3 | A submitter who is not the host of that room, or a non-participant | The call is made | `403 forbidden`, nothing written (`TC-RANK-112`) |
| AC4 | A payload whose `players` do not match the room's roster, or two winners, or `endedAt < startedAt` | It is submitted | `422 validation_failed` naming the field (`TC-RANK-115`) |
| AC5 | A guest, a bot or an abandoned match | It is submitted | The record is stored with `ranked = 0` and no `rating_history` rows; `match_player.rating_before/after` stay `NULL` (`TC-RANK-116`) |
| AC6 | A `rulesetVersion` older than the current tunables | It is submitted | Stored, `ranked = 0`, reason `ruleset_mismatch` in the response |
| AC7 | Two matches submitted concurrently for the same room | Both arrive | Exactly one succeeds; the other gets `409` (unique constraint, not a read-then-write race) |

## 4. Contract

`POST /api/v1/matches` (Clerk JWT) body:

| Field | Type | Validation |
|-------|------|-----------|
| `roomCode` | string | 6 chars, room must exist and be `playing`/`ended` |
| `startedAt`, `endedAt` | string | ISO-8601, `endedAt > startedAt`, duration clamped [60 s, 30 min] |
| `winnerTeam` | `"A"\|"B"` | Must be a team present in the roster |
| `rulesetVersion` | string | Must equal the deployed version to be ranked |
| `players` | array | `{slot, team, accountId|null, guestId|null, result, damageDealt, shotsFired, hits}` |

Response `201`: `{matchId, ranked, rankedReason, ratings: [{accountId, before, after, delta}]}`.

Uniqueness: `CREATE UNIQUE INDEX idx_match_unique ON match_record(room_code, started_at)`.

## 5. Rules and edge cases

- Every rating change is paired with a `rating_history` row carrying before, after and delta, so a leaderboard can be audited back to the match (`NFR-14`).
- The worker never trusts a client-computed rating; `rating_before` is read inside the transaction.
- A match with any `accountId` that does not exist is rejected (`422`), not silently downgraded to unranked.
- `damageDealt`, `shotsFired` and `hits` are integers ≥ 0; implausible values (damage > 100 × shots) are accepted but
  flagged in a log line for review (`OQ-30`).
- No PII in the payload: a display name is not needed to record a match.
- The DO publishes `match_recorded {matchId, ranked}` to the room after the write succeeds.

## 6. Implementation notes

- `apps/worker/src/routes/matches.ts`; one `env.DB.batch([...])` or `withTransaction` helper for the three tables.
- Duplicate detection is the unique index, mapped from SQLITE_CONSTRAINT to `409`.
- Idempotency-Key is accepted for 24 h as a second guard (`api/README.md`).

## 7. Out of scope

- Elo itself — [US-RANK-002](US-RANK-002-rate-players-with-elo.md).
- History and leaderboard reads — [US-RANK-003](US-RANK-003-show-my-match-history.md), [US-RANK-004](US-RANK-004-climb-the-leaderboard.md).

## 8. Test notes

`TC-RANK-110`, `TC-RANK-111`, `TC-RANK-112`, `TC-RANK-115`, `TC-RANK-116`. Worker tests with miniflare D1; the
concurrency test fires two `SELF.fetch` calls with `Promise.all`. Red first:
`apps/worker/tests/matches.test.ts::duplicate_submission_conflicts`.

## 9. Open questions

- **OQ-30** (accepted assumption) — a tampered host is detected only by plausibility logging plus manual review; no
  server-side verification of the simulation exists in v1.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**in-progress.** `POST /matches`, the idempotency key and the single `db.batch()` write are implemented; needs a migrated D1 database.
