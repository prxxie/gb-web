---
id: US-CORE-009
title: Apply the eleven item effects
epic: EPIC-03-match-core
status: done
priority: P1
size: L
depends_on: [US-CORE-003, US-CORE-008]
open_questions: []
accepted_assumptions: [OQ-19, OQ-37]
refs: [02-reference/gameplay/tunables.md, 02-reference/data/mobiles.md]
---

# US-CORE-009 — Apply the eleven item effects

## 1. Story

As a player, I want to spend items on my turn, so that a match has the tactical layer GunBound's items provide.

## 2. Context

GunBound resolves item effects server-side and only ships the ownership mask to the client ``; we have
no referee, so the **host** applies them and replicates the result (`OQ-30`). Each item carries a `delayCost`, which is
what makes items a trade rather than free power.

| Topic | Reference |
|---|---|
| Item table | [`02-reference/data/items.md`](../../02-reference/data/items.md) |
| Delay costs | [`02-reference/gameplay/tunables.md`](../../02-reference/gameplay/tunables.md) § 3 |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|---|---|---|
| AC1 | a player with one Dual | they use it and fire | two projectiles leave in one turn, the second is locked to the same weapon (`dualWeapon`), and a second item while the pair is open is rejected `dual-in-progress` (`TC-CORE-906`) |
| AC2 | Blood then a shot | damage resolves | damage is +25 % and the buff is cleared afterwards (`TC-CORE-906`) |
| AC3 | Energy up 2 | movement is attempted | the turn's energy budget is +60 and the delay gains `+10` (`TC-CORE-907`) |
| AC4 | Change Wind | it is used | the wind vector is re-rolled, broadcast in the snapshot and shown in the HUD (`TC-CORE-908`) |
| AC5 | Teleport / Team Teleport | they are used | the caster (or the whole team) moves and the position respects terrain bounds (`TC-CORE-909`) |
| AC6 | Bunge shot | it is fired | once its turn timer passes it decelerates and is pulled home, detonating on the return leg (`TC-CORE-910`) |
| AC7 | Thunder | it is used | a horizontal band at the aim point is struck for its listed damage (`TC-CORE-911`) |
| AC8 | a player with zero of an item | they try to use it | the action is rejected and no delay is charged (`TC-CORE-932`) |
| AC9 | any item | it is used | its `delayCost` is added to the queue before the next player is chosen (`TC-CORE-901`) |

## 4. Contract

```ts
export type ItemId = 'itm-dual'|'itm-blood'|'itm-energy-2'|'itm-energy-1'|'itm-dual-plus'|'itm-change-wind'
  |'itm-team-teleport'|'itm-bunge'|'itm-power-up'|'itm-thunder'|'itm-teleport';
export interface ItemEffect { kind: string; apply(state: MatchState, slot: number, ctx: EffectCtx): MatchState }
export function useItem(state: MatchState, slot: number, item: ItemId): { state: MatchState; ok: boolean; reason?: string };
```

## 5. Rules and edge cases

- One item per turn, except Dual/Dual+ which force a second shot instead of a second item (`TC-CORE-906`).
- Effects are applied in the order used; Dual sets a flag consumed by the next fire.
- `itm-team-teleport` moves only living team mates and never into terrain.
- The host re-validates ownership from its own state before applying (`TC-NET-067`).

## 6. Implementation notes

- `packages/core/src/items/{effects.ts,registry.ts}`; one small function per item, no switch in the reducer.
- Item icons/strings come from `apps/web/src/i18n`.

## 7. Out of scope

Purchasing, inventory persistence across matches (`OQ-20`), item combos.

## 8. Test notes

`TC-CORE-906`, `TC-CORE-907`, `TC-CORE-908`, `TC-CORE-909`, `TC-CORE-910`, `TC-CORE-911`, `TC-CORE-901`, `TC-NET-067`.
Red: none — the rule was already implemented and green; this pass added the cases the ACs cited and corrected the citations that pointed at another story's case (see the delivery note at the end of this file).

<!-- delivery:2026-11-06 -->

## Delivery status — 2026-11-06

**done.** `packages/core/tests/items.test.ts` — `TC-CORE-906` (Dual keeps the turn and fires twice on the same weapon, a
second item between the pair is refused, Blood and Power up add 33 % damage for one shot — a multiplier on damage, never
on the bar (`data/items.md`, `TC-CORE-906`)),
`TC-CORE-907` (Energy up 1/2 add 30/60 and charge 5/10 delay), `TC-CORE-908` (Change Wind re-rolls and announces),
`TC-CORE-909` (Teleport moves 150 px inside the map, Team Teleport gathers the team within 40 px, neither touches the
turn), `TC-CORE-910` (Bunge returns the shell to the caster), `TC-CORE-911` (Thunder strikes the band at the aim and
spares the rest), `TC-CORE-932` (an item the player does not own is refused without charging delay), and
`packages/core/tests/turn-queue.test.ts` `TC-CORE-901` (the delay cost lands in the queue before the next player is
chosen).

This pass added `TC-CORE-953` (an item's delay cost is charged before the next player is chosen).
