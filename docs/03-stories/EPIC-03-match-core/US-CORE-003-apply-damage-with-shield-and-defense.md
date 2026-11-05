---
id: US-CORE-003
title: Apply damage with shield, defense and blast tiers
epic: EPIC-03-match-core
status: ready
priority: P0
size: M
depends_on: [US-CORE-001]
open_questions: []
accepted_assumptions: [OQ-19, OQ-37]
refs: [02-reference/gameplay/tunables.md, 02-reference/gameplay/reference-gunbound.md, 02-reference/data/mobiles.md]
---

# US-CORE-003 — Apply damage with shield, defense and blast tiers

## 1. Story

As a player, I want a blast to hit harder at its centre and to chew through shield before health, so that positioning
and shot choice matter the way they do in GunBound.

## 2. Context

GunBound's `ApplyBlastDamage` (`0x0043af40`) clamps the blast to the terrain, tests every player against it, writes the
guarded health fields and triggers the `"shock"` reaction ``. Mobiles carry HP, shield, shield regen and
a defense stat, and every weapon has Inner/Mid/Outer power tiers ``.

| Topic | Reference |
|---|---|
| Health model | [`02-reference/gameplay/tunables.md`](../../02-reference/gameplay/tunables.md) § 2 |
| Mobile stats | [`02-reference/data/mobiles.md`](../../02-reference/data/mobiles.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|---|---|---|
| AC1 | a weapon with `radius 80`, power 400 | a unit stands at distance 20 / 50 / 90 | it takes 400 (Inner), 240 (Mid), 120 (Outer) and 0 beyond the radius (`TC-CORE-024`) |
| AC2 | a target with `shield 300`, `maxHp 1200` and `defense 1.15` | a 500-power hit lands at Inner | total is `round(500 / 1.15) = 435`: 300 leaves the shield, 135 leaves HP (`TC-CORE-903`) |
| AC3 | a mobile with `shieldRegen 40` | its turn starts | shield rises by 40, capped at `maxShield` (`TC-CORE-905`) |
| AC4 | a unit at `hp 100` takes 435 | the blast resolves | HP floors at 0 and the unit becomes `eliminated` (`TC-CORE-025`) |
| AC5 | a team mate stands in the blast | it is fired | they take damage too — friendly fire is on (`TC-CORE-027`) |
| AC6 | all units of a team are eliminated | damage resolves | the match ends with the other team as `winner` (`TC-CORE-027`) |
| AC7 | a mobile has an `electric` effect type | it fires | the resolved damage is unchanged but the effect is `electric` in the snapshot (`TC-CORE-912`) |

## 4. Contract

```ts
export interface BlastTiers { inner: number; mid: number; outer: number }   // radius fractions + power multipliers
export interface DamageEvent { target: number; shieldLost: number; hpLost: number; eliminated: boolean }

export function resolveBlast(blast: { x: number; y: number; power: number; radius: number; tiers: BlastTiers },
                             units: Unit[], mobiles: Mobile[]): DamageEvent[];
```

Damage per target: `power * tierMultiplier * (1 - dist/(tierRadius))` … collapsed to the tier multiplier, then
`* (1 / defense)`, rounded to 1, floored at 0.

## 5. Rules and edge cases

- A blast on a unit at the exact radius edge deals 0 but still counts as a hit for stats (`TC-RANK-110`).
- Shield never regenerates above `maxShield` and never absorbs more than it holds (`TC-CORE-903`).
- Damage totals are summed per player for `match_player.damage_dealt` (`TC-RANK-110`).
- The host resolves damage; peers apply it from the snapshot, never recompute (`US-NET-002`).

## 6. Implementation notes

- `packages/core/src/combat/{blast,health}.ts`; tiers read from the weapon record, not hard-coded.
- `DamageEvent[]` is what the snapshot carries, so the UI never recomputes numbers.

## 7. Out of scope

Modes with their own scoring ([`US-CORE-010`](US-CORE-010-score-the-four-modes.md)); avatar bonuses
([`US-CORE-013`](US-CORE-013-apply-avatar-stat-bonuses.md)).

## 8. Test notes

`TC-CORE-024`, `TC-CORE-025`, `TC-CORE-026`, `TC-CORE-027`, `TC-CORE-903`, `TC-CORE-905`, `TC-CORE-912`.
`Red first: packages/core/tests/combat.test.ts::inner_tier_hurts_more_than_outer`.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**done.** the engine rule is implemented in `packages/core/src` and covered by `packages/core/tests/` (ballistics, combat, match, snapshot, data, room, rating, camera)
