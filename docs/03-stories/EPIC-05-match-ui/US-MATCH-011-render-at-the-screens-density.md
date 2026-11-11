---
id: US-MATCH-011
title: The battlefield renders at the screen's pixel density
epic: EPIC-05-match-ui
status: done
priority: P1
size: S
depends_on: [US-MATCH-007]
open_questions: []
accepted_assumptions: []
refs: [02-reference/screens/match.md]
---

# US-MATCH-011 — The battlefield renders at the screen's pixel density

## 1. Story

**As a** player on a phone

**I want** the battlefield drawn at the resolution my screen actually has

**so that** the terrain, the hulls and the rings are sharp instead of visibly stepped.

## 2. Context

Reported as "sao đồ hoạ nhìn răng cưa vậy". Measured on production 2026-11-11 with a 2.625-ratio phone in landscape:

- `devicePixelRatio` **2.625**
- canvas backing store **863 × 360**, CSS size **863 × 360** → **one device pixel per CSS pixel**
- so the whole battlefield was rasterised at 1× and the compositor stretched it by 2.625 — every diagonal, circle and ring
  edge landed on a hard step.

The cause is the renderer config, not the art: `scale: { mode: Phaser.Scale.RESIZE }`. Phaser 4's `updateScale()` under
`RESIZE` sets `canvas.width/height` to the **parent's CSS size** on every resize, so nothing the page does can raise the
backing store. Phaser 4 also has no `resolution`/`autoDensity` (they were Phaser 3 knobs; `grep` finds neither in
`src/core/Config.js`), so `RESIZE` had to go.

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | a device with `devicePixelRatio` 2.625 | a bot match opens | The canvas backing store is 2× its CSS size (the cap), the CSS size is still exactly the parent's, and nothing overflows (`TC-MATCH-956`, `TC-MATCH-957`) |
| AC2 | the same match | the player drags 12 CSS pixels down | The barrel reads exactly `ANGLE_DEG_PER_PX × 12` lower, and a 240 px sideways drag reads the same power as before: gestures stay in CSS pixels (`TC-MATCH-918`, `TC-MATCH-919`, hand-measured 45° → 42°) |
| AC3 | the same match | the player holds on their own hull | The loadout wheel still opens where the mobile stands — the hit test and the DOM anchor are still in CSS pixels (`TC-MATCH-914`) |

## 4. Contract

```ts
/** Device pixels per CSS pixel of battlefield: the ratio, floored at 1 and capped at 2. */
export function renderScaleFor(devicePixelRatio: number | undefined): number;
export const MAX_RENDER_SCALE = 2;
```

The game size is `cssSize × renderScale` and `scale.zoom` is `1 / renderScale`, so the canvas is styled back down to the
parent's CSS box. Inside the scene, **drawing is in device pixels and gestures are in CSS pixels**: `this.scale.width` is
device pixels, `cssWidth()` divides it back for the pull distance and the pans, and `worldToScreen` results are divided by
the ratio wherever a DOM consumer reads them.

## 5. Rules and edge cases

- The cap is 2: a 2.6-ratio phone draws at 2 rather than 3, which is ~2.3× the pixels of a full-ratio raster for a
  difference the eye does not resolve at phone size.
- A platform that reports no ratio (or a nonsense one) renders at 1 — the old behaviour, never worse.
- A window dragged to another display re-reads the ratio on resize and re-styles the canvas, so the ratio cannot drift.
- Screen-constant HUD parts (`screenConstant`) and the damage numbers are multiplied by the ratio: they must read the same
  CSS size as before, only sharper. The damage numbers are rasterised at `18 × ratio` px for the same reason — a text
  texture scaled up afterwards would be blurred, which is the bug this story is about.
- The fullscreen lock (`US-PWA-006`) and the canvas have nothing to do with each other; entering fullscreen does not
  change the ratio.

## 6. Implementation notes

- `apps/web/src/game/viewport.ts` — `MAX_RENDER_SCALE`, `renderScaleFor`.
- `apps/web/src/game/scene.ts` — `renderScale` field, `setRenderScale`, `cssWidth()`, `fullPowerDistance()` and both
  `panBy` calls switched to CSS pixels, `px()` multiplied by the ratio, damage-number font sized by it, `emitFocus`
  divided by it, and `mountBattle` switched from `Scale.RESIZE` to `Scale.NONE` + `zoom: 1 / renderScale`.
- `apps/web/tests/camera.test.tsx` — `TC-MATCH-957`.
- `tests/e2e/render-scale.spec.ts` — `TC-MATCH-956`.

## 7. Out of scope

- Art quality itself: the mobile is drawn as vector placeholder art (`US-CORE-007` swaps in sprites). Density and art are
  different problems, and this story only fixes the one that made a sharp drawing look stepped.
- A user-facing quality switch: the cap is a constant, and a 3× raster on a phone has not been measured to be affordable.

## 8. Test notes

`TC-MATCH-956` (e2e) reads `canvas.width / getBoundingClientRect().width` in a bot match and compares it with
`min(max(dpr, 1), 2)`, plus the CSS size against the parent's. `TC-MATCH-957` (unit) pins the helper's floor, cap and
garbage handling.

Red: `tests/e2e/render-scale.spec.ts` — before the change the same measurement was `863 / 863 = 1` on a 2.625-ratio profile
while the spec expects 2.

## 9. Open questions

None.

<!-- delivery:2026-11-11 -->

## Delivery status — 2026-11-11

**done**, measured rather than assumed: production canvas `863 × 360` at ratio **1** before, `1726 × 720` at ratio **2**
after (CSS box unchanged), a 12 px downward drag reading 45° → 42° and 240 px sideways reading power 2.50 — the same
numbers as before the change, which is what proves the gesture maths did not move into device pixels.
