---
id: US-CORE-008
title: Move with energy, distance and incline limits
epic: EPIC-03-match-core
status: ready
priority: P1
size: M
depends_on: [US-CORE-006, US-CORE-007]
open_questions: []
accepted_assumptions: [OQ-19, OQ-37]
refs: [02-reference/gameplay/tunables.md, 02-reference/data/mobiles.md]
---

# US-CORE-008 — Move with energy, distance and incline limits

## 1. Story

As a player, I want to reposition during my turn and pay for it, so that movement is a tactical cost like in GunBound.

## 2. Context

GunBound passes movement as action `0xc304`: a 4-bit direction plus an `&0x10` running flag, bounded by the mobile's move
distance and max incline and paid out of its Energy ``
``. Movement is not free — it also adds `moveDelay` to the queue.

| Topic | Reference |
|---|---|
| Mobile movement stats | [`02-reference/data/mobiles.md`](../../02-reference/data/mobiles.md) |
| Delay costs | [`02-reference/gameplay/tunables.md`](../../02-reference/gameplay/tunables.md) § 3 |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|---|---|---|
| AC1 | `mbl-01` (`moveDistance 88`, `energy 105`, `moveEnergy 12`, `moveDelay +12`, one move per turn) | it walks once and fires | energy drops by 12, the queue gains +12, and a second move in the same turn is refused (`TC-CORE-904`) |
| AC2 | `energy 5` on a mobile whose walk costs 12 | a move is attempted | it is refused with reason `energy`, and at `energy 0` the mobile is a fixed turret (`TC-CORE-904`) |
| AC3 | a slope steeper than `maxIncline` | the unit tries to climb | it stops at the slope and cannot pass (`TC-CORE-904`) |
| AC4 | a unit at the map edge | it runs outward | it stops at the bound and keeps its remaining energy (`TC-CORE-904`) |
| AC7 | `mbl-13` Cinder Fox (`maxMovesPerTurn 2`, `runMultiplier 1.9`, `moveEnergy 8`) | it walks twice, then runs | two walks are allowed, the run covers `110 × 1.9 = 209 px` for 16 energy, and a third action is refused (`TC-CORE-904`) |
| AC8 | two mobiles with different `moveDistance` | each walks once at full energy | the distance covered equals the mobile's own `moveDistance`, never a global constant (`TC-CORE-904`) |
| AC5 | a crater opens under the walking unit | movement continues | the unit falls to the new ground instead of floating (`TC-CORE-914`) |
| AC6 | a move message from a peer that is not the active player | it arrives | it is rejected (`TC-NET-067`) |

## 4. Contract

```ts
export interface Move { direction: 0|1|2|3; run: boolean; distancePx: number }
export function canMove(state: MatchState, slot: number, move: Move): { ok: boolean; reason?: 'energy'|'incline'|'bounds' };
export function applyMove(state: MatchState, slot: number, move: Move): MatchState;   // debits energy + moveDelay
```

## 5. Rules and edge cases

- Movement is per turn, not per second: a turn allows `maxMovesPerTurn` actions, each covering `moveDistance` px (or
  `moveDistance × runMultiplier` for a run, at double `moveEnergy`), and each adding `moveDelay` to the queue.
- Every limit is the mobile's own: distance, action count, run multiplier, energy cost, climb and delay (`data/mobiles.md` § 2).
- Energy never regenerates in v1 (GunBound refills per match, not per turn).
- Moving does not consume the shot; a player may move, then fire, then the turn ends.

## 6. Implementation notes

- `packages/core/src/move/{walk,limits}.ts`; ground lookup comes from `terrain.groundAt`.

## 7. Out of scope

Jumping/flying mobiles, mountables, movement animation timing (`US-MATCH-006`).

## 8. Test notes

`TC-CORE-904`, `TC-CORE-914`, `TC-NET-067`.
`Red first: tests/core/move.test.ts::energy_clamps_distance`.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**done.** the engine rule is implemented in `packages/core/src` and covered by `packages/core/tests/` (ballistics, combat, match, snapshot, data, room, rating, camera)
