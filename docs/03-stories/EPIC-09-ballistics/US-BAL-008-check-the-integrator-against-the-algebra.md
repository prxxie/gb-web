---
id: US-BAL-008
title: Check the integrator against the algebra
epic: EPIC-09-ballistics
status: ready
priority: P2
size: S
depends_on: [US-BAL-004, US-BAL-007]
open_questions: []
accepted_assumptions: []
refs: [02-reference/gameplay/reference-gunbound.md]
---

# US-BAL-008 — Check the integrator against the algebra

## 1. Story

**As a** maintainer

**I want** a closed-form answer to compare every numerically integrated shot against

**so that** a constant drifting in `tuning.ts` fails a test instead of quietly changing what players learn.

## 2. Context

The integrator is stepped, rounded and coupled to terrain, so it has never had an independent check: every existing test
asserts behaviour ("it lands roughly here") that was itself produced by the same constants. The reference's algebra gives an
exact answer on flat ground with no wind, which is the one case where the two must agree to within the step's own error.

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | flat ground, no wind, angles 30–75° and bars 1.0–4.0 | the shot is integrated and solved | range and flight time agree with `v0² sin 2θ / g` and `2 v0 sin θ / g` within **1 %** |
| AC2 | the same fixture | gravity is perturbed by 5 % | the test fails, proving it is not vacuous |
| AC3 | the tolerance | it is explained | it is derived from the 25 ms step (one step of horizontal travel at the muzzle velocity) and the derivation is a comment in the test |
| AC4 | a wind reading that is not 0 or 180 | the fixture runs | it is skipped with a reason, because the closed form used here assumes horizontal wind |

## 4. Contract

```ts
/** The analytic solution the stepped integrator is checked against (flat ground, horizontal wind only). */
export function analyticRange(v0: number, angleDeg: number, gravity: number): number;
export function analyticFlightSec(v0: number, angleDeg: number, gravity: number): number;
```

## 5. Rules and edge cases

- The tolerance is a property of the fixture (25 ms), not a magic number copied into two files.
- A future step change must fail this test until the tolerance comment is updated — that is the point.
- The perturbation case runs the formula against a deliberately wrong gravity; it never touches `TUNABLES`.

## 6. Implementation notes

- Lives in `packages/core/tests/ballistics-oracle.test.ts`; it may import the solver module and the integrator, and nothing
  else.

## 7. Out of scope

- Terrain, bounce, cluster and anything the closed form cannot express.
- Retuning: this story only measures.

## 8. Test notes

Unit only. Planned cases `TC-BAL-154`–`TC-BAL-158`.

## 9. Open questions

None.
