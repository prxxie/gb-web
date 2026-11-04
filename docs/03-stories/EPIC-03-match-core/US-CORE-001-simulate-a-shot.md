---
id: US-CORE-001
title: Simulate a shot with the GunBound-shaped integrator
epic: EPIC-03-match-core
status: ready
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
| AC1 | `mbl-01` (`g 100`, `mass 168`, `standard` band) and no wind | the shot is fired with angle 45, force 98 | it lands at 1,988 ± 1 units after 6.3 s, the golden sample `TC-CORE-020` records |
| AC2 | `tunables.json` `gravity = 100 u/s²`, `stepMs = 50` | the projectile is stepped 100 times (5 s) | vertical speed grew by exactly `100 × 5 = 500 u/s` and no step mutates shared state (`TC-CORE-020`) |
| AC3 | force 0 | the shot is fired | the projectile drops inside 2 s and the turn ends (`TC-CORE-029`) |
| AC4 | the same shot on `mbl-03` (`mass 169`) and on `mbl-13` (`mass 118`), wind `m = 26`, `sector 0` | each is stepped | drift equals `½ · (42 × 26 / mass) · t²`, so `mbl-13` drifts ~50 % further than `mbl-03` (`TC-CORE-023`, `TC-CORE-925`) |
| AC4b | wind `m = 20` at `sector 3` (90°, blowing up) and at `sector 9` (270°, blowing down) | each is stepped on `mbl-01` | the upward wind adds ~5 u/s less than `gravity` per second (longer hang), the downward wind adds to it (shorter hang) — `θ` changes the arc, not only the drift (`TC-CORE-023`) |
| AC5 | an angle outside the mobile's `angleMin/angleMax` | aim is committed | the angle is clamped, never rejected (`TC-CORE-022`) |
| AC6 | a `direct` mobile (`g 84`) and a `mortar` mobile (`g 128`) | both fire at full force | the direct shot reaches ~2,043 units, the mortar ~1,491: lower gravity means a flatter, longer arc (`TC-CORE-924`) |
| AC7 | a `bounce` shot aimed at flat terrain | it is fired | it bounces up to `bounceRestitution` losses, detonating no later than the third bounce (`TC-CORE-913`) |
| AC8 | the same seed, angle, force and map | the shot is simulated on two runs | positions match bit-for-bit (`TC-CORE-020`) |

## 4. Contract

```ts
export type ShotClass = 'arc'|'flat'|'lob'|'bounce'|'cluster'|'piercing'|'beam';

export interface Weapon { class: ShotClass; power: number; radius: number; delay: number }

export interface Projectile {
  id: number; owner: number; weapon: Weapon;
  x: number; y: number; vx: number; vy: number;
  mass: number; gravity: number;
  bounces: number; ageMs: number; dead: boolean;
}

export function launch(shot: { angle: number; force: number; facing: 1 | -1 },
                       weapon: Weapon, ballistics: { gravity: number; mass: number },
                       from: { x: number; y: number }): Projectile;
export interface Wind { magnitude: number; directionDeg: number; sector: number } // 0–26; ×30; 0–11

export function windVector(w: Wind): { mx: number; my: number }; // magnitude × (cos θ, sin θ)

export function stepProjectile(p: Projectile, env: { weather: { wind: Wind } },
                               tunables: Tunables, dtMs: number): Projectile;
```

Per the equations in [`tunables.md`](../../02-reference/gameplay/tunables.md) § 1.1: `v0 = force × speedK` (`speedK 4.55`
for every mobile, as in GB), `vx = cos(angle) × v0 × facing`, `vy = −sin(angle) × v0`; each 50 ms step applies
`ax = 42 × mx / mass`, `ay = −gravity + 42 × my / mass` (polar wind resolved by `windVector`), then integrates with **no drag term** — the model
has none; positions round to `0.1` (`TC-CORE-040`).

Requirements: `NFR-28`, `NFR-29`.

## 5. Rules and edge cases

- Beam weapons do not integrate: they resolve as a segment on the frame they are fired (`TC-CORE-912`).
- Cluster splits at apex into three sub-projectiles with `±8` angle offsets (`TC-CORE-912`).
- Piercing ignores terrain until it hits a unit or leaves the map (`TC-CORE-913`).
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

`TC-CORE-020`, `TC-CORE-021`, `TC-CORE-022`, `TC-CORE-023`, `TC-CORE-028`, `TC-CORE-029`, `TC-CORE-912`, `TC-CORE-913`.
`Red first: tests/core/physics.test.ts::step_gravity_accumulates`.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**done.** the engine rule is implemented in `packages/core/src` and covered by `packages/core/tests/` (ballistics, combat, match, snapshot, data, room, rating, camera)
