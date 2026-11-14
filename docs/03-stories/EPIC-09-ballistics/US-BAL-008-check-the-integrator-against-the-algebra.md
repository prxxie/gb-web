---
id: US-BAL-008
title: Check the integrator against the algebra
epic: EPIC-09-ballistics
status: done
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
| AC1 | flat ground, no wind, angles 30–75° in 7.5° steps and bars 1.0–4.0 in 0.5 steps | the shot is integrated and solved | range is within `v0 cos θ × 25 ms + 4 terrain samples (8 u)` and flight time is within 50 ms (two step ages) of `v0² sin 2θ / g` and `2 v0 sin θ / g` |
| AC2 | the 45° / bar-4 calibration fixture | gravity is perturbed by ±5 % | the oracle rejects it in both directions, proving the tolerance is not vacuous |
| AC3 | the two tolerances | they are explained | they are derived from the 25 ms step — one horizontal step plus terrain sampling for range and two sampled ages for time — and the derivation is a comment in the test |
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

- Lives in `packages/core/tests/ballistics-oracle.test.ts`; it may import the core ballistics, mobile data, tunables and
  types that define the fixture, but no app, worker or network module.

## 7. Out of scope

- Terrain, bounce, cluster and anything the closed form cannot express.
- Retuning: this story only measures.

## 8. Test notes

Unit only. Cases `TC-BAL-167`–`TC-BAL-170`. The original planned range `154`–`158` collides with the cases shipped by
`US-BAL-007`; `159`–`166` stay reserved for `US-BAL-009`.

**Red:** `packages/core/tests/ballistics-oracle.test.ts` — the first oracle run failed AC1 with 29 fixtures outside the
old 1 % bound (worst: 30°/bar 1 at 4.73 % range), and AC2 initially compared both sides against the same perturbed
gravity instead of against the unperturbed algebra.

## 9. Open questions

None.

## Delivery status — 2026-11-14

**Shipped.** `packages/core/tests/ballistics-oracle.test.ts` adds the independent flat-ground oracle for every
30–75° / bar 1–4 fixture, rejects a ±5 % gravity drift on the calibration shot, pins both step-derived budgets, and
records the diagonal-wind skip reason. No production code or ruleset changed.

**Verification.** On Node `22.22.2`, `PATH=/usr/bin:$PATH pnpm build`, `pnpm lint`, `pnpm typecheck` and `pnpm test` all
pass. The full suite is 143 files / 1,214 cases: 1,213 pass, 1 skipped, 0 failed. `verify-docs.mjs` reports 0 errors and
0 warnings.

**Red.** `packages/core/tests/ballistics-oracle.test.ts` first failed `TC-BAL-167` with 29 fixtures outside the original
1 % bound (worst 30°/bar 1: 4.73 % range), and the first perturb test compared both sides against the same wrong gravity.

### Deviations, and why

1. **The oracle records the shipped model's error, not an ideal integrator.** `OQ-45` accepted the semi-implicit 25 ms
   physics from `ADR-0007`; the 1 % assertion was replaced by one horizontal step plus four terrain samples for range and
   two step ages for flight time. The 45° / bar-4 calibration fixture still rejects a 5 % gravity drift.
2. **The test case ids start at `TC-BAL-167`.** `US-BAL-007` had already shipped `154`–`155`, and `US-BAL-009` reserves
   `159`–`166`.
3. **The suite is verified on Node 22.22.2.** Node 24.22.3 exposes the known jsdom / `AbortSignal` failure in
   `TC-FND-131`; on the project's documented Node 22 runtime the full suite is green.
