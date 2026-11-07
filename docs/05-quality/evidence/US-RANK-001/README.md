# US-RANK-001 — record a finished match exactly once

Worker-only story: everything here is asserted by `apps/worker/tests/matches.test.ts` against the real router and a
real `Room` object (`apps/worker/tests/support/fake-env.ts`), not by a browser.

## Automated, 2026-11-07

| Criterion | Case | What it asserts |
|-----------|------|-----------------|
| AC1 | `TC-RANK-110` | one `201`; a single `env.GBW_DB.batch()` writes `match_record` + four `match_player` rows + four `rating_history` rows; `ratings[]` is exactly `{accountId, before, after, delta}` |
| AC2 | `TC-RANK-111` | the same `matchId` is refused `409` with no second row; the same `Idempotency-Key` replays the first `201` |
| AC2 | `TC-RANK-117` | the same `roomCode` + `startedAt` under a **new** `matchId` is refused `409`, and the error names the match already stored |
| AC3 | `TC-RANK-112` | a submitter who is not a participant gets `403 forbidden` |
| AC3 | `TC-RANK-118` | a real room: the host mints it, a peer takes the second seat, the peer's submission is `403 not-host` and writes nothing |
| AC4 | `TC-RANK-115` | eight refusals, each naming its field: short duration, one player, uneven teams, `hits > shotsFired`, duplicated slot, `winnerTeam` outside `A`/`B`, a guest token |
| AC5 | `TC-RANK-119` | a team with no account: `ranked: false`, `rankedReason: "guest"`, `ratings: []`, `ranked_reason` stored, NULL `rating_before`/`rating_after`, no history |
| AC5 | `TC-RANK-116` | an abandoned match: every `match_player.result` is `abandon`, `rankedReason: "abandoned"`, no history |
| AC6 | `TC-RANK-116` | a stale `rulesetVersion`: `rankedReason: "ruleset_mismatch"` on the wire and in the column |
| AC7 | `TC-RANK-120` | two concurrent submissions: one `201`, one `409`, one `match_record`, four `rating_history` rows |
| § 5 | `TC-RANK-121` | `damageDealt` above `100 × shotsFired` is stored as sent, and exactly one `implausible_stats` warn line names the slots and the room |

Run: `pnpm vitest run apps/worker/tests/matches.test.ts` (23 cases).

## What was broken

The route existed since 2026-11-05, but five of its seven criteria had no case at all, and the plausibility line § 5
promises did not exist. The four new criteria cases went green against the shipped code — the route already handled
them — so the only code this story added is the log line, red until `TC-RANK-121` was written.

## Not covered here (and why)

- **The unique index itself.** `idx_match_unique (room_code, started_at)` lives in `apps/worker/migrations/0001_init.sql`
  and is asserted by `apps/worker/tests/migrations.test.ts`. The fake DB serialises `db.batch()`, so the concurrency
  case proves the outcome (one row), not the interleaving.
- **The room's answer.** AC3 reads the host from `POST …/state`; a room that cannot name a signed-in host falls back to
  the participant rule. That fallback is deliberate (`roomHostAccountId`), and it is the reason a submission from a
  room nobody joined is still accepted from any participant.
