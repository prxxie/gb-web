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
| AC1 | A match state | The scene mounts | The map, every non-eliminated unit in the camera window at its `(x, y)`, and the turn indicator are drawn, with the sky below the terrain and the units above it (`TC-MATCH-901` for the mount and the HUD; the drawn content is the 844×390 screenshot in `docs/05-quality/evidence/US-MATCH-001/`) |
| AC2 | Two snapshots 100 ms apart | The scene renders | Units are interpolated between them by `apps/web/src/game/interpolate.ts`: at half the interval a unit is halfway along its segment, the drawn position never moves backwards or leaves that segment, and `hp`/`facing`/`eliminated` come from the newest snapshot rather than being blended (`TC-MATCH-924`). `MatchState.projectiles` is empty in this ruleset — `applyInput` resolves a shot to its impact immediately — so there is no projectile path to blend |
| AC3 | The scene on iPhone 12 and Galaxy A52 in landscape | A match runs | It holds 60 FPS (±5) with 8 players and one projectile in flight, measured over 30 s (`NFR-01`, manual `TC-OPS-180`) |
| AC4 | An 844×390 viewport | The scene mounts | The canvas fills the viewport behind the overlay HUD (`inset: 0`, the HUD is not a reserved strip), the camera window is 1000 units wide — half the map, the model `screens/match.md` § Camera defines, not a letterboxed whole world — the page never scrolls sideways, and the active mobile is framed clear of the HUD panels with its feet ~70 % down the frame (`tunables.md` § 9) (`TC-MATCH-918`, `TC-FND-133`) |
| AC5 | A rotated device (portrait) | The scene mounts | The scene does not start; the rotate notice from `US-PWA-003` is shown instead (`TC-PWA-063`) |
| AC6 | A unit at HP 0 | The state is rendered | It is drawn as a faded wreck — the hull is no longer painted and the cross is drawn at `0.55` alpha — it keeps the facing the newest snapshot gives it, and its cell stays in the roster strip in engine order, labelled instead of printing an hp (`TC-MATCH-925`, `TC-MATCH-924`) |
| AC7 | The match ends | The state changes to `ended` | The render loop stops and the results screen takes over without a reload — the bot and clock effects stop on `status !== "playing"`, the route replaces itself with `/results/:code`, and the scene is destroyed on unmount (manual `TC-MATCH-926`; the screen itself is `US-RANK-005`) |

## 4. Contract

```ts
// `apps/web/src/game/scene.ts` — the shipped surface. The scene owns pixels and no state.
export interface BattleCallbacks {
  readonly onPull: (power: number, angle: number) => void;     // live power ring, 0…4
  readonly onRelease: (power: number, angle: number) => void;  // the shot
  readonly onCancel: () => void;                               // pull abandoned, no input
  readonly onCamera: (window: CameraWindow) => void;           // the HUD ruler follows the camera
}
export interface BattleHandle {
  setState(state: MatchState, localSlot: number): void;        // every snapshot and every local step
  destroy(): void;                                             // route change; releases the WebGL context
}
export function mountBattle(opts: {
  parent: HTMLElement;
  state: MatchState;
  localSlot: number;
  callbacks: BattleCallbacks;
}): BattleHandle;
```

Drawing order inside one `Graphics` layer: sky band, terrain polygon from the height field, ruler ticks, each mobile
(wreck or hull, turret, health bar, shield arc, active ring), then the aim overlay. Positions come from
`unitFrames(...)`, never straight from `state`, so a 10 Hz snapshot is drawn as motion.

The screen draws vectors today; the asset manifest `apps/web/src/game/assets.ts` arrives with the sprites in
`US-CORE-007` (≤ 512×512 per image, whole set ≤ 1.5 MB compressed).

## 5. Rules and edge cases

- The scene must never call the network, `fetch`, `Math.random()` or the simulation: it is a pure projection.
- The first frame draws vectors, so there is no texture load to fail; `US-CORE-007` is where sprites replace them, and
  a failed asset load must then show the error banner rather than a black canvas.
- `Phaser.Scale.RESIZE` to the container, `autoCenter`, and `touch-action: none` on the canvas so the page never
  scrolls under a gesture. Zoom is two-finger and clamped by the camera window (`US-MATCH-007`), never browser pinch.
- The scene is destroyed on route change and its WebGL context released — no leak across five matches (`NFR-03`).
- Accessibility: the canvas is `aria-hidden` and its state is mirrored by the HUD (`US-MATCH-003`).

## 6. Implementation notes

- `apps/web/src/game/scene.ts` (`BattleScene`), `apps/web/src/game/viewport.ts` (gesture arbitration),
  `apps/web/src/game/interpolate.ts` (the blend) and `apps/web/src/components/Roster.tsx` (the strip).
