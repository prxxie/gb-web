---
id: US-CORE-010
title: Score the four game modes
epic: EPIC-03-match-core
status: ready
priority: P1
size: M
depends_on: [US-CORE-003]
open_questions: []
accepted_assumptions: [OQ-19, OQ-37]
refs: [02-reference/gameplay/tunables.md, 02-reference/data/mobiles.md]
---

# US-CORE-010 — Score the four game modes

## 1. Story

As a host, I want to pick Solo, Score, Tag or Jewel, so that a room can play the way GunBound rooms play.

## 2. Context

GunBound's room `info` bits 16–17 carry the mode, `0–3` = Solo / Score / Tag / Jewel, with Jewel confirmed by the renderer
``. Each mode is a different win condition over the same combat model.

| Topic | Reference |
|---|---|
| Modes | [`02-reference/gameplay/tunables.md`](../../02-reference/gameplay/tunables.md) § 5 |
| Mode in the room | [`02-reference/data/room-state.md`](../../02-reference/data/room-state.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|---|---|---|
| AC1 | mode `solo` | one team is fully eliminated | the match ends and that team loses (`TC-CORE-027`) |
| AC2 | mode `score`, round cap 12 turns each | the cap is reached | the team with the higher damage total wins (`TC-CORE-915`) |
| AC3 | mode `tag` | a turn ends | the whole opposing team becomes active and `activeTeam` flips (`TC-CORE-916`) |
| AC4 | mode `jewel` | a unit walks over a jewel | it is carried, and a kill transfers the victim's jewels to the killer's team (`TC-CORE-917`) |
| AC5 | mode `jewel`, all jewels held by one team | the state resolves | that team wins immediately (`TC-CORE-917`) |
| AC6 | any mode | a match ends | the result screen names the mode and the win condition used (`TC-RANK-153`) |
| AC7 | a mode not in `0–3` | the room state is loaded | it is rejected at the boundary (`TC-ROOM-120`) |

## 4. Contract

```ts
export type ModeId = 'solo' | 'score' | 'tag' | 'jewel';
export interface ModeRules { id: ModeId; turnCap?: number; win(state: MatchState): 'A'|'B'|null;
  onKill?(state: MatchState, killer: number, victim: number): MatchState }
export function modeFor(id: ModeId): ModeRules;
```

## 5. Rules and edge cases

- Draws resolve to the shooter only when no mode rule decides (`TC-RANK-155` stays authoritative).
- Score mode still allows elimination to end early.
- Jewel positions are part of `modeState` in the snapshot (`US-CORE-004`).

## 6. Implementation notes

- `packages/core/src/modes/{solo,score,tag,jewel}.ts`, one file each; `modeFor` is a lookup table.

## 7. Out of scope

Mode-specific maps, tournaments, ranked per mode (`OQ-28` keeps one Elo).

## 8. Test notes

`TC-CORE-027`, `TC-CORE-915`, `TC-CORE-916`, `TC-CORE-917`, `TC-RANK-153`, `TC-RANK-155`.
`Red first: packages/core/tests/modes.test.ts::jewel_win_when_one_team_holds_all`.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**done.** the engine rule is implemented in `packages/core/src` and covered by `packages/core/tests/` (ballistics, combat, match, snapshot, data, room, rating, camera)
