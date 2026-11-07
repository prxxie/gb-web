---
id: US-RANK-001
title: Record a finished match exactly once and rank it
epic: EPIC-06-ranked
status: done
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
| AC2 | The same `roomCode` and same `startedAt` | The host retries the call | `409 match-already-recorded` with the existing `matchId`; no second row (`TC-RANK-111`, `TC-RANK-117`) |
| AC3 | A submitter who is not the host of that room, or a non-participant | The call is made | `403 forbidden`, nothing written (`TC-RANK-112`, `TC-RANK-118`) |
| AC4 | A payload whose `players` do not match the room's roster, or two winners, or `endedAt < startedAt` | It is submitted | `422 validation_failed` naming the field (`TC-RANK-115`) |
| AC5 | A guest, a bot or an abandoned match | It is submitted | The record is stored with `ranked = 0` and no `rating_history` rows; `match_player.rating_before/after` stay `NULL` (`TC-RANK-116`, `TC-RANK-119`) |
| AC6 | A `rulesetVersion` older than the current tunables | It is submitted | Stored, `ranked = 0`, reason `ruleset_mismatch` in the response (`TC-RANK-116`) |
| AC7 | Two matches submitted concurrently for the same room | Both arrive | Exactly one succeeds; the other gets `409` (unique constraint, not a read-then-write race, `TC-RANK-120`) |

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
  flagged in a log line for review (`OQ-30`, `TC-RANK-121`).
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

Red: `apps/worker/tests/matches.test.ts` — AC7's race, AC2's room-occurrence duplicate, AC3's host rule, AC5's
all-guest team and AC6's `rankedReason` had no case, and the plausibility line § 5 promises did not exist. The four
new cases went green against the shipped code (it already handled them); only the log line needed implementing, and
`TC-RANK-121` was red until it did.

`TC-RANK-110` (record + batch), `TC-RANK-111`/`TC-RANK-117` (duplicate by id / by room occurrence), `TC-RANK-112`/
`TC-RANK-118` (non-participant / non-host), `TC-RANK-115` (validation), `TC-RANK-116` (ruleset mismatch and
abandonment), `TC-RANK-119` (all-guest team), `TC-RANK-120` (two concurrent submissions), `TC-RANK-121` (implausible
damage). The concurrency case issues two `rig.request` calls in one `Promise.all`; the fake DB serialises them, so what
it proves is the outcome — one `201`, one `409`, one row — while the index itself is asserted by the migration test.

## 9. Open questions

- **OQ-30** (accepted assumption) — a tampered host is detected only by plausibility logging plus manual review; no
  server-side verification of the simulation exists in v1.

<!-- delivery:2026-11-07 -->

## Delivery status — 2026-11-07

**done.**

| Criterion | Evidence |
|-----------|----------|
| AC1 | `TC-RANK-110` (`apps/worker/tests/matches.test.ts`): one 201, one record, four `match_player` rows, four `rating_history` rows written by a single `env.GBW_DB.batch()` |
| AC2 | `TC-RANK-111` (same `matchId`, and the `Idempotency-Key` replay) and `TC-RANK-117` (same room + start time under a new id — the body names the stored match) |
| AC3 | `TC-RANK-112` (non-participant → `403 forbidden`) and `TC-RANK-118` (a real room whose host is someone else → `403 not-host`, nothing written, while the host's own call lands) |
| AC4 | `TC-RANK-115` — eight refusals, each naming its field |
| AC5 | `TC-RANK-116` (abandoned) and `TC-RANK-119` (a team with no account: `ranked_reason: "guest"`, NULL ratings, no history) |
| AC6 | `TC-RANK-116`: `rankedReason: "ruleset_mismatch"` on the wire and in `match_record.ranked_reason` |
| AC7 | `TC-RANK-120`: two concurrent submissions leave one `201`, one `409` and one row |

**What this pass actually changed.** The route was already implemented on 2026-11-05; five of its seven criteria had
no case, and the plausibility line § 5 promises did not exist at all. `apps/worker/src/routes/matches.ts` now logs one
`implausible_stats` warn line after a successful write when a player's `damageDealt` exceeds
`IMPLAUSIBLE_DAMAGE_PER_SHOT` (100) × `shotsFired` (`TC-RANK-121`); the line carries the room, the account and the
slots, never the payload.

**Recorded, not changed.** AC3's rule reads the host from the room's own `POST …/state`; a room that cannot name a
signed-in host (an object nobody joined, an unreachable object, or a guest host) falls back to the participant rule, so
the refusal is only as strong as the object's answer. AC7's uniqueness lives in `idx_match_unique` and the route
pre-checks it before writing, then maps a batch failure back to `409` — the pre-check is a courtesy, the index is the
guarantee.
