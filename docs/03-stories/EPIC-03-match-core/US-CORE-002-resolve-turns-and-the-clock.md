---
id: US-CORE-002
title: Resolve turns with the delay queue
epic: EPIC-03-match-core
status: done
priority: P0
size: M
depends_on: [US-FND-001]
open_questions: []
accepted_assumptions: [OQ-19, OQ-37]
refs: [02-reference/gameplay/tunables.md, 02-reference/gameplay/reference-gunbound.md, 02-reference/data/mobiles.md]
---

# US-CORE-002 — Resolve turns with the delay queue

## 1. Story

As a competitive player, I want turn order to depend on what each player spends, so that lighter weapons buy me turns —
the way GunBound's delay works.

## 2. Context

GunBound sorts the next player by **accumulated delay**: a base delay per mobile plus a delay term per weapon and per
item, re-sorted after every action ``. Our earlier design alternated teams, which is
not GunBound.

| Topic | Reference |
|---|---|
| Turn fields | [`02-reference/data/room-state.md`](../../02-reference/data/room-state.md) |
| Delay tunables | [`02-reference/gameplay/tunables.md`](../../02-reference/gameplay/tunables.md) § 3 |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|---|---|---|
| AC1 | four players, all `baseDelay 100` | a turn ends | the next active slot has the lowest accumulated delay, ties broken by slot index (`TC-CORE-901`) |
| AC2 | player 3 fires the super shot (`weaponDelay 200`) | the queue is re-sorted | player 3's accumulated delay is 200 higher and they are pushed behind the others (`TC-CORE-901`) |
| AC3 | an item with `delayCost 40` is used | the turn ends | the cost is added before sorting, so an item can cost a future turn (`TC-CORE-901`) |
| AC4 | the active player never acts within `turnDurationMs + turnGraceMs` | the clock expires | the turn is auto-skipped and the queue advances exactly once (`TC-CORE-152`) |
| AC5 | two `input` messages with `seq 5` and `seq 6` arrive out of order | they are applied | only `seq 6` counts (alias, last-`seq`-wins) (`TC-CORE-045`) |
| AC6 | an eliminated player | the queue is built | they are skipped but keep their accumulated delay (`TC-CORE-027`) |
| AC7 | the match record is written | it is inspected | it stores the delay table that produced the order (`TC-RANK-110`) |

## 4. Contract

```ts
export interface TurnQueue { delays: number[]; order: number[]; activeSlot: number; number: number }
export function initQueue(mobiles: Mobile[]): TurnQueue;          // delays = baseDelay
export function addDelay(q: TurnQueue, slot: number, cost: number): TurnQueue;
export function nextSlot(q: TurnQueue, alive: boolean[]): TurnQueue;
export function resolveTurn(q: TurnQueue, action: { kind: 'fire'|'skip'|'move'|'item'; cost: number },
                            alive: boolean[]): TurnQueue;
export function turnClock(durationMs: number, graceMs: number): { deadlineAt: number; extended: boolean };
```

## 5. Rules and edge cases

- The queue is part of `RoomState`, so it survives host migration inside `lastSnapshot` (`US-CORE-004`).
- A disconnect does not remove a player's delay; a forfeit does (`US-ROOM-004`).
- The **20 s** clock is the client's own call (`OQ-03`), shorter than GunBound's 60 s so a 4v4 round stays inside a
  session; the roster still shows both delay values like GunBound does.
- Never re-order on the client: the host sorts and broadcasts (`US-NET-002`).

## 6. Implementation notes

- `packages/core/src/turn/{queue,clock}.ts`; `TurnQueue` is plain data so snapshots stay under budget.
- The roster shows `Math.round(delay / 10)` — absolute for the active player, signed relative for the rest.

## 7. Out of scope

Movement cost ([`US-CORE-008`](US-CORE-008-move-with-energy.md)), item effects
([`US-CORE-009`](US-CORE-009-apply-item-effects.md)).

## 8. Test notes

`TC-CORE-901`, `TC-CORE-152`, `TC-CORE-045`, `TC-CORE-027`, `TC-RANK-110`.
Red: `packages/core/tests/protocol.test.ts` — the `TC-CORE-937` cases were written first and failed with
`match_end does not accept "delayTable"` until the parser took the table and the frame allowlist allowed it; the
worker half of the same case failed on `201` where it expected `422` because the field was validated after
`field.done()`.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**done.** the engine rule is implemented in `packages/core/src` and covered by `packages/core/tests/` (ballistics, combat, match, snapshot, data, room, rating, camera)
