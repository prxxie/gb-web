---
id: US-RANK-002
title: Rate players with Elo after every ranked match
epic: EPIC-06-ranked
status: done
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
| AC1 | Two teams of equal average rating (1200) | A ranked match is recorded | The winner gains 16 and the loser loses 16 (`delta = round(32 × (1 − 0.5))`), each `rating_history` row recording before/after (`TC-RANK-110`, `TC-RANK-113`) |
| AC2 | Team A average 1400, team B average 1200 | A is recorded as winner | A gains fewer points than it would against an equal team, and B's loss is correspondingly small — the expected score uses the average per team (`TC-RANK-158`) |
| AC3 | A player whose `rated_matches >= 30` | They win | Their delta uses K = 16, not 32 (`TC-RANK-114`, `TC-RANK-159`) |
| AC4 | A delta that would push a rating below 0 or above 4000 | It is applied | It is clamped to `[0, 4000]` and the clamp is visible in `rating_history`: `delta` is the change actually applied, so `rating_before + delta = rating_after` (`TC-RANK-160`) |
| AC5 | A match with `ranked = 0` | It is recorded | No rating changes, no `rating_history` rows (`TC-RANK-116`, `TC-RANK-058`) |
| AC6 | A player leaving and rejoining the same match record | It is recorded | Rating is applied once per `(account_id, match_id)` — the unique index makes a replay impossible (`TC-RANK-161`) |
| AC7 | A 2v2 where one team has a guest | It is recorded | The guest is excluded from the average; the remaining team members are rated against the other team's rated players only (`TC-RANK-162`) |

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
- An abandoned match is unranked (`ranked = 0`) and every seat is written as `result = "abandon"`, the side that stayed
  included: `POST /matches` cannot tell the two apart once `abandoned` is set (`matches.md` § `abandoned`). The room's own
  broadcast does distinguish them (`room-do.ts` § forfeit).
- The rating clamp is recorded, so an audit can tell a clamp from a normal change.

## 6. Implementation notes

- `packages/core/src/rating.ts` — the maths (and its constants) live in core because they are pure and shared; the story
  first placed them in `apps/worker/src/rating/elo.ts`. The write path is `rateTeam()` in
  `apps/worker/src/routes/matches.ts`: the deltas are computed before the write, and every insert and update lands in
  one `GBW_DB.batch()`.
- `rating_history` unique index `(account_id, match_id)` is the replay guard.
- Keep the constants in one place so a future K change is one line and a new `rulesetVersion`.

## 7. Out of scope

- Placement matches, decay, seasons, Glicko/TrueSkill.
- Showing the history — [US-RANK-003](US-RANK-003-show-my-match-history.md).

## 8. Test notes

`TC-RANK-113` and `TC-RANK-114` cover the maths (`apps/worker/tests/elo.test.ts`, `packages/core/tests/rating.test.ts`),
`TC-RANK-058` the `isRanked()` flag, `TC-RANK-110` the equal-team write and `TC-RANK-116` the unranked paths
(`apps/worker/tests/matches.test.ts`); `TC-RANK-158`–`TC-RANK-162` cover the criteria this pass added cases for — the
team average, the per-player K, both clamps, the replay guard and the guest seat.

- **Red:** none — the Elo write shipped with `apps/worker/src/routes/matches.ts` before this pass, so no new case could
fail on behaviour. What the pass adds is the proof at the row level: `TC-RANK-110`, `TC-RANK-158`, `TC-RANK-160` and
`TC-RANK-162` assert the stored `rating_history` and `profile` rows, and `TC-RANK-161` drives the replay through the
route as well as the index.

## 9. Open questions

- **OQ-28** (accepted assumption) — start 1200, K 32 then 16 after 30 rated matches, team-average expected score,
  clamp [0, 4000]. If the client wants individual-vs-average scoring, `elo.ts` changes and this story's ACs are amended.

<!-- delivery:2026-11-07 -->

