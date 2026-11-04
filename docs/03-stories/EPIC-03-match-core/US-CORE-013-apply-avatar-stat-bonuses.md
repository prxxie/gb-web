---
id: US-CORE-013
title: Apply avatar stat bonuses
epic: EPIC-03-match-core
status: ready
priority: P2
size: S
depends_on: [US-CORE-007, US-AUTH-003]
open_questions: []
accepted_assumptions: [OQ-19, OQ-37]
refs: [02-reference/gameplay/tunables.md, 02-reference/data/mobiles.md]
---

# US-CORE-013 — Apply avatar stat bonuses

## 1. Story

As a registered player, I want my equipped avatar to change my stats, so that collecting parts matters the way it does in
GunBound.

## 2. Context

In GunBound, worn avatar parts carry stat bonuses (`ApplyAvatarStatBonuses`)
``. v1 included avatars as cosmetics; option B
makes them gameplay-affecting, capped so a cosmetic gap never decides a ranked match.

| Topic | Reference |
|---|---|
| Avatar bonuses | [`02-reference/gameplay/tunables.md`](../../02-reference/gameplay/tunables.md) § 7 |
| Profile and equipment | [`02-reference/data/accounts.md`](../../02-reference/data/accounts.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|---|---|---|
| AC1 | a profile with a +4 attack part | a match starts | the damage multiplier is `×1.04`, capped at `×1.10` total (`TC-CORE-921`) |
| AC2 | a profile with +8 energy | the match starts | the energy pool is `base + 8` and never above the cap (`TC-CORE-921`) |
| AC3 | a guest | a match starts | bonuses are all zero and the match is still playable (`TC-AUTH-074`) |
| AC4 | an equipped part the account no longer owns | the loadout is validated | it is stripped server-side and the bonus is not applied (`TC-AUTH-104`) |
| AC5 | the bonus table | it is applied | totals are clamped to the caps and listed in the match record (`TC-RANK-110`) |

## 4. Contract

```ts
export interface AvatarBonus { attack: number; defense: number; energy: number; delay: number }
export function sumBonuses(parts: EquippedPart[]): AvatarBonus;   // clamped in one place
export function applyBonuses(mobile: Mobile, bonus: AvatarBonus): Mobile;
```

## 5. Rules and edge cases

- Caps: attack `×1.10`, defense `×1.05`, energy `+15`, delay `−10`, enforced in `sumBonuses`.
- Bonuses are computed at match start and frozen into the snapshot (`US-CORE-004`).
- Guests have none; ranked play allows them (they are only cosmetic-free, not stat-free).

## 6. Implementation notes

- `packages/core/src/avatar/bonus.ts`; the parts catalogue is static data for v1.

## 7. Out of scope

Buying parts, part rarity, visual composition of worn parts (`US-AUTH-003` covers the avatar picker).

## 8. Test notes

`TC-CORE-921`, `TC-AUTH-104`, `TC-RANK-110`, `TC-AUTH-074`.
`Red first: tests/core/avatar.test.ts::bonuses_clamp_at_ten_percent_attack`.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**done.** the engine rule is implemented in `packages/core/src` and covered by `packages/core/tests/` (ballistics, combat, match, snapshot, data, room, rating, camera)
