---
id: US-RANK-005
title: See the result screen with the rating change
epic: EPIC-06-ranked
status: ready
priority: P1
size: M
depends_on: [US-RANK-001, US-CORE-003]
open_questions: []
accepted_assumptions: [OQ-28]
refs: [02-reference/screens/results.md, 02-reference/api/matches.md, 02-reference/api/signaling.md]
---

# US-RANK-005 — See the result screen with the rating change

## 1. Story

**As a** player who just won or lost
**I want** to see the outcome, my damage and my new rating
**so that** the match has a conclusion and the next one is one tap away.

## 2. Context

The result screen is fed by `match_recorded` from the DO (or by the local result in a bot match) and renders the same
view for every participant. It replaces the match route in history so Back cannot re-enter a finished game.

| Topic | Reference |
|-------|-----------|
| Result screen layout, `rankedReason` | [screens/results.md](../../02-reference/screens/results.md) |
| `match_recorded` event | [api/signaling.md](../../02-reference/api/signaling.md) |
| `POST /matches` response | [api/matches.md](../../02-reference/api/matches.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | `match_recorded` with `ranked: true` | The screen renders | The winning team is announced and every participant sees their own `ratingBefore → ratingAfter` with the signed delta (`TC-RANK-153`) |
| AC2 | `match_recorded` with `ranked: false` | The screen renders | No rating numbers appear; the reason is stated in the current locale (`TC-RANK-154`) |
| AC3 | Any participant | The screen renders | Damage dealt, shots fired and hits are shown per player, with the viewer's own row highlighted |
| AC4 | The `Chơi lại` control | It is tapped | The player returns to the lobby with the same `maxPlayers`, or a new room is created when the old code is closed (`TC-RANK-155`) |
| AC5 | The browser Back button | It is pressed on the result screen | The match route is not re-entered; the player lands on the lobby or the menu (`TC-RANK-156`) |
| AC6 | A network failure while submitting the result | The submit fails | The screen offers a retry that is safe to press twice, and a second `409` is treated as success (`TC-RANK-157`) |
| AC7 | A bot match | It ends | The same screen renders with `ranked: false`, reason `bot`, and no network call |

## 4. Contract

Screen state: `{outcome, winnerTeam, players[], ranked, rankedReason, you}` where `you` carries
`{damageDealt, shotsFired, hits, ratingBefore, ratingAfter, delta}`.

`rankedReason`: `guest | bot | abandoned | ruleset_mismatch` — rendered as `results.reason.<value>`.

Navigation: `history.replaceState(null, "", "/results/<code>")` when the match ends; `Chơi lại` pushes `/lobby/<code>`.

## 5. Rules and edge cases

- A bot match renders without waiting for the server; an online match waits for `match_recorded` with a 5 s timeout and
  then shows a resubmit affordance.
- A player who reconnects after the end sees the result screen, not the match.
- No rating is computed on the client; it displays what the worker returned.
- Reloading the results route re-fetches from `/me/matches` first page rather than trusting local state.
- This is the only screen that shows another participant's damage numbers.

## 6. Implementation notes

- `apps/web/src/routes/results/` with a `useMatchResult` hook; source is the `match_recorded` message or the first
  `/me/matches` item after a reload.
- `Chơi lại` reuses `POST /rooms` with the previous `maxPlayers` when the old code returns `410`.

## 7. Out of scope

- Rematch negotiation between players (the host creates a new room).
- Sharing a result image.

## 8. Test notes

`TC-RANK-153`…`TC-RANK-157`. Playwright drives a 1v1 to a win, asserts the delta text, presses Back and asserts the
route. Red first: `tests/e2e/results.spec.ts::shows_rating_delta`.

## 9. Open questions

- **OQ-28** (accepted assumption) — the numbers shown follow the Elo in [US-RANK-002](US-RANK-002-rate-players-with-elo.md);
  if K changes, only the display fixtures change.

<!-- delivery:2026-11-06 -->

## Delivery status — 2026-11-06

**held at `ready`.** The result screen renders and `tests/e2e/smoke.spec.ts` TC-RANK-153 is green — but that case asserts a
cold open with no payload goes home, not the rating deltas this story promises. Still open: AC1/AC2 need a match that
actually records a rating (`ratingBefore → ratingAfter` and the unranked reason), AC3's per-player stats and the viewer
highlight have no case, and AC4/AC5/AC6/AC7 (rematch, Back, retry-safety, bot reason `bot`) are untraced. The
per-case spec would be `tests/e2e/results.spec.ts`, which does not exist.

The status is `ready` rather than `in-progress` because dependencies must be `done` first: `US-RANK-001` (record a
match) and `US-CORE-003` (damage and elimination) are both still `ready`.
