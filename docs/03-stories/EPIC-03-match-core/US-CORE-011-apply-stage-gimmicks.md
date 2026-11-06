---
id: US-CORE-011
title: Apply the per-map stage gimmicks
epic: EPIC-03-match-core
status: done
priority: P1
size: L
depends_on: [US-CORE-001, US-CORE-006]
open_questions: []
accepted_assumptions: [OQ-19, OQ-37]
refs: [02-reference/gameplay/tunables.md, 02-reference/data/mobiles.md]
---

# US-CORE-011 — Apply the per-map stage gimmicks

## 1. Story

As a player, I want maps to behave differently, so that a map is a tactical choice and not a backdrop.

## 2. Context

`stage.dat` toggles per-stage modifiers — **Force / Gust / Electric / Wind / Return / Heal / Fog** — plus a tornado spawn
location ``. They run on top of map gravity and wind range.

| Topic | Reference |
|---|---|
| Gimmick table | [`02-reference/gameplay/tunables.md`](../../02-reference/gameplay/tunables.md) § 6 |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|---|---|---|
| AC1 | a map with `force` | a projectile flies | it is pushed sideways by the constant field and the HUD announces it (`TC-CORE-918`) |
| AC2 | a map with `gust` | a 4× wind spike is scheduled | the spike is applied for one turn, announced, then reverted (`TC-CORE-918`) |
| AC3 | a map with `electric` | every third turn starts | a random cell is struck for 150 damage with a visible marker (`TC-CORE-919`) |
| AC4 | a map with `wind` | a turn starts | wind re-rolls twice and the second value is the one used (`TC-CORE-023`) |
| AC5 | a map with `return` | a shot leaves the map | it returns once with reduced power instead of despawning (`TC-CORE-913`) |
| AC6 | a map with `heal` | a unit stands in the heal zone at turn start | it regains 100 HP, capped at `maxHp` (`TC-CORE-919`) |
| AC7 | a map with `fog` | the match renders | aim arc is shortened and blast markers hidden, unit positions still visible (`TC-CORE-931`) |
| AC8 | a map with a tornado spawn | a turn starts | units within its radius move 60 px, never into terrain (`TC-CORE-919`) |

## 4. Contract

```ts
export type Gimmick = "force" | "gust" | "electric" | "wind" | "return" | "heal" | "fog" | "tornado";
export interface GimmickEvent { round: number; kind: Gimmick | "tornado"; amount: number; magnitude?: number }
export interface GimmickEffect { state: MatchState; events: readonly GimmickEvent[] }
export function applyGimmicks(state: MatchState, round: number, map: MapDef): GimmickEffect;
export function visibilityMultiplier(map: MapDef): number;   // `fog` — 0.5, otherwise 1
export function returnsOffMapShots(map: MapDef): boolean;    // `return`
```

The magnitudes are exported constants (`FORCE_FIELD`, `GUST_FACTOR`, `ELECTRIC_EVERY`, `ELECTRIC_DAMAGE`,
`HEAL_AMOUNT`, `TORNADO_PUSH`) so `tunables.md` § 6 and the code cannot drift.

## 5. Rules and edge cases

- Gimmicks are deterministic per seed so host and peers agree (`TC-CORE-040`).
- `return` never returns twice; a second exit despawns.
- `fog` is presentation only — it must not change state, so a peer with fog off still agrees.

## 6. Implementation notes

- `packages/core/src/gimmicks.ts`; one `applyGimmicks` pass per round, each branch a pure edit of the state it is
  given, and `packages/core/src/match.ts` only reacts to the events it returns.

## 7. Out of scope

New gimmicks, per-mode gimmick rules, animated weather visuals (`US-MATCH-001`).

## 8. Test notes

`TC-CORE-918`, `TC-CORE-919`, `TC-CORE-955`, `TC-CORE-023`, `TC-MATCH-901`.
Red: none — the rule was already implemented and green; this pass added the cases the ACs cited and corrected the citations that pointed at another story's case (see the delivery note at the end of this file).

<!-- delivery:2026-11-06 -->

## Delivery status — 2026-11-06

**done.** `packages/core/tests/gimmicks.test.ts` — `TC-CORE-918` (a force map pushes shells and announces the field; the
gust spike lasts exactly one turn and is reverted; a wind map rolls twice and plays the second roll), `TC-CORE-919`
(electric strikes every third turn for 150, the heal zone restores 100 capped at `maxHp`, a tornado displaces its units by
60 px without burying them), `TC-CORE-023` (the per-round wind roll), `TC-CORE-913` (a return map sends an off-map shot
back), `TC-CORE-931` (fog shortens the aim arc and hides the blast markers without hiding units).

This pass added `TC-CORE-955` (a `return` map brings the shell back); `TC-CORE-918` now also carries AC4 and `TC-CORE-919` AC8.
