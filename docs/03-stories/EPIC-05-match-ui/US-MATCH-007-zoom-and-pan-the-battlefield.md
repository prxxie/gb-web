---
id: US-MATCH-007
title: Fullscreen window with pinch zoom and a measuring ruler
epic: EPIC-05-match-ui
status: ready
priority: P0
size: M
depends_on: [US-MATCH-001]
open_questions: []
accepted_assumptions: [OQ-39]
refs: [02-reference/screens/match.md, 02-reference/gameplay/tunables.md, 01-overview/nonfunctional-requirements.md]
---

# US-MATCH-007 — Fullscreen window with pinch zoom and a measuring ruler

## 1. Story

**As a** player who cannot compute a GunBound arc in my head
**I want** a zoomable window on a fullscreen map with a ruler along the bottom
**so that** I can measure the distance to my target and read the angle and power I need.

## 2. Context

The map is 2000 × 1200 units; a phone shows a window onto it, not the whole thing. Default window is **half the map each
way** (1000 × 600), two fingers pan, a pinch zooms between the whole map and 4 × in, and the bottom edge carries a ruler
whose divisions grow from 8 (default window) to 16 (whole map) — GunBound's parts, rescaled to our units. Fullscreen is
requested on the first tap.

| Topic | Reference |
|-------|-----------|
| Camera, zoom and ruler tables | [`02-reference/screens/match.md`](../../02-reference/screens/match.md) |
| `viewDefault`, `zoomMin/Max`, `rulerSegments` | [`02-reference/gameplay/tunables.md`](../../02-reference/gameplay/tunables.md) § 9 |
| Landscape-only rule (NFR-19) | [`01-overview/nonfunctional-requirements.md`](../../01-overview/nonfunctional-requirements.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|---|---|---|
| AC1 | the match scene mounts | the first tap lands anywhere on the canvas | `requestFullscreen()` is called where the API exists; on iPhone Safari the page fills the viewport with safe-area insets and no `apple-mobile-web-app-capable` meta (`TC-MATCH-921`) |
| AC2 | the scene has just loaded | nothing has been touched | The camera window is **1000 × 600 units ±1 %** on a 5:3 screen and keeps its 600 units of height on a wider one, taking the screen's aspect for its width, centred on the player's own mobile and clamped inside the map bounds (`TC-MATCH-918`) |
| AC3 | two fingers on the canvas | their separation changes by more than 12 px | The camera zooms about the pinch midpoint, never past `zoomMin` (whole map) or `zoomMax` (250 × 150 units) (`TC-MATCH-919`) |
| AC4 | two fingers on the canvas | they move together | The camera pans 1:1 with the finger centroid and stops at the map edges; the window never shows void (`TC-MATCH-918`) |
| AC5 | any zoom level | the bottom strip is drawn | Divisions are `clamp(round(8 × visibleWidth / 1000), 8, 16)` — **8** at the default window, **16** at whole-map zoom, each labelled with its world width and every fourth a major tick (`TC-MATCH-920`) |
| AC6 | the camera moves or zooms | HUD elements are drawn | The four-way pad, power ring and roster keep their fixed screen size and never scale with the world (`TC-MATCH-922`) |
| AC7 | a pinch or pan ends | the gesture stops | The camera keeps its new window (no snap-back) and the state is local — no message is sent, the host is unaffected (`TC-MATCH-919`) |
| AC8 | a round trip of zoom out to the whole map and back | the ruler is compared | The reported units-per-division equals `visibleWidth / segments` at each step and reads 125 units at both ends (`TC-MATCH-920`) |

## 4. Contract

```ts
export interface CameraWindow { x: number; y: number; width: number; height: number } // world units, top-left origin

export interface CameraController {
  mount(scene: Phaser.Scene): void;
  getWindow(): CameraWindow;
  setZoom(zoom: number, about?: { x: number; y: number }): void;
  panBy(dxPx: number, dyPx: number): void;
  onChange(cb: (w: CameraWindow) => void): void;
}

export function rulerSegments(visibleWidth: number): number; // clamp(Math.round(8 * visibleWidth / 1000), 8, 16)
export function unitsPerDivision(visibleWidth: number): number; // visibleWidth / rulerSegments(visibleWidth)
```

Constants live in `tunables.json` under `camera`; the ruler is drawn in screen space so its labels stay legible at every
zoom.

## 5. Rules and edge cases

- `panClamp`: the window edge is clamped to `mapBounds`; a window wider than the map (never, by `zoomMin`) would centre.
- Pinch and pan are mutually exclusive per gesture: whichever crosses its threshold first wins until all fingers lift.
- A two-finger gesture cancels any power pull in progress without firing (`US-MATCH-002` AC5).
- The camera is per client: two players may look at different parts of the map; snapshots carry world coordinates only.
- On a wider-than-5:3 screen the window keeps 600 units of height and shows extra width as margin; on a narrower one it
  keeps 1000 units of width and shows extra height — the default is never *smaller* than half the map in either axis.

## 6. Implementation notes

- `apps/web/src/game/camera.ts` owns `Phaser.Cameras.Scene2D` zoom/scroll, clamping and the `onChange` stream;
  `apps/web/src/game/hud/Ruler.ts` consumes it. Both are thin wrappers over pure functions (`rulerSegments`,
  `clampWindow`, `zoomAbout`).
- The scene camera uses `Phaser.Scale.FIT` for the canvas itself and world-unit rendering inside it (`US-MATCH-001`).
- Never call `document.exitFullscreen()` on route change inside the match; the shell releases it when the match is left.

## 7. Out of scope

- Rotating the map, tilt/parallax layers, camera shake, per-player camera sync.
- A minimap (the ruler plus two pans is the v1 answer).

## 8. Test notes

`TC-MATCH-918` (default window and pan clamp), `TC-MATCH-919` (zoom bounds and midpoint), `TC-MATCH-920` (ruler 8 → 16),
`TC-MATCH-921` (fullscreen and safe areas), `TC-MATCH-922` (HUD scale independence).
Red first: `apps/web/tests/ruler.test.ts::segments_go_from_eight_to_sixteen`.

## 9. Open questions

- **OQ-39** (answered) — `requestFullscreen()` where available, viewport-filling fallback on iPhone Safari.

<!-- delivery:2026-11-06 -->

## Delivery status — 2026-11-06

**in-progress.** The window, zoom clamps, pinch, pan clamp and the 8→16 ruler are unit-tested in
`packages/core/tests/camera.test.ts` and rendered by `apps/web/src/game/scene.ts` +
`apps/web/src/components/Ruler.tsx`; `tests/e2e/smoke.spec.ts` TC-MATCH-901 reads the ruler's division count off a
running match and checks it against `clamp(round(8 × visibleWidth / 1000), 8, 16)` with one ~125-unit division each.

Fixed on 2026-11-06: the framing used to fix the window's *width* at 1000 units, so on a 2.7:1 phone (844 × 313 above the
HUD) only ~371 of the 600 units of height were visible and the shooter's feet fell off the bottom of the canvas. The
window now takes the screen's aspect — 600 units of height, width `max(1000, 600 × aspect)` — so the whole window fits and
the feet land 70 % down it. Frame: `docs/05-quality/evidence/US-MATCH-007/framing-844x390.png` (window 1617 × 600,
ruler 13 × ~124.5 units).

Still open, and the reason this story is not `done`:

- **AC2/AC7 on a device** — pinch, wheel zoom and the no-snap-back rule are asserted in jsdom and by the core camera
  tests, not with two real fingers; the pinch thresholds need a touch device (`US-OPS-004` matrix, at UAT).
- **Not this story, but found while here:** the four-way pad and the weapon strip are fixed bottom-left clusters, while
  `docs/02-reference/screens/match.md` draws the pad *around the mobile*. When the active mobile stands near the map's
  left edge the window clamp keeps it on screen but under the pad. Recorded against `US-MATCH-003` (HUD layout), not
  reworded away here.
