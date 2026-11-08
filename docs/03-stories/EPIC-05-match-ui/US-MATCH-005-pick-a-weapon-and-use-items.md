---
id: US-MATCH-005
title: Pick a weapon slot and use items
epic: EPIC-05-match-ui
status: done
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
| AC2 | the player taps weapon 2 (slot index 1) | the strip updates | the next shot carries that slot and the aim aid redraws for it: the flight that slot's weapon really takes and its blast radius (`TC-MATCH-906`, `TC-MATCH-941`, `TC-MATCH-944`; the look of it on a device is `TC-MATCH-943`). The aid itself is **opt-in**: off on a fresh device, because the genre gives the player an angle number and a power bar and reading the arc is the skill (`TC-MATCH-908`) |
| AC3 | the super shot is spent | the strip renders | slot 2 is disabled for the rest of the match (`TC-CORE-922`) |
| AC4 | the item tray | it is opened | items are shown with quantity, delay cost and a 44 px target; the count never exceeds the loadout (`TC-MATCH-006`) |
| AC5 | an item is tapped | it is used | the tray closes, the delay cost is displayed, and the effect is visible on the battlefield (`TC-CORE-906`) |
| AC6 | a player with no items | the tray is opened | it shows an empty state and no dead buttons (`TC-MATCH-006`) |
| AC7 | the HUD | it is read by a screen reader | the weapon name, charge state and item counts are exposed as text, not canvas only (`TC-MATCH-942`; the whole-route audit stays `TC-PWA-158`) |

## 4. Contract

```ts
export interface WeaponStripProps {
  weapons: readonly Weapon[];
  active: 0 | 1 | 2;
  charges: readonly number[];
  onSelect(slot: 0 | 1 | 2): void;
  /** Localised names and charge labels: no literal strings in a component (`conventions.md`). */
  names: readonly string[];
  chargeLabels: readonly string[];
  label: string;
  disabled: boolean;
}

export interface ItemTrayProps {
  items: readonly { id: string; qty: number; delay: number }[];
  onUse(id: string): void;
  labels: { title: string; empty: string; quantity(qty: number): string; delay(delay: number): string };
  enabled: boolean;
}

/** What the scene has to be told, so the aim aid draws the shot that will be sent. */
export interface BattleHandle {
  setWeaponSlot(slot: 0 | 1 | 2): void;
  setAimDelta(delta: number): void;
}

/** The resolver's own flight — the only thing the aid is allowed to promise (`previewShot` in `@gbw/core`). */
export interface ShotPreview {
  slot: number;
  weaponSlot: 0 | 1 | 2;
  angle: number;
  force: number;
  path: readonly Vec2[];
  impact: Vec2 | null;
  radius: number;
}
```

## 5. Rules and edge cases

- Changing weapons mid-aim is allowed until the shot is sent; after that the selection is locked for the turn.
- The tray shows delay cost in the same units as the roster's delay column.
- Icons come from `apps/web/src/i18n` + a static icon map; no GunBound item art (`OQ-18`).

## 6. Implementation notes

- `apps/web/src/components/{WeaponStrip,ItemTray}.tsx` inside the React shell, over the canvas (they are HUD
  components, not game assets: no Phaser import, no canvas drawing).
- `apps/web/src/game/preview.ts` samples `previewShot` from `@gbw/core` — the resolver's own `flightPath` — into the
  dots the scene draws; it re-derives no physics, so bounces, `piercing`, `itm-bunge`, off-map returns and the item
  effects resolve exactly as they will when the shot is fired.
- Actions dispatch to the core reducer; the component never mutates match state.

## 7. Out of scope

Inventory browsing, purchasing, item descriptions page.

## 8. Test notes

`TC-MATCH-006`, `TC-MATCH-906`, `TC-MATCH-941`, `TC-MATCH-942`, `TC-MATCH-943` (manual), `TC-MATCH-944`, `TC-CORE-906`, `TC-CORE-922`, `TC-PWA-158`.
Red: none — the wrong arc was a defect on the canvas, so the red run was a browser look (the aid still showed shot 1).
`TC-MATCH-941` pins the behaviour that replaced it.