- Interpolation: the scene keeps the snapshot it drew last plus its arrival time and draws at
  `t = (now − arrivedAt) / INTERPOLATION_MS` along the segment. Only positions blend; `hp`, `facing` and `eliminated`
  snap to the newest snapshot, and a mobile that is or was eliminated does not travel.
- The camera is a window onto the map (`screens/match.md` § Camera): it frames the active mobile at the start of each
  turn and then stays where the player panned it — `US-MATCH-007` owns pan, zoom and the ruler.

## 7. Out of scope

- Aiming gestures — [US-MATCH-002](US-MATCH-002-aim-and-fire-by-touch.md).
- Particle effects, screenshake, multiple maps.

## 8. Test notes

`TC-MATCH-901` (Playwright: the screen mounts, the HUD reports the turn, the ruler shows 8 divisions), `TC-MATCH-924`
(the blend), `TC-MATCH-925` (the roster strip), `TC-PWA-063` (orientation), `TC-OPS-180` (manual FPS on the
`US-OPS-004` device matrix) and `TC-MATCH-926` (manual, AC7). A Vitest test asserts `BattleScene` source contains no
`fetch`/`Math.random`.
Red: `tests/web/interpolate.test.tsx` (the alias `tests/web` resolves to `apps/web/tests`) — the blend did not
exist, so the first run could not even resolve `apps/web/src/game/interpolate.ts`.

## 9. Open questions

- **OQ-20** (accepted assumption) — the shipped art is AI-generated placeholder art with a licence note in `assets/CREDITS.md`;
  replacing it later must not change coordinates or the asset manifest contract.

<!-- delivery:2026-11-06 -->

## Delivery status — 2026-11-06

**in-progress.** The blend exists: `apps/web/src/game/interpolate.ts` with `TC-MATCH-924` (9 cases) draws the scene one
snapshot behind, and the roster moved into `apps/web/src/components/Roster.tsx` with `TC-MATCH-925` (4 cases) proving an
eliminated mobile keeps its cell, its order, and the facing the newest snapshot gives it. A browser walk at 844×390
(screenshot in `docs/05-quality/evidence/US-MATCH-001/`) shows the map, both roster cells, the turn clock, the wind dial
and the ruler at 8 divisions; a pull fired a shot and the turn advanced to the bot with no console error.

Still open, which is why the story stays `in-progress`:

- **AC4** — the framing clause above: the active mobile sits under the HUD panels. Camera work, tracked against
  `US-MATCH-007`.
- **AC3** — the 60 FPS figure is `TC-OPS-180`, a real-device check on the `US-OPS-004` matrix (iPhone 12 + Galaxy A52).
  No device was available; the procedure is recorded in the evidence README and runs at UAT (M2).
- **AC7** — `TC-MATCH-926` is a manual check that needs a bot match played to a winner before the transition can be
  watched. The code path is in place (`finish()` → `sessionStorage` → `navigate(..., { replace: true })` → unmount →
  `destroy()`), and the results screen that takes over belongs to `US-RANK-005`, still `ready`.

**AC4 is measured, not met.** The canvas does fill the viewport behind the HUD, the window is 1000 units wide and the
page never scrolls sideways (`scrollWidth` 844 = viewport). But the framing clause fails: `frameOn` centres on the active
mobile and pins the ground line to the bottom of the window, so on a 2.7:1 canvas the shooter lands under the weapon pad —
the screenshot in the evidence folder shows the active mobile about 60 % covered by the "Đạn 1" button. `tunables.md`
§ 9 already asks for the feet 70 % down the frame; the code does not do it yet. A second, related deviation: `scale =
width / window.width` always matches the width, so on 844×313 only ~371 of the window's 600 units are visible vertically.
Both belong to the camera (`US-MATCH-007`), not to this story, and are recorded as follow-ups rather than quietly
reworded away.

One record correction was made while shipping: `AC4` used to demand the whole 2000×1200 world letterboxed, which
contradicts `docs/02-reference/screens/match.md` § Camera ("a window onto the map, not the whole map": 1000 × 600
default, pan and zoom bounds) and the camera `US-MATCH-007` already shipped — the criterion now states the window model
the docs and the code share. And `apps/web/tests/hud.test.tsx` cited `TC-MATCH-921` for the ruler rule, which is
`TC-MATCH-920`; the id now matches, which retired that line from `tests/meta/traceability-scope-exceptions.txt`.

Known follow-up, not fixed under this story: at 844×390 the page is 4 px taller than the viewport (`scrollHeight` 394 vs
390). Sideways scrolling is zero, which is what `TC-FND-133` asserts.
