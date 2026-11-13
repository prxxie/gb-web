---
id: US-BAL-004
title: Fly the original trajectory
epic: EPIC-09-ballistics
status: done
priority: P0
size: M
depends_on: [US-CORE-001]
open_questions: []
accepted_assumptions: []
refs: [02-reference/gameplay/tunables.md, 02-reference/gameplay/reference-gunbound.md]
---

# US-BAL-004 — Fly the original trajectory

## 1. Story

**As a** player of the original

**I want** the numbers I learned to work here

**so that** my aim transfers instead of being re-learned against a model someone invented.

## 2. Context

`US-CORE-001` shipped our own integrator with our own constants: `v0 = force × 5.9` over an arbitrary 0–100 force scale,
one gravity of `152 u/s²` for the whole roster, wind `1.0 × magnitude`, one 50 ms step. It behaved plausibly and it was
not the genre's arithmetic: at four bar and 45° it flew 2 290 u in **5.49 s** where the reference flies 2 214 u in
**3.37 s**. `CR-2026-11-13` replaced the basis; this story replaces the numbers.

| Topic | Reference |
|-------|-----------|
| Constants and their units | [tunables](../../02-reference/gameplay/tunables.md#1-integrator--our-ballistics-model) |
| The formula, in full | [reference-gunbound](../../02-reference/gameplay/reference-gunbound.md#10-the-physics-model-we-chose) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | any machine | a shot is resolved | `v0 = bar × 232.335 u/s` with `bar ∈ [0, 4]`, and gravity is that machine's own `g = 390 × weight / 5.78 u/s²` |
| AC2 | a wind reading of magnitude `m` and angle `φ` | the step is integrated | `k = 0.222 × windDrag / 0.046²` for the machine, `windEff = m × 0.95`, `aₓ = k · windEff · cos φ`, `a_y = g − k · windEff · sin φ`; in play `φ` is 0° or 180°, so the vertical term is zero |
| AC3 | the middle machine (weight 5.78), flat ground, no wind | four bar is fired at 45° | it lands **2 214 ± 20 u** from the muzzle after **3.37 ± 0.05 s** |
| AC4 | the integrator | a step is taken | the step is **25 ms**; a machine whose `weight` or `windDrag` is missing resolves nothing and reports an error instead of falling back to a default |
| AC5 | a stored snapshot or replay | it is loaded | it carries `ruleset = 2026-11-13` and a record from an older ruleset is refused with a readable reason |
| AC6 | the same shot | it is resolved twice | the result is identical, bit for bit, and the path has no more than `maxFlightMs / 25` points |

## 4. Contract

```ts
export const BAR_VELOCITY = 232.335;   // u/s per bar
export const BASE_GRAVITY = 390;       // u/s² at the 5.78 reference weight
export const GRAVITY_WEIGHT = 5.78;    // the weight BASE_GRAVITY is quoted at
export const WIND_COEFFICIENT = 0.222; // k = WIND_COEFFICIENT × windDrag / WIND_DRAG_REFERENCE²
export const WIND_DRAG_REFERENCE = 0.046; // a machine whose drag is 0.046 reads 4.826
export const WIND_EFFECT = 0.95;       // effective magnitude multiplier
export const STEP_MS = 25;

export function gravityFor(mobile: Mobile): number;      // 390 * weight / 5.78
export function windKFor(mobile: Mobile): number;        // (0.222 / 0.046) * (windDrag / 0.046)
export function muzzleVelocity(bar: number): number;     // bar * 232.335
```

`TUNABLES.speedK`, `TUNABLES.gravity`, `TUNABLES.windCoefficient` and the 0–100 `force` scale are removed; every caller
(`match.ts`, `preview.ts`, `bot.ts`, the HUD) is migrated in this commit.

## 5. Rules and edge cases

- `bar` is clamped to `[0, 4]` before the muzzle constant is applied; a negative bar is 0, not a reversed shot.
- The vertical wind term exists in the formula and is zero in play — a unit test pins both, so a map gimmick cannot silently
  change the shape.
- The old 50 ms step is gone; interpolation stays, and the renderer's `flightMs` comes from the engine as before.
- Replays and calibration fixtures from ruleset `2026-11-09` are not migrated: they are invalid, and the loader says so.
- `maxFlightMs` stays 12 s; at the new speeds nothing legitimate comes close.

## 6. Implementation notes

- `packages/core/src/tuning.ts` and `ballistics.ts` are the whole change; `mobiles.ts` needs `weight`/`windDrag` before this
  story can run its calibration, so `US-BAL-005` lands immediately after and the two are reviewed together.
- Rounding: the integrator already rounds per step; with 25 ms steps the rounding error per step halves, so the tolerance in
  AC3 is achievable without touching `roundTo`.
- The bot and the preview read `TUNABLES` — the same commit must migrate them or the build breaks, which is the intended
  forcing function.

## 7. Out of scope

- The roster itself (`US-BAL-005`) beyond the two fields this story needs.
- The closed-form oracle (`US-BAL-008`).
- The camera's information rule (`US-BAL-002`).

## 8. Test notes

`TC-BAL-119`–`TC-BAL-128` in `packages/core/tests/ballistics.test.ts`: muzzle velocity per bar, per-machine gravity (390 at
the reference weight, `506.055` for `mbl-01`) and `k` (4.826 / 5.822 / 9.966), the degenerate vertical term at
`sector 0`/`1`, the refused missing field, the calibration shot at 2,202.9 u / 3,350 ms and at wind ±26 (+814.3 / −807.5),
25 ms determinism, and — in `packages/core/tests/snapshot.test.ts` — the `ruleset-mismatch` refusal of a `2026-11-08`
snapshot.

Red: none — a formula swap has no failing behaviour to watch first: every new pin fails by construction against the
constants it replaces (`TC-BAL-123`'s 2,202.9 u against `speedK 5.9` / `gravity 152`, `TC-BAL-121`'s 9.966 against
`windCoefficient 1.0`). The suite that pinned those constants was migrated in the same change (`TC-CORE-020`, `TC-CORE-023`,
`TC-CORE-924`), not skipped.

## 9. Open questions

None. The parameter table is adopted by `CR-2026-11-13`; the roster mapping is `US-BAL-005`.

## Delivery status — 2026-11-13

**done.** `packages/core/src/ballistics.ts` carries the model as named constants outside `TUNABLES`
(`BAR_VELOCITY 232.335`, `BASE_GRAVITY 390`, `GRAVITY_WEIGHT 5.78`, `WIND_COEFFICIENT 0.222`,
`WIND_DRAG_REFERENCE 0.046`, `WIND_EFFECT 0.95`, `STEP_MS 25`) with `gravityFor`, `windKFor`, `muzzleVelocity` and
`windAcceleration(wind, k)`; `StepContext` now *requires* `windK`, and `gravityFor`/`windKFor` throw
`RangeError("cannot resolve a shot: the machine has no weight")` rather than defaulting. `speedK`, `gravity` and
`windCoefficient` are gone from `TUNABLES`, `RULESET_VERSION` is `2026-11-13`, and `restoreFromSnapshot` refuses a
snapshot from another ruleset through `assertCurrentRuleset` (`ruleset-mismatch: …`). Every caller moved with it:
`match.ts` (`launchFor`, `flightPath`, `resolveShot`, `applyInput`), `bot.ts` (quarter-bar grid over `0…4`), the web
preview, `barFromPower`, the HUD and the wire frame `bar`.

Measured on the new integrator: the calibration shot (`mbl-03`, bar 4, 45°, dead calm, flat probe) lands **2,202.9 u**
after **3,350 ms** (closed form 2,214.5 u; 134 steps of 25 ms), wind 26 east moves it **+814.3 u** and west **−807.5 u**
(`TC-BAL-123`, `TC-BAL-124`). The wind coefficient is *proportional* to `windDrag` — `k = 0.222 × windDrag / 0.046²` —
which is what `US-BAL-005` AC5's arithmetic implied; the inverse reading in AC2 was the contradiction recorded and
answered as `OQ-44`.

Cases: `TC-BAL-119`–`TC-BAL-128` in `docs/05-quality/test-cases.md`, asserted by `packages/core/tests/ballistics.test.ts`
(AC1–AC4, calibration, determinism) and `packages/core/tests/snapshot.test.ts` (AC5). The browser suite runs green with
the new bar too: `pnpm e2e` **91 passed** (2026-11-13) — one assertion in `tests/e2e/pwa-prod.spec.ts` still expected the
old two-decimal readout and was corrected to `0.0`.