<!-- delivery:2026-11-07 -->

## Delivery status — 2026-11-07

**done.** The strip and the tray already met AC1 and AC3–AC6; AC2's second half was the gap — the aim preview was
drawn from `mobile.weapons[0]` and a fixed sine bow, so choosing the lob still showed the arc's arc.

| AC | Evidence |
|---|---|
| AC1 | `apps/web/tests/weapon-strip.test.tsx` (`TC-MATCH-906`), `apps/web/tests/match-controls.test.tsx` (`TC-MATCH-906`) |
| AC2 | `apps/web/tests/aim-preview.test.tsx` (`TC-MATCH-941`): the aid reports the slot that will really fire (including `itm-dual`'s override) and that weapon's blast radius, carries exactly the angle and force `fireFromPull` sends, and lands on the same point `applyInput` resolves for arc, lob, bounce and piercing slots and for a `bungeNext` state; `apps/web/tests/match-wiring.test.tsx` (`TC-MATCH-944`): the strip's tap reaches the renderer as `setWeaponSlot`, the pad's nudge as `setAimDelta` |
| AC3 | `apps/web/tests/weapon-strip.test.tsx` (`TC-MATCH-906`, spent super shot); `packages/core/tests/…` (`TC-CORE-922`) |
| AC4 | `apps/web/tests/match-controls.test.tsx` (`TC-MATCH-006`, zero quantity stays visible, empty state) |
| AC5 | `apps/web/tests/match-controls.test.tsx` (`TC-MATCH-006`, one item frame, tray closes); effects in `packages/core/tests/match.test.ts` (`TC-CORE-906`) |
| AC6 | `apps/web/tests/match-controls.test.tsx` (`TC-MATCH-006`, empty tray, no dead buttons) |
| AC7 | `apps/web/tests/weapon-strip.test.tsx` (`TC-MATCH-942`); the whole-route audit is still `TC-PWA-158` (manual) |

**What "the arc follows the weapon" turned out to mean.** `packages/core/src/ballistics.ts` builds the trajectory from
angle, force and facing only — `shotClass` changes `bouncesLeft` and `piercing`, i.e. what happens *after* the first
contact. At the same angle and force an arc, a lob and a cluster therefore fly the same path. So the aid shows what
really differs: the flight and the weapon's own blast radius at the landing point — plus the angle, once the pad's
nudge and the mobile's window are applied. Nothing on screen is derived twice: the dots come from `previewShot` in
`@gbw/core`, which exports the resolver's own `flightPath`, so bounces, `piercing`, `itm-bunge`, off-map returns and
the item effects resolve exactly as they will when the shot is fired (bounce and piercing mobile cases compare the
aid's impact with the `shot` event's). An earlier draft re-walked the projectile with `stepProjectile` and drew a
class-shaped sine bow: the first disagreed with the engine on eleven of the twenty mobiles, the second would have
taught the player a rule the engine does not have.

**Owed before UAT (M2):** `TC-MATCH-943` — the aid as a player sees it. The browser pass on 2026-11-07 proved the strip's
selection reaches the scene (`data-weapon-class="flat"` pressed, `ac2-weapon-2-selected-844x390.png`) but the synthetic
pointer never held a pull through a bot turn, so the dots themselves are filmed nowhere yet. Nothing else in the story
depends on it; run it with `TC-MATCH-938` (the 16 ms check) on the same device session.

Two follow-ups, not part of this story:

- AC5's "the effect is visible on the battlefield" is proven in the engine, not on screen — the blast, the crater and
  the `match.weather.changed` banner show it, but no test asserts the *rendered* effect. Worth a case when the effects
  layer gets one (`US-MATCH-001` § 4 names an `effects` layer that the vector renderer does not split out).
- The strip still sits in a fixed bottom-left corner, so on 844 × 390 it can overlap the aim area (carried by
  `US-MATCH-003`'s delivery note).
