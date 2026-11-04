---
id: US-CORE-007
title: Load mobile stats and resolve the three weapon slots
epic: EPIC-03-match-core
status: ready
priority: P0
size: M
depends_on: [US-FND-001]
open_questions: []
accepted_assumptions: [OQ-19, OQ-37]
refs: [02-reference/gameplay/tunables.md, 02-reference/data/mobiles.md, 02-reference/data/room-state.md]
---

# US-CORE-007 — Load mobile stats and resolve the three weapon slots

## 1. Story

As a player, I want each mobile to feel different, so that picking one is a real decision like it is in GunBound.

## 2. Context

GunBound gives every mobile HP, shield, regen, energy, a firing envelope, movement limits, a base delay, a defense stat
and **three weapon slots** (shot 1, shot 2, super shot) ``. Our data table is
`docs/02-reference/data/mobiles.md`; the runtime copy is `packages/core/src/data/mobiles.ts`.

| Topic | Reference |
|---|---|
| Mobile table | [`02-reference/data/mobiles.md`](../../02-reference/data/mobiles.md) |
| Shot classes | [`02-reference/gameplay/tunables.md`](../../02-reference/gameplay/tunables.md) § 4 |
| Ruleset version | [`01-overview/nonfunctional-requirements.md`](../../01-overview/nonfunctional-requirements.md) (NFR-23) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|---|---|---|
| AC1 | the twenty mobile records | they are loaded | every record validates against the schema and the clamps in `data/mobiles.md` (`TC-CORE-905`) |
| AC2 | a mobile with three weapons | a `weaponSlot` is selected | the matching weapon's class, power and radius are used, and the shot flies with **the mobile's** `gravity` and `mass` (`TC-CORE-912`, `TC-CORE-925`) |
| AC3 | the super shot | it is used once | it cannot be selected again and the slot reports empty (`TC-CORE-922`) |
| AC4 | a data file with an out-of-range value | it is loaded | the loader throws at build time, not at runtime (`TC-FND-002`) |
| AC5 | a `rulesetVersion` bump | the client boots | the version is read from the data bundle and sent in the snapshot (`TC-CORE-040`) |
| AC6 | two players pick the same mobile | the match starts | it is allowed; nothing in the rules keys on `mobileId` (`TC-ROOM-148`) |
| AC7 | every mobile's `gravity` and `mass` | each fires at its `maxPower` on a flat probe map | the landing distance and hang time match the simulated table in `data/mobiles.md` § 4 within ±1 unit (`TC-CORE-924`) |
| AC8 | `maxHp 1050`, `maxShield 150`, `power 240` | the record is loaded | values are accepted as-is on the 1,000 scale, and the loader rejects an `maxHp` outside `900–1200` (`TC-CORE-905`) |

## 4. Contract

```ts
export interface Mobile {
  mobileId: string; name: { vi: string; en: string };
  gravity: number; mass: number;              // 84–128 u/s², 118–169 — the per-mobile physics pair, § 1.1
  maxHp: number; maxShield: number; shieldRegen: number; energy: number;
  bodyWidth: number; bodyHeight: number;
  trajectory: 'standard'|'direct'|'lobber'|'mortar'|'skimmer';
  angleMin: number; angleMax: number; maxPower: number;   // this mobile's own aim window
  moveDistance: number; maxMovesPerTurn: 1 | 2; runMultiplier: number;
  moveEnergy: number; moveDelay: number; maxIncline: number;
  baseDelay: number; defense: number;
  weapons: [Weapon, Weapon, Weapon]; effect: 'explosion'|'laser'|'impact'|'electric';
}
export function loadMobiles(raw: unknown): Mobile[];
```

Requirements: `NFR-29`.

## 5. Rules and edge cases

- Balance edits touch JSON only; a `rulesetVersion` bump makes in-flight ranked matches unranked.
- `angleMin > angleMax` is a load error, never silently swapped — and so is an `angleMin`/`angleMax` that falls outside the
  mobile's trajectory-profile band (`tunables.md` § 4.2).
- `gravity` and `mass` are the *only* physics numbers a mobile carries: `Weapon` has no `density`, because GB has neither
  drag nor a per-shell mass (`reference-gunbound.md` § 10).
- Super shot availability lives in match state (`weaponsLeft[2]`), not in the record.

## 6. Implementation notes

- `packages/core/src/data/{mobiles.json,load.ts}`; a `schema.ts` validator also used by the worker (`US-FND-002`).
- Names in `mobiles.md` are ours; GunBound's are not used (`OQ-18`).

## 7. Out of scope

Balance tuning beyond the ±10 % within-archetype band, more than twenty mobiles, avatar-parts rendering.

## 8. Test notes

`TC-CORE-905`, `TC-CORE-912`, `TC-CORE-922`, `TC-CORE-924`, `TC-CORE-923`, `TC-FND-002`.
`Red first: tests/core/mobiles.test.ts::invalid_angle_range_throws`.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**done.** the engine rule is implemented in `packages/core/src` and covered by `packages/core/tests/` (ballistics, combat, match, snapshot, data, room, rating, camera)
