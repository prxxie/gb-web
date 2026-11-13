---
id: US-BAL-007
title: Solve the shot with the original algebra
epic: EPIC-09-ballistics
status: done
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
| AC2 | the calibration shot (22.14 phần — the reach of bar 4 at 45°, flat, no wind) | the solver is asked for the bar | it returns `4.00` and a flight time of `3.37 s (±0.05)`; the rounded 2.77 màn (22.16 phần) is past that reach and is refused, not clamped |
| AC3 | an angle too low for the height difference, a headwind too strong, or a half-typed height | the solver is asked | it returns `ok: false` with a reason **code** instead of a negative, `NaN` or `Infinity` bar |
| AC4 | the match route, `apps/web/src/routes/MatchPage.tsx` | it is compiled | it does not import the solver — asserted by a test that reads the import graph, so the tool cannot leak into a match |
| AC5 | the practice route, `/practice` (`02-reference/screens/practice.md`) | it is opened | it shows the three modes and states, once, that it is not available in a match |

## 4. Contract

```ts
export interface SolveContext { readonly angle: number; readonly deltaY: number; readonly gravity: number; readonly wind: WindAcceleration; }
export type SolveResult =
  | { readonly ok: true; readonly bar: number; readonly parts: number; readonly flightSec: number }
  | { readonly ok: false; readonly reason: SolveReason };

type SolveReason = "angle" | "bar" | "distance" | "height" | "unreachable" | "wind";

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

**Red:** `packages/core/tests/solver.test.ts` — first `Error: Cannot find module '../src/solver'`, then `expected false to be
true` and `expected 14.210059389823229 to be less than 12.456819744230767` before the fixes in the delivery note.

Unit: round-trip `bar → distance → bar` across angles 20–85° and bars 0.5–4.0; the unreachable cases; the practice-route
isolation. Cases `TC-BAL-149`–`TC-BAL-155` — the planned `147`–`153` range collides with the ids `US-BAL-005`
(`137`, `138`) and `US-BAL-006` (`139`–`146`, `148`) took, so the story starts at the first free number and
`docs/05-quality/test-cases.md` carries the mapping.

## 9. Open questions

None.

## Delivery status — 2026-11-14

**Shipped.** `packages/core/src/solver.ts` (exported from the core barrel) holds the three answers — `barForDistance`,
`distanceForBar`, `timeForShot` — over `SolveContext { angle, deltaY, gravity, wind }`; `apps/web/src/routes/PracticePage.tsx`
is the screen, lazy-loaded at `/practice` beside `/sign-in` and `/match/:code`, with `main.practice` on the menu. Copy in
both tables (23 `practice.*` keys), styles in `styles.css`, and `CR-2026-11-14-practice-solver-screen` supplied the screen
doc the story's AC5 named.

**Verification.** `packages/core/tests/solver.test.ts` 14 cases, `apps/web/tests/practice.test.tsx` 11,
`tests/meta/solver-isolation.test.ts` 7, `tests/e2e/practice.spec.ts` 3 (run against a fresh dev server);
`pnpm typecheck`, `pnpm lint`, the full `pnpm test` suite (142 files / 1,210 cases), `pnpm build` and `pnpm budget` all pass. The only failing test in
the repository is the pre-existing `apps/web/tests/shell.test.tsx > TC-FND-131`.

**Red.** `packages/core/tests/solver.test.ts` first failed on `Error: Cannot find module '../src/solver'`; once the module
existed, two cases failed for real reasons — `expected false to be true` (the rounded 2.77 màn is past the bar's reach) and
`expected 14.210059389823229 to be less than 12.456819744230767` (an elevated target is met *later*, not sooner).

### Deviations, and why

1. **`SolveResult` carries `parts`.** § 4's success shape was `{ bar, flightSec }`; `distanceForBar` has to answer with a
   distance, and one shape for all three answers is what lets the screen print whichever one the mode asks for. The extra
   field is the only addition.
2. **`reason` is a code, not a sentence** (`angle` · `bar` · `distance` · `height` · `unreachable` · `wind`). `@gbw/core`
   carries no user-facing string (`01-overview/conventions.md`), so the screen maps each code to `practice.invalidAngle`,
   `practice.invalidHeight`, `practice.invalidUnreachable` or `practice.invalidWind`. § 5 asked for "a reason"; a code is the
   form a reason takes in this codebase. `height` was added in the review round below: a cleared field is `NaN`, and
   `NaN` must be a refusal, not an answer.
3. **AC2 was corrected in place, and § 4 with it.** The story asked for "2.77 màn → `4.00`", which cannot be true: 2.77 màn
   is 22.16 phần = 2,216 u, while the bar-4 shot at 45° on the reference hull flies 2,214.6 u, so the honest answer is a
   refusal. AC2 now states the reachable figure (22.14 phần, the shot `reference-gunbound.md` § 10 measures) and keeps the
   rounded one as the refusal it must be. Fixing the AC rather than only documenting a deviation is what DoD D1 asks
   (`.agents/rules/03-definition-of-ready-and-done.md`); the CR deliberately left AC2 alone, so the correction is recorded
   here.
4. **The default machine is `mbl-03`.** The screen doc names no default; the reference hull is the one whose calibration the
   default distance reproduces, so the screen opens on a solved example instead of a refusal.
5. **`barForDistance` bisects when the target is not level with the muzzle.** § 10's closed form is the flat-ground range
   (`bar = √(x·g / (2·cos θ·sin θ·v₀²))`); with a height difference the same expression has no closed inverse, so the range
   is evaluated in closed form and the bar is found by 60 bisection steps over `0…4` (range is monotone in the bar) plus a
   residual check at 0.1 u. Flat questions are exact; the answer a player reads is still the root of the quadratic, never an
   iterated guess about the landing.
6. **The closed form and the integrator differ by 0.5 %, and the difference is documented.** The reference's § 10 quotes
   2,203 u / 3.35 s for the calibration shot; the closed form over `TUNABLES` yields 2,214.6 u / 3.37 s, and the real 25 ms
   integrator lands within 10 u of the closed form (flown at bar 3, because the bar-4 shot leaves the 2,000 u map). The
   story's numbers (2,214.6 u, `3.37 s ±0.05`) are the ones the code produces and the integrator agrees with; the quoted
   2,203 u is the reference document's own rounding of the same shot. Recorded here so `US-BAL-008` does not rediscover it.
7. **NFR-03 moved.** `shell` 154 → 155 and `total` 553 → 556 KiB gzip, and two buckets were recorded: `practice` (1.7 KiB)
   and the shared `ballistics` chunk (1.2 KiB) that Rollup now splits out because the match route and the practice route both
   import it. The `practice.*` copy lives in the initial chunk by design (`NFR-18`: one language table), which is why the
   shell moved too; `scripts/bundle-budget.json` carries the measurement and what was tried first.

### Review round — 2026-11-14

A fresh-context review asked three Criticals and six Mediums; all three Criticals and every Medium were fixed before the
commit:

- **Critical: a downhill target was called unreachable.** `barForDistance` treated the first bisection step's `null`
  (the arc at bar 2 still peaks below a sunken target) as hopeless, so every `deltaY` below ≈1.4 phần was refused although
  `distanceForBar(4)` had already proved it reachable. `null` now means "too weak" and the search continues; `TC-BAL-149`
  round-trips `deltaY = −400` and `−900 u`, and the screen test answers a `−2.5 phần` target.
- **Critical: a cleared height printed `NaN`.** `Number.parseFloat("")` is `NaN`, and `NaN` slipped through the quadratic
  into `parts`/`flightSec`. The solver now refuses a non-finite `deltaY`, `gravity` or wind as `height` (`TC-BAL-151`), and
  the screen maps that code to its own sentence instead of printing `NaN phần`.
- **Critical: AC2 and § 4 still described the old contract.** Corrected in place — see deviation 3 — so the story and the
  code say the same thing before the status is `done`.
- **Medium: AC4's guard could not see what it claimed to exclude.** `@gbw/core` is one barrel, so a `import * as core` or a
  shared helper could reach the solver without an edge the walk recognised. `tests/meta/solver-isolation.test.ts` now also
  scans every file in the match route's graph for the five solver symbols, which is what actually holds AC4.
- **Medium: the calibration test lied about the integrator.** It now flies the shot through `simulateFlight` and compares
  (`TC-BAL-150`) — see deviation 6.
- **Medium: units and counts in the docs.** `TC-BAL-149`'s "±150 phần" is ±150 **u** (the test passes world units), the
  `AGENTS.md` e2e figure is 27 spec files / 94 cases (it said 23 specs), and the budget note's "1.4 u" now matches the
  arithmetic.
- **Medium: the pre-existing `shell.test.tsx` failure is a DoD waiver, not a footnote.** DoD D2 asks for a green full
  suite; `apps/web/tests/shell.test.tsx > TC-FND-131` fails on `main` too (`TypeError: RequestInit: Expected signal
  ("AbortSignal {}") to be an instance of AbortSignal`, react-router 7.18.5 under jsdom + undici). It is **waived** for
  this story with that evidence, and it stays open as its own defect.
- **Medium: the accessibility of the mode row and the answer box.** The mode buttons and the wind direction are named
  groups (`practice.title`, `practice.direction`), and the answer box holds phrasing content (`<span>`) instead of a `<p>`
  inside `<output>`.
- Nits taken: dead `answer === null` branch removed, `sector: 180` for a westward wind, "no iteration to convergence"
  removed from the docstring (the bar is bisected), the `wind` reason now only blames the wind when a calm shot would have
  reached, and the wind input clamps at `TUNABLES.windMax` instead of trusting the spinner hint.
