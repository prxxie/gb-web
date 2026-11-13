---
id: US-BAL-003
title: Show the truth only inside your screen
epic: EPIC-09-ballistics
status: ready
priority: P0
size: S
depends_on: [US-MATCH-002, US-BAL-002]
open_questions: []
accepted_assumptions: []
refs: [02-reference/screens/match.md]
---

# US-BAL-003 — Show the truth only inside your screen

## 1. Story

**As a** player who turned the aim aid on

**I want** it to predict only what I could see anyway, and to show me what the wind is doing

**so that** the training wheel teaches me the wind instead of solving the map for me.

## 2. Context

The aid drew the whole arc, so with a 2.5-màn map it revealed the landing point of a shot the player could not see — the
camera rule of `US-BAL-002` would be pointless with it on. The reference also carries a zero-wind baseline next to the
live trajectory, which is the teaching half of the same idea: two arcs, one difference, and the player learns what wind
costs.

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | the aid is on and the shot would leave the window | the preview is drawn | nothing is drawn outside the window's right or left edge — the arc stops at the edge, with no marker at the crossing |
| AC2 | the aid is on | a trajectory is previewed | a second, neutral-coloured arc shows the same shot with wind removed, so the gap between the two is the wind |
| AC3 | the aid is on | the dots are drawn | they mark equal **time** steps (10 per flight, `dt = flightMs / 10`), not equal distance |
| AC4 | the aid is off (the default) | a match starts | neither arc nor any dot is drawn, and the setting still survives a reload |

## 4. Contract

```ts
/** The preview, clipped to what the player may see. */
export function clipToWindow(path: readonly Vec2[], window: CameraWindow): readonly Vec2[];
/** The same shot with wind removed, for the baseline arc. */
export function baselineShot(state: MatchState, slot: number, weaponSlot: 0 | 1 | 2, angle: number, bar: number): ShotPreview;
```

## 5. Rules and edge cases

- Clipping is geometric, not "stop drawing at the first off-screen point": the last segment is trimmed at the edge so the
  arc visually ends on the boundary.
- The baseline arc uses the same angle, bar and terrain; only the wind is zero.
- Time dots are dropped when they would sit closer than 6 px apart on screen (a 25 ms step at low bar is a smear).
- The aid may never be enabled by a URL flag during a ranked match; it is a stored player setting.

## 6. Implementation notes

- `apps/web/src/game/preview.ts` already calls `previewShot`; the clip is a pure function in `viewport.ts` so it is
  testable without a browser.
- `PATH_DOTS` becomes `PREVIEW_STEPS = 10` and is derived from the flight, not a fixed count.

## 7. Out of scope

- The solver behind a practice calculator (`US-BAL-007`).
- Any change to what the *engine* resolves — this is drawing only.

## 8. Test notes

Unit: `clipToWindow` (inside, crossing, fully outside), baseline equality when wind is zero, dot spacing at 25 ms.
e2e: with the aid on, no pixel of the arc is drawn past the window edge — asserted through the scene's exposed preview
points, not by screenshot diffing. Planned cases `TC-BAL-113`–`TC-BAL-118`.

## 9. Open questions

None.
