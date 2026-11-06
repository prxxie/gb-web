---
id: US-MATCH-001
title: Render the battlefield, units and camera in Phaser
epic: EPIC-05-match-ui
status: in-progress
priority: P0
size: M
depends_on: [US-FND-003, US-CORE-001]
open_questions: []
accepted_assumptions: [OQ-20]
refs: [02-reference/screens/match.md, 01-overview/conventions.md, 01-overview/nonfunctional-requirements.md]
---

# US-MATCH-001 — Render the battlefield, units and camera in Phaser

## 1. Story

**As a** player
**I want** to see the map, the units and the projectile at a readable scale in landscape
**so that** I can judge a shot instead of guessing.

## 2. Context

One scene, one map (2000×1200 world), `Phaser.Scale.FIT` in landscape. The scene owns no state: it receives
`MatchState`/`Snapshot` and draws. Interpolation between the last two snapshots hides the 10 Hz step.

| Topic | Reference |
|-------|-----------|
| Match screen layout and states | [screens/match.md](../../02-reference/screens/match.md) |
| Scene rules, one scene per concern | [conventions.md § 5](../../01-overview/conventions.md) |
| NFR-01 60 FPS, NFR-19 landscape | [nonfunctional-requirements.md](../../01-overview/nonfunctional-requirements.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A match state | The scene mounts | The map, every non-eliminated unit at its `(x, y)`, and the turn indicator are drawn with the terrain and sky layers in that order (`TC-MATCH-901`) |
| AC2 | Two snapshots 100 ms apart | The scene renders | Units and projectiles are interpolated between them; no frame shows a unit jumping back to an older position |
| AC3 | The scene on iPhone 12 and Galaxy A52 in landscape | A match runs | It holds 60 FPS (±5) with 8 players and one projectile in flight, measured over 30 s (`NFR-01`, manual `TC-OPS-180`) |
| AC4 | An 844×390 viewport | The scene mounts | The whole 2000×1200 world is visible with letterboxing, no scrollbars, and no asset drawn under the HUD strip |
| AC5 | A rotated device (portrait) | The scene mounts | The scene does not start; the rotate notice from `US-PWA-003` is shown instead (`TC-PWA-063`) |
| AC6 | A unit at HP 0 | The state is rendered | It is drawn as eliminated (faded, no facing change) and never removed from the roster strip |
| AC7 | The match ends | The state changes to `ended` | The scene stops the render loop and the results screen takes over without a reload |

## 4. Contract

```ts
export interface SceneView {
  mount(parent: HTMLElement, opts: { world: { w: number; h: number }; assets: AssetManifest }): void;
  setState(state: MatchState): void;          // called on every snapshot / local step
  setTurnClock(deadlineAt: number): void;
  onPointerAim(cb: (aim: AimSample) => void): void;
  destroy(): void;
}
export interface AimSample { angle: number; force: number; facing: 1 | -1 }
```

Layers: `sky`, `terrain`, `units`, `projectiles`, `effects`, `aimOverlay`. Asset manifest from
`apps/web/src/game/assets.ts`; all images ≤ 512×512 and the whole set ≤ 1.5 MB compressed.

## 5. Rules and edge cases

- The scene must never call the network, `fetch`, `Math.random()` or the simulation: it is a pure projection.
- Textures are loaded before the first frame; a load failure shows the error banner, not a black canvas.
- `Phaser.Scale.FIT` with `autoCenter`; pinch-zoom, double-tap zoom and page drag are disabled via CSS `touch-action`.
- The scene is destroyed on route change and its WebGL context released — no leak across five matches (`NFR-03`).
- Accessibility: the canvas is `aria-hidden` and its state is mirrored by the HUD (`US-MATCH-003`).

## 6. Implementation notes

- `apps/web/src/game/scene.ts` (`BattleScene`), `apps/web/src/game/view.ts` (the `SceneView` implementation the shell uses).
- Interpolation with `Phaser.Math.Linear` on `x/y`, snapping on `hp` and `eliminated`.
- Camera is fixed to the world; there is no panning in v1.

## 7. Out of scope

- Aiming gestures — [US-MATCH-002](US-MATCH-002-aim-and-fire-by-touch.md).
- Particle effects, screenshake, multiple maps.

## 8. Test notes

`TC-MATCH-901` (Playwright: canvas exists, unit sprites at expected coordinates via a debug hook), `TC-OPS-180`
(manual FPS), `TC-PWA-063` (orientation). A Vitest test asserts `BattleScene` source contains no `fetch`/`Math.random`.
Red first: `tests/e2e/match.spec.ts::scene_renders_units`.

## 9. Open questions

- **OQ-20** (accepted assumption) — the shipped art is AI-generated placeholder art with a licence note in `assets/CREDITS.md`;
  replacing it later must not change coordinates or the asset manifest contract.

<!-- delivery:2026-11-06 -->

## Delivery status — 2026-11-06

**in-progress.** AC1 passes end to end — `tests/e2e/smoke.spec.ts` TC-MATCH-901 mounts the battlefield and reads the
HUD's turn. Still open: AC2 has no case asserting that two snapshots 100 ms apart interpolate without a unit jumping
back (no test in `apps/web` mentions interpolation), AC3 is the manual device FPS measurement (`TC-OPS-180`), which
nobody has recorded, and AC4/AC6/AC7 carry no traced case yet.
