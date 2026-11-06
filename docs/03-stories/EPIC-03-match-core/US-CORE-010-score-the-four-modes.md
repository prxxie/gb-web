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
Red: none — the rule was already implemented and green; this pass added the cases the ACs cited and corrected the citations that pointed at another story's case (see the delivery note at the end of this file).

<!-- delivery:2026-11-06 -->

## Delivery status — 2026-11-06

**ready** — one acceptance criterion is not met, and it is a client gap rather than a test gap.

Verified: `packages/core/tests/modes.test.ts` — `TC-CORE-915` (score mode reaches the 12-turn cap and the higher damage
total wins), `TC-CORE-916` (tag flips `activeTeam` to the opposing team, and the team-queue rule in `turn-queue.test.ts`
shows it), `TC-CORE-917` (a jewel is carried, then transferred on a kill; all jewels on one team wins immediately);
`packages/core/tests/combat.test.ts` `TC-CORE-027` (solo ends when a team is fully eliminated);
`apps/worker/tests/rooms.test.ts` `TC-ROOM-205` (a mode outside the four is a 422 naming `mode`);
`tests/e2e/smoke.spec.ts` `TC-RANK-153` (a finished match lands on the result screen).

Open: **AC6** — "the result screen names the mode and the win condition used". `apps/web/src/routes/ResultsPage.tsx`
carries `mode` and `winnerTeam` in its payload (lines 16-17, 69-70) but renders only the winner banner, the ranked line and
the per-player table; the mode and the win condition are not shown at all. That is a UI change with its own i18n keys
(`results.*`) and e2e coverage, so the story stays `ready` instead of claiming the criterion.

This pass added `TC-CORE-961` (solo ends when a team is wiped) to the existing `TC-CORE-915`/`916`/`917`.
