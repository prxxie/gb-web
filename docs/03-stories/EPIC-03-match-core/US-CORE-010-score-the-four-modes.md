---
id: US-CORE-010
title: Score the four game modes
epic: EPIC-03-match-core
status: done
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
| AC6 | any mode | a match ends | the result screen names the mode and the win condition used (`TC-CORE-962`, browser-verified) |
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

`TC-CORE-027`, `TC-CORE-915`, `TC-CORE-916`, `TC-CORE-917`, `TC-CORE-961`, `TC-CORE-962`.
Red: none — the rule was already implemented and green; this pass added the cases the ACs cited and corrected the citations that pointed at another story's case (see the delivery note at the end of this file).

<!-- delivery:2026-11-06 -->

## Delivery status — 2026-11-06

**done.** Every acceptance criterion is proven by a case this file can name.

Verified: `packages/core/tests/modes.test.ts` — `TC-CORE-915` (score mode reaches the 12-turn cap and the higher damage
total wins), `TC-CORE-916` (tag flips `activeTeam` to the opposing team), `TC-CORE-917` (a jewel is carried, then
transferred on a kill; all jewels on one team wins immediately), `TC-CORE-961` (mode `solo`, one team wiped, the match
ends and the surviving team wins); `packages/core/tests/combat.test.ts` `TC-CORE-027` (the same rule at the engine's
door); `apps/worker/tests/rooms.test.ts` `TC-ROOM-205` (a mode outside the four is a 422 naming `mode`) and
`TC-CORE-016` (a `room_settings` frame with `mode: royale` or `mapId: map-99` is refused `bad-request`).
The screen-level half of AC6 — a *real* match reaching the result screen — has no automated case: `TC-RANK-153` in
`tests/e2e/smoke.spec.ts` opens `/results/ABCD23` cold and asserts the redirect back to `/`, which is the opposite
claim, and `tests/e2e/results.spec.ts` (still cited in `docs/02-reference/screens/results.md`) does not exist. The
evidence is the browser walk recorded below instead.

AC6 was the one criterion with no implementation behind it, and it is now built rather than cited:
`apps/web/src/lib/outcome.ts` reads the condition back out of the finished state with the same rules
`conclusionOf` (`packages/core/src/match.ts:260`) used — a wipe ends any mode, the score cap decides a score match that
nobody won by elimination, a jewel match ends only when one team holds every jewel — and `apps/web/tests/outcome.test.tsx` `TC-CORE-962` pins the rules and the rendered line in both languages, and
`apps/web/tests/results-outcome.test.tsx` `TC-CORE-962` renders `ResultsPage` and asserts the line it prints — with the
condition, and for a payload written before the field existed. The match screen writes the
condition into the result payload (`winConditionOf(final)` in `finish`), and the result screen prints
`data-testid="result-outcome"` under the banner.

Red: none — `apps/web/src/lib/outcome.ts` was written with its case in the same pass; the first run was green.

Walked in the browser (Chrome DevTools MCP, 844 × 390 landscape, `http://localhost:5273/results/AAAAAA` after seeding a
`score`/`score-cap` payload): the banner reads `Đội A thắng` and the line under it reads
`Chế độ Điểm số — thắng bằng: nhiều sát thương hơn khi hết số lượt`; `scrollWidth` 844. Screenshot:
`docs/05-quality/evidence/US-CORE-010/ac6-result-screen-844x390.png`.
