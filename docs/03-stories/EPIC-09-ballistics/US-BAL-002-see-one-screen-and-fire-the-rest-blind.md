---
id: US-BAL-002
title: See one screen and fire the rest blind
epic: EPIC-09-ballistics
status: ready
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
| AC3 | the player pinches out or presses measure | the gesture ends | the window may widen up to the whole map, and it returns to 800 u on its own within 1.5 s — or immediately on a tap |
| AC4 | the window is wider than one màn | the player presses and drags | the pull does not arm (the power chip reads `0.00`) and a release sends nothing |
| AC5 | a shot is released | the shell flies | the camera follows it to the impact, then returns to one màn on the next turn |
| AC6 | a screen reader or a keyboard user | the match is played | the measure control is reachable and announces the current window width in phần |

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

Unit: `windowOnOneScreen` across five aspects, never wider than 800, height clamped, edge clamping. e2e: opponent off
screen at a spawn gap of 1 640 u; pinch out → pull refused → snap back within 1.5 s. `TC-MATCH-918` is superseded by
`TC-BAL-105`. Planned cases `TC-BAL-105`–`TC-BAL-112`.

## 9. Open questions

None — the three forks were settled by the client on 2026-11-13: the camera follows the shell, firing is refused while
measuring, and the roster is seventeen.