## Delivery status — 2026-11-07

**done.** The write path was already in place before this pass (`packages/core/src/rating.ts` plus `rateTeam()` in
`apps/worker/src/routes/matches.ts`), so the work was proving the five criteria that had no case and repairing the doc
mapping `verify-docs` needs. Nothing about the rating maths changed.

| Criterion | Evidence |
|-----------|----------|
| AC1 | `TC-RANK-110` (`apps/worker/tests/matches.test.ts`): a ranked 2v2 stores four `rating_history` rows reading `1200 → 1216` and `1200 → 1184` with `delta: ±16`, and the profiles carry the same numbers. `TC-RANK-113` pins the `±16` rule itself |
| AC2 | `TC-RANK-158`: teams averaging 1400 and 1200 store `1400 → 1408` and `1200 → 1192` — half the `±16` an equal team earns, because the expected score uses the team average |
| AC3 | `TC-RANK-159`: one settled player (30 rated matches) moves `+8` while the newcomer beside them moves `+16`, and `rated_matches` becomes 31. `TC-RANK-114` pins the threshold and that the K is the player's own |
| AC4 | `TC-RANK-160`: a 1v1 at 3999 records `rating_after = 4000` with `delta = 1`; a 1v1 at 3 lost records `rating_after = 0` with `delta = -3`. `delta` is the change applied, so `rating_before + delta = rating_after` at both edges |
| AC5 | `TC-RANK-116` (with `TC-RANK-119` for a side with no account): an abandoned match, a stale ruleset and a team with no registered player each answer `ranked: false` with the reason on the wire, store `ranked_reason`, write no `rating_history` row and return `ratings: []`; `TC-RANK-058` pins the flag logic both ways |
| AC6 | `TC-RANK-161`: a second row for one `(account_id, match_id)` is refused by `UNIQUE (account_id, match_id)`, and a replay of the recorded match is `409` with the four history rows and four ratings unchanged |
| AC7 | `TC-RANK-162`: with team B rated 1000 against team A's 1200, the three registered players move `+8/+8/−8` — a guest counted in the average would make it `±12` — and the guest seat writes no `rating_history` and no `match_player` row |

**What this pass actually changed.** Four row-level cases (`TC-RANK-158`–`TC-RANK-160`, `TC-RANK-162`) and the
index-plus-replay guard (`TC-RANK-161`), the `beforeEach(resetLimits)` the file needed once it grew past one account's
hourly submission allowance, the `TC`→`AC` mapping in `docs/05-quality/test-cases.md` (no US-RANK-002 row carried an
`ACn`, so the story could not be signed off), an assertion on the stored rows in `TC-RANK-110` where the case had only
looked at the response, the §6 path correction, and three corrections in `data/matches.md` (`delta` under the clamp,
what `player_count` counts, and when a match stays ranked with a guest seat).

**Recorded, not changed.** (1) `packages/core/src/rating.ts` also exports `rateMatch()`, a team-level helper that uses the
most settled member's K; nothing in the worker calls it. If a later story reuses it for a client-side preview, the
preview will disagree with the server by a few points at the 30-match boundary — the server keeps the per-player rule
in §4. (2) A seat with no account never reaches `match_player` (only `match_record.player_count` counts it), so a guest's
result is not auditable per seat. (3) `winnerTeam` has no draw value; `data/matches.md` and AC1 assume no draws.
(4) The file-level `resetLimits()` means nothing in `matches.test.ts` exercises the route's `429` branch for
`matchesPerAccount` any more; the limiter itself is covered in `apps/worker/tests/ratelimit.test.ts`. (5)
`tests/meta/traceability-scope-exceptions.txt` still lists `TC-RANK-113`, `TC-RANK-114` and `TC-RANK-116` against a
second directory, because the same ids are cited by both `apps/worker/tests/elo.test.ts` and
`packages/core/tests/rating.test.ts`; clearing that debt means deleting one of the two duplicate suites, which is its
own story.
