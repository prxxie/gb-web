---
id: US-CORE-006
title: Carve terrain and collide with it
epic: EPIC-03-match-core
status: ready
priority: P0
size: M
depends_on: [US-CORE-001]
open_questions: []
accepted_assumptions: [OQ-19, OQ-37]
refs: [02-reference/gameplay/tunables.md, 02-reference/data/mobiles.md, 02-reference/data/room-state.md]
---

# US-CORE-006 — Carve terrain and collide with it

## 1. Story

As a player, I want craters to change the battlefield, so that repeated hits open new lines of fire the way they do in
GunBound.

## 2. Context

GunBound keeps a terrain collision mask and carves a crater on every blast
``. Projectiles detonate on the mask,
units walk on it, and the mask must be part of the replicated state.

| Topic | Reference |
|---|---|
| Integrator | [`02-reference/gameplay/tunables.md`](../../02-reference/gameplay/tunables.md) § 1 |
| Snapshot | [`02-reference/api/signaling.md`](../../02-reference/api/signaling.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|---|---|---|
| AC1 | a projectile reaches the terrain mask | it is stepped | it detonates at the first contact point, not inside the terrain (`TC-CORE-914`) |
| AC2 | a blast of radius 80 lands | it resolves | a crater of `0.6 × 80` is removed from the mask and the units standing on it fall to the new surface (`TC-CORE-914`) |
| AC3 | a crater is carved under a unit | its turn ends | the unit's `y` is re-grounded and it cannot float (`TC-CORE-914`) |
| AC4 | the same crater | it is carved on host and peer | both masks are byte-identical after `applySnapshot` (`TC-CORE-040`) |
| AC5 | a unit is fully buried by terrain | movement is resolved | it can still fire but cannot move until the terrain is opened (`TC-CORE-904`) |
| AC6 | a `piercing` shot | it crosses the mask | it ignores terrain until it hits a unit (`TC-CORE-913`) |

## 4. Contract

```ts
export interface Terrain { width: number; height: number; mask: Uint8Array }   // 1 = solid
export function collides(t: Terrain, x: number, y: number): boolean;
export function carve(t: Terrain, blast: { x: number; y: number; radius: number }): Terrain;
export function groundAt(t: Terrain, x: number): number;
export function encodeTerrain(t: Terrain): Uint8Array;   // RLE, ≤2 KB at 2000×1200
```

## 5. Rules and edge cases

- Terrain is RLE-encoded inside the snapshot only when it changed since the last acknowledged snapshot.
- Carving is idempotent: applying the same blast twice yields the same mask.
- Falling damage is not modelled in v1 (`OQ-02`).

## 6. Implementation notes

- `packages/core/src/terrain/{mask,carve,encode}.ts`; a coarse 4 px grid keeps carving under 1 ms.

## 7. Out of scope

Destructible props, water, wind-blown terrain.

## 8. Test notes

`TC-CORE-914`, `TC-CORE-040`, `TC-CORE-904`, `TC-CORE-913`.
`Red first: packages/core/tests/terrain.test.ts::blast_removes_circle_and_regrounds_unit`.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**done.** the engine rule is implemented in `packages/core/src` and covered by `packages/core/tests/` (ballistics, combat, match, snapshot, data, room, rating, camera)
