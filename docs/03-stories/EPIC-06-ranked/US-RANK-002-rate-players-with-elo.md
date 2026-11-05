---
id: US-RANK-002
title: Rate players with Elo after every ranked match
epic: EPIC-06-ranked
status: ready
priority: P1
size: S
depends_on: [US-RANK-001]
open_questions: []
accepted_assumptions: [OQ-28]
refs: [02-reference/data/matches.md, 02-reference/data/accounts.md, 02-reference/api/accounts.md]
---

# US-RANK-002 — Rate players with Elo after every ranked match

## 1. Story

**As a** competitive player
**I want** my rating to move by a rule I could compute myself
**so that** climbing means playing better, not playing more.

## 2. Context

Team Elo with a fixed K factor, computed inside the match transaction and written to `rating_history` for audit. Only
registered participants of a ranked match change rating; guests and bots never do.

| Topic | Reference |
|-------|-----------|
| Elo block, K factor, clamps | [data/matches.md](../../02-reference/data/matches.md) |
| `profile.rating`, `rated_matches` | [data/accounts.md](../../02-reference/data/accounts.md) |
| `ratedMatches`, rating in `/me` | [api/accounts.md](../../02-reference/api/accounts.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | Two teams of equal average rating (1200) | A ranked match is recorded | The winner gains 16 and the loser loses 16 (`delta = round(32 × (1 − 0.5))`), each `rating_history` row recording before/after (`TC-RANK-113`) |
| AC2 | Team A average 1400, team B average 1200 | A is recorded as winner | A gains fewer points than it would against an equal team, and B's loss is correspondingly small — the expected score uses the average per team |
| AC3 | A player whose `rated_matches >= 30` | They win | Their delta uses K = 16, not 32 (`TC-RANK-114`) |
| AC4 | A delta that would push a rating below 0 or above 4000 | It is applied | It is clamped and the clamp is visible in `rating_history` |
| AC5 | A match with `ranked = 0` | It is recorded | No rating changes, no `rating_history` rows (`TC-RANK-058`) |
| AC6 | A player leaving and rejoining the same match record | It is recorded | Rating is applied once per `(account_id, match_id)` — the unique index makes a replay impossible |
| AC7 | A 2v2 where one team has a guest | It is recorded | The guest is excluded from the average; the remaining team members are rated against the other team's rated players only |

## 4. Contract

```ts
export function expectedScore(ratingA: number, ratingB: number): number;   // 1 / (1 + 10 ** ((ratingB - ratingA) / 400))
export function kFactor(ratedMatches: number): 32 | 16;                    // 32 while < 30
export function delta(rating: number, opponentAvg: number, score: 0 | 1, ratedMatches: number): number; // round(k * (score - expected))
export function clampRating(r: number): number;                            // [0, 4000]
```

Applied per player: `rating_after = clampRating(rating_before + delta)`, `profile.rated_matches += 1`,
`profile.rating = rating_after`, `profile.updated_at = now`, one `rating_history` row per player.

## 5. Rules and edge cases

- Team average is the mean of that team's rated players; a team with no rated players makes the match unranked for both sides.
- `delta` is an integer; the rounding happens once, in `delta()`, so the UI and the database never disagree.
- Rating is never written by a client call, never accepted in `PATCH /me`.
- An abandoned match ends with `result = "abandon"` for the forfeiting team and is unranked (`ranked = 0`).
- The rating clamp is recorded, so an audit can tell a clamp from a normal change.

## 6. Implementation notes

- `apps/worker/src/rating/elo.ts`, pure and unit-tested; called from the match transaction in `matches.ts`.
- `rating_history` unique index `(account_id, match_id)` is the replay guard.
- Keep the constants in one place so a future K change is one line and a new `rulesetVersion`.

## 7. Out of scope

- Placement matches, decay, seasons, Glicko/TrueSkill.
- Showing the history — [US-RANK-003](US-RANK-003-show-my-match-history.md).

## 8. Test notes

`TC-RANK-113`, `TC-RANK-114`, `TC-RANK-058`; table-driven unit tests in `apps/worker/tests/elo.test.ts` including the clamp
and the K switch at 30 matches. Red first: `apps/worker/tests/elo.test.ts::equal_teams_gain_16`.

## 9. Open questions

- **OQ-28** (accepted assumption) — start 1200, K 32 then 16 after 30 rated matches, team-average expected score,
  clamp [0, 4000]. If the client wants individual-vs-average scoring, `elo.ts` changes and this story's ACs are amended.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**done.** the Elo implementation (`expectedScore`, `kFactor`, `delta`, `rateMatch`) is covered by `packages/core/tests/rating.test.ts`, including the K-factor step at thirty matches
