# Evidence — US-MATCH-005: pick a weapon slot and use items

Verified 2026-11-07 on branch `feat/US-MATCH-005-pick-a-weapon`.

## Automated

| AC | Where |
|---|---|
| AC1 | `apps/web/tests/weapon-strip.test.tsx` (`TC-MATCH-906`) — three slots, class glyph, charge state |
| AC2 | `apps/web/tests/aim-preview.test.tsx` (`TC-MATCH-941`) — the aid reports the slot that will really fire (including `itm-dual`'s override) and that weapon's blast radius, carries exactly the angle and force `fireFromPull` sends, and lands where `applyInput` lands for arc, lob, bounce and piercing slots and for a `bungeNext` state; `apps/web/tests/match-wiring.test.tsx` (`TC-MATCH-944`) — the strip's tap reaches the renderer as `setWeaponSlot` and the pad's nudge as `setAimDelta` |
| AC3 | `apps/web/tests/weapon-strip.test.tsx` (`TC-MATCH-906`, spent super shot is disabled for the rest of the match) |
| AC4 | `apps/web/tests/match-controls.test.tsx` (`TC-MATCH-006`, zero quantity stays visible, empty state) |
| AC5 | `apps/web/tests/match-controls.test.tsx` (`TC-MATCH-006`, one item frame, tray closes); effects in `packages/core/tests/match.test.ts` (`TC-CORE-906`) |
| AC6 | `apps/web/tests/match-controls.test.tsx` (`TC-MATCH-006`, empty tray, no dead buttons) |
| AC7 | `apps/web/tests/weapon-strip.test.tsx` (`TC-MATCH-942`, every tray item names itself with its quantity and delay cost) |

## Browser — `ac2-weapon-2-selected-844x390.png`

Chrome DevTools, emulated 844 × 390 landscape, `http://localhost:5273/match/AAAAAA` (bot match). "Đạn 2" is pressed
(`aria-pressed="true"`, `data-weapon-class="flat"`, glyph `→`), so the strip's choice reaches the scene; the roster
carries the per-seat delay column (`+150`, `+250 +136`) added by `US-MATCH-003`.

## Owed — `TC-MATCH-943` (manual, run at UAT M2)

The aim aid is drawn on the canvas only while a finger is pulling, and the synthetic pointer used for the browser pass
never held a pull across a bot turn, so no screenshot shows the dots. On a device: start a bot match, tap **Đạn 2**,
drag to build power, and check that the dots follow that weapon's flight and that the ring at the landing point is its
blast radius (85/95/120/200 units by weapon). Record the result here. Run it in the same session as `TC-MATCH-938`.
