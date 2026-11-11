---
id: US-MATCH-012
title: One shell in the air at a time
epic: EPIC-05-match-ui
status: done
priority: P1
size: S
depends_on: [US-MATCH-001, US-MATCH-007]
open_questions: []
accepted_assumptions: []
refs: [02-reference/screens/match.md]
---

# US-MATCH-012 — One shell in the air at a time

## 1. Story

**As a** player

**I want** the opponent to wait until my shell has landed before it answers

**so that** the match reads as turn-based instead of two guns firing over each other.

## 2. Context

Reported by the owner: "kéo lực để bắn, đạn vừa bay ra thì bot bên kia đã bắn rồi — nhìn 2 viên đạn bay cùng lúc".

The engine resolves a shot **instantly**: `applyInput` returns the whole flight — path, landing, damage — in one tick, so
the turn has already passed to the next seat while the renderer is still animating the shell for the engine's own
`flightMs`. `useBotOpponent` then fired a fixed **1 400 ms** after the turn arrived, i.e. while the player's shell was
still in the air.

Measured on a bot match (`announce` timeline, ms from release):

| | This seat's shot resolves | Opponent's shot resolves | Gap |
|---|---|---|---|
| Before | 858 | 2 256 | **1 398 ms** — inside a ~4 s flight |
| After | 898 | 5 079 | **4 181 ms** |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | a shot has just been fired | the renderer is animating it | The field reports itself busy (`data-cinematic="true"` on the match screen) and no other seat acts until it clears itself; the opponent's answer arrives only after the flight, then its own thinking time (`TC-MATCH-960`, `TC-MATCH-962`) |
| AC2 | the opponent's shell is still in the air | this seat presses and drags to shoot | The pull does not arm and the power readout stays at zero (`TC-MATCH-961`, `TC-MATCH-963`) |
| AC3 | the shell has landed | the hand-over completes | The busy flag clears on its own, so nothing can wedge waiting for a flight that is over (`TC-MATCH-962`) |

## 4. Contract

```ts
/** Engine flight held inside the window the renderer can afford. */
export function clampFlightMs(flightMs: number | undefined): number;
/** When the last shell a step launched finishes on screen (flight + impact settle), or 0 when nothing flies. */
export function shotLockUntil(events: readonly MatchEvent[], now: number): number;
/** A waiting seat watches the shell land **and then** thinks: flight remaining + thinking time. */
export function shotWaitMs(thinkingMs: number, lockedUntil: number, now: number): number;
```

`useMatchEngine` owns the lock (it is the only writer of state) and exposes `lockedUntil`/`cinematic`;
`canAim({ cinematic })` refuses the pull; `useBotOpponent` waits `shotWaitMs(BOT_THINKING_MS, lockedUntil, now)`.

The two numbers the scene and the hooks must agree on — `MAX_FLIGHT_MS` (6 000), `IMPACT_MS` (420) — live in
`apps/web/src/game/flight.ts` and are imported *by* the scene, so a change cannot leave one side behind.

## 5. Rules and edge cases

- The lock is set from **events**, not from a timer started at release: a shot that arrives from the network (or after a
  reconnect) blocks the sky exactly like a local one.
- A step that launches **two** shells (dual-shot items) locks on the later of them.
- A step with no `shot` event locks nothing.
- Adding the thinking time to the remaining flight, rather than taking the larger of the two, is deliberate: a seat that
  spent the flight "thinking" fires the instant the shell lands, and two shots one frame apart still read as one
  exchange. The extra 1 400 ms is what makes the turn visible.
- Items, weapon changes and the pad stay available during the lock: none of them put a shell in the air, and locking the
  whole HUD would read as a freeze.
- The lock never survives a match end: `commit` on an `ended` state still finishes and the timer is cleared on unmount.

## 6. Implementation notes

- `apps/web/src/game/flight.ts` — the constants and the three helpers; the scene imports `IMPACT_MS`/`clampFlightMs` from
  it instead of keeping its own copies.
- `apps/web/src/match/useMatchEngine.ts` — `lockedUntil`, `cinematic`, and the one timer that clears them.
- `apps/web/src/game/aim.ts` — `AimContext.cinematic`, checked after the turn and before `lockedTurn`.
- `apps/web/src/match/useBattleSync.ts`, `useBotOpponent.ts`, `apps/web/src/routes/MatchPage.tsx` — wiring, the bot's
  wait, and `data-cinematic` on the match screen (which is also what the e2e asserts).
- `apps/web/tests/flight.test.tsx`, `apps/web/tests/aim-fire.test.tsx` — the pure cases.
- `tests/e2e/turn-tempo.spec.ts` — both sides in a real bot match.

## 7. Out of scope

- Online play's turn clock: the deadline still runs during the lock, which is the behaviour a player already had.
- Reordering the *state* hand-over (the engine advancing at all): the state is correct the moment the shot resolves, and
  delaying it would desynchronise a networked match. Only the *sky* is locked.
- The engine's `flightMs` itself (`US-CORE-*`): this story contains it, it does not retune it.

## 8. Test notes

`TC-MATCH-960` pins the arithmetic (flight + settle, the later of two shells, no shell → 0, flight-then-think wait);
`TC-MATCH-961` pins `canAim` refusing while cinematic. The e2e cases run a real bot match: the field must report itself
busy and clear on its own, and the moment it clears the live region must still hold this seat's shot — which is the
symptom the owner reported, measured rather than described. The second case presses as soon as the opponent's own line
appears (50 ms poll, because the flight is a few seconds) and requires a power readout of zero.

Red: `tests/e2e/turn-tempo.spec.ts` — before the hand-over the opponent's line arrived 1 398 ms after this seat's, inside
a ~4 s flight, and a pull during the opponent's flight armed normally (power 450 from the combined readout).

## 9. Open questions

None.

<!-- delivery:2026-11-11 -->

## Delivery status — 2026-11-11

**done**, with the number that matters measured twice: gap 1 398 ms before, 4 181 ms after, and both e2e cases green
against a real bot match.
