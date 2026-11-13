---
id: US-CORE-001
title: Simulate a shot with the GunBound-shaped integrator
epic: EPIC-03-match-core
status: done
priority: P0
size: L
depends_on: [US-FND-001]
open_questions: []
accepted_assumptions: [OQ-19, OQ-37]
refs: [02-reference/gameplay/tunables.md, 02-reference/gameplay/reference-gunbound.md, 02-reference/data/mobiles.md]
---

# US-CORE-001 — Simulate a shot with the GunBound-shaped integrator

## 1. Story

As a player, I want my aimed shot to fly like a GunBound shot, so that aiming feels like the game I know.

## 2. Context

GunBound's client only sent angle and power and the server integrated ``, so the integrator is ours by
necessity (`ADR-0005`). It must be deterministic, data-driven and fast enough to run on a phone at 60 FPS. Every shot
class in `packages/core/src/data/mobiles.ts` resolves to one of seven behaviours.

| Topic | Reference |
|---|---|
| Integrator tunables | [`02-reference/gameplay/tunables.md`](../../02-reference/gameplay/tunables.md) § 1 |
| Shot classes | [`02-reference/gameplay/tunables.md`](../../02-reference/gameplay/tunables.md) § 4 |
| Mobile weapon slots | [`02-reference/data/mobiles.md`](../../02-reference/data/mobiles.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|---|---|---|
| AC1 | `mbl-01` (weight 7.50 → `g = 390 × 7.50 ÷ 5.78 = 506.06`) and no wind | the shot is fired with angle 45, bar 4 | it lands at 1,696 ± 1 units, the golden sample `TC-CORE-020` records |
| AC2 | `STEP_MS = 25`, `g = 506.055` | the projectile is stepped 100 times (2.5 s) | vertical speed grew by exactly `506.055 × 2.5 = 1,265 u/s` — `12.65` per step — and no step mutates shared state (`TC-CORE-020`) |
| AC3 | bar 0 | the shot is fired | the projectile drops inside 2 s and the turn ends (`TC-CORE-029`) |
| AC4 | the same shot on `mbl-03` (drag 0.0555 → `k = 5.822`) and on `mbl-20` (drag 0.0950 → `k = 9.966`), wind `m = 26`, `sector 0` | each is stepped | drift equals `½ · k · 0.95 · m · t²`, so the draggier hull drifts `1.71×` as far at equal hang time (`TC-CORE-023`, `TC-CORE-925`) |
| AC4b | a wind reading at `sector 0` (0°, east) and `sector 1` (180°, west) | each is stepped | only `ax` changes sign; `ay = 0`, because the genre's wind is horizontal — the general `−k · windEff · sin θ` form exists for a map gimmick, not for play (`TC-CORE-023`) |
| AC5 | an angle outside the mobile's `angleMin/angleMax` | aim is committed | the angle is clamped, never rejected (`TC-CORE-022`) |
| AC6 | a light mobile (`mbl-15`, weight 4.20 → `g 283.5`) and a heavy one (`mbl-01`, weight 7.50 → `g 506.06`) | both fire at bar 4 on their own best angle | the light reaches 3,034 units at 45°, the heavy 1,696 at 45°: lower gravity means a flatter, longer arc (`TC-CORE-924`) |
| AC7 | a `bounce` shot aimed at flat terrain | it is fired | it bounces up to `bounceRestitution` losses, detonating no later than the third bounce (`TC-CORE-913`) |
| AC8 | the same seed, angle, bar and map | the shot is simulated on two runs | positions match bit-for-bit (`TC-CORE-020`) |

## 4. Contract

```ts
export type ShotClass = 'arc'|'flat'|'lob'|'bounce'|'cluster'|'piercing'|'beam';

export interface Weapon { class: ShotClass; power: number; radius: number; delay: number }

export interface Projectile {
  id: number; ownerSlot: number; weaponSlot: 0 | 1 | 2; shotClass: ShotClass;
  x: number; y: number; vx: number; vy: number;
  ageMs: number; bouncesLeft: number; power: number; radius: number; piercing: boolean;
}

export interface StepContext {
  wind: Wind; gravity: number; windK: number;   // gravityFor(mobile) × map.gravityModifier, windKFor(mobile)
  stepMs?: number; forceX?: number;            // 25 by default; a `force` map's constant push
}
export interface Wind { magnitude: number; directionDeg: number; sector: 0 | 1 } // 0–26; ×0.95; sector × 180°

export function windAcceleration(w: Wind, k: number): { ax: number; ay: number };

export function launch(options: { id: number; ownerSlot: number; weaponSlot: 0 | 1 | 2; weapon: Weapon;
                                  from: { x: number; y: number }; facing: 1 | -1; angle: number; bar: number;
                                  powerMultiplier: number }): Projectile;

export function stepProjectile(p: Projectile, context: StepContext): Projectile;
```

Per the equations in [`tunables.md`](../../02-reference/gameplay/tunables.md) § 1.1: `v0 = bar × BAR_VELOCITY`
(`BAR_VELOCITY 232.335` for every mobile, `bar 0…4`), `vx = cos(angle) × v0 × facing`, `vy = −sin(angle) × v0`; each
25 ms step applies `ax = k · windEff · cos θ + forceX`, `ay = gravity − k · windEff · sin θ` (`k` and `gravity` from the
machine, `windEff = magnitude × 0.95`), then integrates with **no drag term** — the model has none; positions round to
`0.1`, velocities do not (`TC-CORE-023`).

Requirements: `NFR-28`, `NFR-29`.

## 5. Rules and edge cases

- Beam weapons do not integrate: they resolve as a segment on the frame they are fired (`TC-CORE-912`).
- Cluster splits at apex into three sub-projectiles with `±8` angle offsets (`TC-CORE-912`).
- Piercing ignores terrain until it hits a unit or leaves the map (`TC-CORE-913` in `packages/core/tests/ballistics.test.ts`, `TC-CORE-950` in `terrain.test.ts`).
- `maxFlightMs` ends a shot that never lands; the turn passes (`TC-CORE-029`).
- Determinism forbids `Math.random()` in `core`; variance comes from seeded state (`01-overview/conventions.md` § 4).

## 6. Implementation notes

- `packages/core/src/physics/{launch,step,classes}.ts`; no Phaser, DOM or network imports (`NFR-22`).
- `stepProjectile` is pure: it returns a new projectile, and the scene only reads.
- Tunables are injected, never imported as a module singleton, so tests can override gravity.

## 7. Out of scope

Terrain collision and crater carving ([`US-CORE-006`](US-CORE-006-carve-terrain-on-impact.md)), damage
([`US-CORE-003`](US-CORE-003-apply-damage-with-shield-and-defense.md)).

## 8. Test notes

`TC-CORE-020`, `TC-CORE-021`, `TC-CORE-022`, `TC-CORE-023`, `TC-CORE-028`, `TC-CORE-029`, `TC-CORE-912`,
`TC-CORE-913`, `TC-CORE-924`, `TC-CORE-935` — `packages/core/tests/ballistics.test.ts`, `packages/core/tests/mobiles.test.ts`.
- **Red:** `TC-CORE-024`… no: the first red was `TC-CORE-023` in `packages/core/tests/weather.test.ts`, which failed because
  `stepProjectile` rounded velocity to the 0.1 position quantum, so drift stopped being linear in `magnitude`
  (half the wind gave double the drift).

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**done.** the engine rule is implemented in `packages/core/src` and covered by `packages/core/tests/` (ballistics, combat, match, snapshot, data, room, rating, camera)
