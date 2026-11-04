---
id: US-CORE-011
title: Apply the per-map stage gimmicks
epic: EPIC-03-match-core
status: ready
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
| AC3 | a map with `electric` | every third turn starts | a random cell is struck for 15 damage with a visible marker (`TC-CORE-919`) |
| AC4 | a map with `wind` | a turn starts | wind re-rolls twice and the second value is the one used (`TC-CORE-023`) |
| AC5 | a map with `return` | a shot leaves the map | it returns once with reduced power instead of despawning (`TC-CORE-913`) |
| AC6 | a map with `heal` | a unit stands in the heal zone at turn start | it regains 10 HP, capped at `maxHp` (`TC-CORE-919`) |
| AC7 | a map with `fog` | the match renders | aim arc is shortened and blast markers hidden, unit positions still visible (`TC-MATCH-901`) |
| AC8 | a map with a tornado spawn | a turn starts | units within its radius move 60 px, never into terrain (`TC-CORE-919`) |

## 4. Contract

```ts
export type Gimmick = 'force'|'gust'|'electric'|'wind'|'return'|'heal'|'fog';
export interface Stage { mapId: string; gravity: number; windRange: number; gimmicks: Gimmick[];
  healZones?: Array<{ x: number; y: number; r: number }>; tornado?: { x: number; y: number; r: number } }
export function applyTurnGimmicks(state: MatchState, stage: Stage, rng: Rng): MatchState;
```

## 5. Rules and edge cases

- Gimmicks are deterministic per seed so host and peers agree (`TC-CORE-040`).
- `return` never returns twice; a second exit despawns.
- `fog` is presentation only — it must not change state, so a peer with fog off still agrees.

## 6. Implementation notes

- `packages/core/src/stages/{gimmicks.ts,apply.ts}`; each gimmick is a pure `(state) => state` function.

## 7. Out of scope

New gimmicks, per-mode gimmick rules, animated weather visuals (`US-MATCH-001`).

## 8. Test notes

`TC-CORE-918`, `TC-CORE-919`, `TC-CORE-913`, `TC-CORE-023`, `TC-MATCH-901`.
`Red first: tests/core/gimmicks.test.ts::electric_strikes_on_every_third_turn`.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**done.** the engine rule is implemented in `packages/core/src` and covered by `packages/core/tests/` (ballistics, combat, match, snapshot, data, room, rating, camera)
