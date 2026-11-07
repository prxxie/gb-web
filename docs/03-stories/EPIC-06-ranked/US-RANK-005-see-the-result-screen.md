---
id: US-RANK-005
title: See the result screen with the rating change
epic: EPIC-06-ranked
status: done
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

`rankedReason`: `guest | bot | abandoned | ruleset_mismatch` — read from `match_recorded.rankedReason` and rendered
through one key per value (`results.ratings.reasonGuest`, `reasonBot`, `reasonAbandoned`, `reasonRuleset`: keys are never
built by concatenation, `conventions.md` § 2).

Navigation: `navigate("/results/<code>", { replace: true })` when the match ends; `Chơi lại` pushes `/lobby/<code>`.

## 5. Rules and edge cases

- A bot match renders without waiting for the server; an online match waits for `match_recorded` with a 5 s timeout and
  then shows a resubmit affordance.
- A player who reloads the match route after the end is handed to the result screen by the payload the match screen
  wrote; the room refuses a new socket (`410 room-closed`), so nothing can re-enter play.
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

`TC-RANK-153`, `154`, `155` and `157` in `tests/e2e/results.spec.ts`. The cases open the screen with the payload the
match screen writes — finishing a real 1v1 in a browser is `tests/e2e/lobby.spec.ts` plus the turn assertions in
`tests/e2e/main.spec.ts`, and the engine's own end states are `packages/core/tests` — and then assert the delta text,
the unranked reason, `Chơi lại` creating a room with the same settings, and a `409` accepted as success. Back
(`TC-RANK-156`) is a `web` case in `apps/web/tests/match-record.test.tsx`: the browser cannot finish a match
repeatably, and what the criterion needs is the handover replacing its own history entry.

Red: `tests/e2e/results.spec.ts` — written against the screen that posted on mount and always stored `ratings: []`, so
`result-rating-0` read `—` for a ranked match, `match_recorded` had no handler, and `Chơi lại` routed into an ended
room.

Component and unit cases for the same criteria, and the ones a browser cannot reach repeatably:
`apps/web/tests/results-screen.test.tsx` (twenty cases: deltas, the reasons, retry, `409` recovering the stored record,
`409` whose lookup fails, reload via `/me/matches`, `Chơi lại` with the viewer's own name and a 500 that does not create
a room),
`apps/web/tests/match-record.test.tsx` (the host sends `match_end`, waits for `match_recorded`, keeps the record's reason
and per-seat results, carries the room's start time, replaces its history entry) and `apps/web/tests/match-end.test.tsx`
(the bot handover).

## 9. Open questions

- **OQ-28** (accepted assumption) — the numbers shown follow the Elo in [US-RANK-002](US-RANK-002-rate-players-with-elo.md);
  if K changes, only the display fixtures change.

<!-- delivery:2026-11-07 -->

## Delivery status — 2026-11-07

**done.** Every criterion has a case, and the playback that used to end at the match screen now records itself first:

| AC | Case |
|----|------|
| AC1 — the deltas | `tests/e2e/results.spec.ts` TC-RANK-153; `apps/web/tests/match-record.test.tsx` (the room's `match_recorded` is the only source), `apps/web/tests/results-screen.test.tsx` |
| AC2 — the reason, no numbers | `tests/e2e/results.spec.ts` TC-RANK-154; `apps/web/tests/results-screen.test.tsx` (guest, bot, ruleset, and a record with no reason) |
| AC3 — stats and the viewer's row | `tests/e2e/results.spec.ts` TC-RANK-153; `apps/web/tests/results-screen.test.tsx` (the row follows the seat, so a guest is marked too) |
| AC4 — `Chơi lại` | `tests/e2e/results.spec.ts` TC-RANK-155 (a closed code creates a room with the same `maxPlayers` and mode); `apps/web/tests/results-screen.test.tsx` |
| AC5 — Back | `apps/web/tests/match-record.test.tsx` TC-RANK-156 (the handover replaces its entry; the case is `web`-level because a browser test cannot finish a real match repeatably) |
| AC6 — a safe retry | `tests/e2e/results.spec.ts` TC-RANK-157 (a `409` is success); `apps/web/tests/results-screen.test.tsx` (the key is the room's match id, a guest host is offered no button, and a draw is not offered one at all) |
| AC7 — a bot match | `apps/web/tests/results-screen.test.tsx` (no request, reason `bot`); `apps/web/tests/match-end.test.tsx` |

Notes for the next story in this epic:

- `match_recorded` now carries the record's own `rankedReason` (`signaling.md` § match_recorded), because a client can
  never see its own ruleset drift: `lib/result.ts` `rankedReasonOf` reads that field and nothing else, so a record with no
  reason prints no reason. Do not reintroduce a client-side derivation — a lost write is indistinguishable from an
  unrated guest match from here.
- A forfeit cannot be retried from this screen: the local match never ends (the room records it), so no payload with
  `failed` exists to carry the button. A surviving player reaches the result screen from the record itself.
- Only the host posts `POST /matches` (the room does it), so only the host sees `Thử lại`. The retry rebuilds the room's
  own key — `${roomCode}-${startedAt}` — which is why the lobby now passes `match_started.startedAt` into the plan and the
  match screen seeds `createMatch({ startedAt })` with it (keep `now` separate: a reload into a live match must not hand
  the opening turn a deadline that already passed). A retry on this device's clock would have created a *second* record
  and rated the match twice.
- A payload written by the previous build carries this device's clock in `startedAt`, so its retry key cannot match the
  room's record (`gbw.result` lives for one match in `sessionStorage`, so clearing it on deploy closes the window).
- A draw cannot be recorded at all: `POST /matches` refuses `winnerTeam: null` (`matches.ts`, "winnerTeam must be A or B"),
  so an abandoned or drawn match shows its statistics and no retry — see **OQ-43**, which owns making that submission
  representable in `US-RANK-001`'s contract.
- A retry carries no `delayTable`, and neither does the room's own `match_end` today, so both write `[]`; the day the host
  starts sending one, the payload and the retry body must carry it too (`US-CORE-002` AC7).
- A preview never reveals whether a code existed, so `Chơi lại` only learns a room is closed from `410 room-closed`; a
  never-used code answers `200` and routes to that lobby.
