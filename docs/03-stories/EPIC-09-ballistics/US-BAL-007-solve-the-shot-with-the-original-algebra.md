---
id: US-BAL-007
title: Solve the shot with the original algebra
epic: EPIC-09-ballistics
status: ready
priority: P1
size: M
depends_on: [US-BAL-004]
open_questions: []
accepted_assumptions: []
refs: [02-reference/gameplay/reference-gunbound.md]
---

# US-BAL-007 — Solve the shot with the original algebra

## 1. Story

**As a** player practising

**I want** to ask "what bar do I need for 2.5 màn at 55°" and get the answer

**so that** I can check my own arithmetic instead of guessing at a hundred shots.

## 2. Context

The reference's engine answers three questions in closed form: distance from angle and bar, bar from distance and angle,
and the flight time for either. Those three are exactly the practice tool a blind-fire game needs — and exactly the tool
that must never be available in a ranked match, because it removes the calculation the game is about.

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | a distance in phần, an angle and a height difference | the solver is asked for the bar | it returns the bar that lands there, to `±0.01 bar`, for every reachable pair |
| AC2 | the calibration shot (2.77 màn, 45°, flat, no wind) | the solver is asked for the bar | it returns `4.00` and a flight time of `3.37 s (±0.05)` |
| AC3 | an angle too low for the height difference, or a headwind too strong | the solver is asked | it returns `invalid` with a reason string instead of a negative or `Infinity` bar |
| AC4 | the match route, `apps/web/src/routes/MatchPage.tsx` | it is compiled | it does not import the solver — asserted by a test that reads the import graph, so the tool cannot leak into a match |
| AC5 | the practice route, `/practice` (`02-reference/screens/practice.md`) | it is opened | it shows the three modes and states, once, that it is not available in a match |

## 4. Contract

```ts
export interface SolveContext { readonly angle: number; readonly deltaY: number; readonly gravity: number; readonly wind: WindAcceleration; }
export type SolveResult =
  | { readonly ok: true; readonly bar: number; readonly flightSec: number }
  | { readonly ok: false; readonly reason: string };

export function barForDistance(parts: number, context: SolveContext): SolveResult;
export function distanceForBar(bar: number, context: SolveContext): SolveResult;
export function timeForShot(bar: number, context: SolveContext): SolveResult;
```

The practice page renders three modes over that contract — `bar` (input: distance in phần), `distance` (input: bar),
`time` (input: bar) — and builds its `SolveContext` from a machine (`gravityFor`, `windKFor`), the angle, the height
difference and the wind (`windAcceleration`). The screen's fields, states, copy keys and oracles are the contract in
[`02-reference/screens/practice.md`](../../02-reference/screens/practice.md); this story owns
`apps/web/src/routes/PracticePage.tsx` and its route entry, which is lazily loaded. Nothing in `../game` is imported by
it, and it is not imported by the match route.

## 5. Rules and edge cases

- This is the *flat-ground* solution: it ignores terrain by construction, and the UI says so next to the answer.
- Distances are entered in phần; the conversion to world units happens in one place.
- The solver refuses a target behind the muzzle rather than returning a mirrored bar.
- A non-finite or zero angle returns `invalid` with a reason, never `NaN` in the UI.

## 6. Implementation notes

- New pure module `packages/core/src/solver.ts`, no state, no `MatchState`.
- The import-graph assertion is a small node test that walks `apps/web/src/routes/MatchPage.tsx`'s imports; keep it simple
  and honest rather than clever.

## 7. Out of scope

- An in-match overlay or an accessibility hint that uses the solver.
- Terrain-aware solving (that is what the integrator is for).
- Saved history, shareable answers, and per-machine presets on the practice screen: the player types the three inputs.

## 8. Test notes

Unit: round-trip `bar → distance → bar` across angles 20–85° and bars 0.5–4.0; the unreachable cases; the practice-route
isolation. Cases `TC-BAL-149`–`TC-BAL-155` — the planned `147`–`153` range collides with the ids `US-BAL-005`
(`137`, `138`) and `US-BAL-006` (`139`–`146`, `148`) took, so the story starts at the first free number and
`docs/05-quality/test-cases.md` carries the mapping.

## 9. Open questions

None.
