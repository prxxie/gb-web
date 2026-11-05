---
id: US-MATCH-005
title: Pick a weapon slot and use items
epic: EPIC-05-match-ui
status: ready
priority: P0
size: M
depends_on: [US-MATCH-001, US-CORE-007, US-CORE-009]
open_questions: []
accepted_assumptions: [OQ-17, OQ-19]
refs: [02-reference/screens/match.md, 02-reference/data/items.md]
---

# US-MATCH-005 — Pick a weapon slot and use items

## 1. Story

As a player, I want to switch between my three weapons and spend an item, so that a turn is a choice like in GunBound.

## 2. Context

Each mobile carries shot 1, shot 2 and one super shot (`data/mobiles.md`), and a loadout of up to eleven items
(`data/items.md`). Both must be reachable with a thumb while the other hand aims.

| Topic | Reference |
|---|---|
| Match screen | [`02-reference/screens/match.md`](../../02-reference/screens/match.md) |
| Items | [`02-reference/data/items.md`](../../02-reference/data/items.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|---|---|---|
| AC1 | a mobile with three weapons | the match renders | the weapon strip shows all three with class icons and the super shot's charge state (`TC-MATCH-906`) |
| AC2 | the player taps weapon 2 | the strip updates | the next shot uses slot 1 and the aim arc redraws with that class's arc (`TC-MATCH-906`) |
| AC3 | the super shot is spent | the strip renders | slot 2 is disabled for the rest of the match (`TC-CORE-922`) |
| AC4 | the item tray | it is opened | items are shown with quantity, delay cost and a 44 px target; the count never exceeds the loadout (`TC-MATCH-006`) |
| AC5 | an item is tapped | it is used | the tray closes, the delay cost is displayed, and the effect is visible on the battlefield (`TC-CORE-906`) |
| AC6 | a player with no items | the tray is opened | it shows an empty state and no dead buttons (`TC-MATCH-006`) |
| AC7 | the HUD | it is read by a screen reader | the weapon name, charge state and item counts are exposed as text, not canvas only (`TC-PWA-158`) |

## 4. Contract

```ts
export interface WeaponStripProps { weapons: Weapon[]; active: 0 | 1 | 2; charges: number[]; onSelect(slot: 0 | 1 | 2): void }
export interface ItemTrayProps { items: Array<{ id: string; qty: number; delay: number }>; onUse(id: string): void }
```

## 5. Rules and edge cases

- Changing weapons mid-aim is allowed until the shot is sent; after that the selection is locked for the turn.
- The tray shows delay cost in the same units as the roster's delay column.
- Icons come from `apps/web/src/i18n` + a static icon map; no GunBound item art (`OQ-18`).

## 6. Implementation notes

- `apps/web/src/game/hud/{WeaponStrip,ItemTray}.tsx` inside the React shell, above the canvas.
- Actions dispatch to the core reducer; the component never mutates match state.

## 7. Out of scope

Inventory browsing, purchasing, item descriptions page.

## 8. Test notes

`TC-MATCH-006`, `TC-MATCH-906`, `TC-CORE-906`, `TC-CORE-922`, `TC-PWA-158`.
`Red first: apps/web/tests/weapon-strip.test.tsx::selecting_weapon_two_updates_active_slot`.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**in-progress.** the weapon strip and the item tray are implemented; per-item effects are covered by `packages/core/tests/match.test.ts`.
