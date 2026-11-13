---
id: US-BAL-002
title: See one screen and fire the rest blind
epic: EPIC-09-ballistics
status: done
priority: P0
size: M
depends_on: [US-MATCH-007, US-BAL-001]
open_questions: []
accepted_assumptions: []
refs: [02-reference/screens/match.md]
---

# US-BAL-002 — See one screen and fire the rest blind

## 1. Story

**As a** player

**I want** the field to show exactly one screen, with a zoom that measures and then lets go

**so that** hitting something I cannot see is my calculation, not the camera's generosity.

## 2. Context

`US-MATCH-007` framed **both** mobiles in one window, which on a 2.5-màn map put the opponent on screen at 1 640 u — the
exact opposite of the genre's information rule, and the reason range never had to be learned. On a wide canvas the window
also grew sideways, so two phones played different games. This story replaces both decisions: the width is fixed at one
màn and the aspect buys height.

| Topic | Reference |
|-------|-----------|
| Framing, ruler, zoom | [screens/match](../../02-reference/screens/match.md#camera-and-zoom) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | any canvas aspect between 1.5:1 and 3:1 | the resting window is computed | the width is exactly `MAN_WIDTH` (800 u) and the height is `800 / aspect` clamped to the map; a wider canvas never shows more width |
| AC2 | a 1v1 on the 2 000-u map | the turn begins | the window follows the shooter, so an opponent more than one màn away is **not** on screen; `windowOnBoth` no longer exists |
| AC3 | the player pinches out or presses measure | the gesture ends | the window may widen up to the whole map, and it returns to 800 u on its own within 2.5 s — or immediately on a tap |
| AC4 | the window is wider than one màn | the player presses and drags | the pull does not arm (the power chip reads `0.00`) and a release sends nothing |
| AC5 | a shot is released | the shell flies | the camera follows it to the impact, then returns to one màn on the next turn |
| AC6 | a screen reader or a keyboard user | the match is played | the measure control is a real 44 × 44 px button with an accessible name, and a press that lands while the field is open to measure is announced in the live banner |

## 4. Contract

```ts
/** The frame that shows exactly one screen, anchored on the ground line. */
export function windowOnOneScreen(targetX: number, aspect: number, groundY?: number): CameraWindow;
/** How wide the measure view may open, and the snap-back delay. */
export const MEASURE_MAX_WIDTH: number;   // = map width
export const MEASURE_RETURN_MS: number;   // = 1500
```

`scene.ts` gains `setMeasuring(boolean)`; the page refuses the pull while it is true, using the same gate as the shot
hand-over (`US-MATCH-012`).

## 5. Rules and edge cases

- The height is never allowed to fall below the 600-unit sky the screen reference asks for; on a very tall canvas the width
  is the one that gives.
- Panning inside the one-screen window is allowed (it is not aiming), but it cannot widen it.
- The zoom uses the existing pinch maths; a mouse wheel does the same, and both snap back.
- A reconnect mid-measure returns to one màn rather than restoring a zoom.
- Firing while measuring is refused **and announced** (the live region says so once), because a silent refusal reads as a
  dead control.

## 6. Implementation notes

- `packages/core/src/camera.ts`: add `windowOnOneScreen`, delete `windowOnBoth` and its tests; `clampWindow` keeps its
  zoom limits.
- `apps/web/src/game/scene.ts`: the measure state and the snap-back timer; the follow-the-shell behaviour already exists for
  the shot animation and only needs the window to track it.
- `apps/web/src/match/useBattleSync.ts`: extend the aim gate with `measuring`, exactly like `cinematic`.

## 7. Out of scope

- The aim aid's clipping (`US-BAL-003`) — the aid is drawn inside whatever window exists.
- The bot's information limit (`US-BAL-006`).

## 8. Test notes

`TC-BAL-105` (one screen at 5:3 / 16:9 / 2.7:1), `TC-BAL-106` (a 1 640-unit gap is outside the frame), `TC-BAL-107`
(measure opens 2 000 and snaps back), `TC-BAL-108` (no shot leaves while measuring), `TC-BAL-109` (the camera rides the
shell), `TC-BAL-110` (the measure control is a real button and the refusal is announced). `TC-MATCH-918` is superseded by
`TC-BAL-105`/`TC-BAL-106`.

Red: `tests/e2e/one-screen.spec.ts` — before the change the match screen published no field width at all (the default window
was 1 000 units) and `TC-BAL-108` armed a normal pull inside the measure view, reading **power 2.1** where the criterion says
zero. That failure is why `pointerdown` returns early instead of closing the view and then aiming.

## 9. Open questions

None — the three forks were settled by the client on 2026-11-13: the camera follows the shell, firing is refused while
measuring, and the roster is seventeen.

<!-- delivery:2026-11-13 -->

## Delivery status — 2026-11-13

**done.** `windowOnBoth` is gone; `windowOnOneScreen`/`windowOn` frame exactly 800 units around the shooter and the canvas
aspect buys only height. The scene owns a **measure** state (`setMeasuring`, `windowMeasuring`, `isMeasuring`): it opens the
whole map, closes itself after `TUNABLES.measureReturnMs` (2 500 ms — 1 500 was too short to count twenty parts, and it made the
refusal fire only on an idle device), and a press inside it only closes it — it never arms a
pull, which is what `TC-BAL-108` pins. After a release the camera rides the shell (`rideTheShell`, eased 18 % a frame) and
the next turn's framing waits for it (`followUntil`).

Two implementation notes worth keeping: the measure view is **not** a toggle, and the refusal path returns early in
`pointerdown` rather than falling through, because a press that closed the view *and* aimed would make measuring a free look
at the map with the barrel loaded.

Superseded in place: `US-MATCH-007`'s "frame both mobiles" rule, its follow paragraph, `TC-MATCH-918` (already marked).
