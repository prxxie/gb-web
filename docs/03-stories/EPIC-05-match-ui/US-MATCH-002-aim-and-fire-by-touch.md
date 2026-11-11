---
id: US-MATCH-002
title: Pull power with one finger and fire on release
epic: EPIC-05-match-ui
status: done
priority: P0
size: M
depends_on: [US-MATCH-001, US-CORE-002]
open_questions: []
accepted_assumptions: [OQ-03, OQ-38, OQ-40]
refs: [02-reference/screens/match.md, 02-reference/gameplay/tunables.md, 01-overview/nonfunctional-requirements.md]
---

# US-MATCH-002 — Pull power with one finger and fire on release

## 1. Story

**As a** player holding the phone in two hands
**I want** to pull power with one finger and watch it fill a ring around my mobile
**so that** I can read the shot strength without looking away from the target, and fire by letting go.

## 2. Context

The client replaced the source's drag-a-bar-with-optional-joystick scheme with a GunBound-style instrument: **one finger
drags to pull power, the ring around the mobile fills with a gradient, and the number inside reads 0.0–4.0** — the same
scale as the genre's power bar, which is also the scale the physics uses. Release fires; two fingers belong to
the camera (`US-MATCH-007`), never to aiming.

| Topic | Reference |
|-------|-----------|
| Power ring, angle chip, gesture table | [`02-reference/screens/match.md`](../../02-reference/screens/match.md) |
| `powerDragFull`, `powerDeadzone`, `force = power × 25` | [`02-reference/gameplay/tunables.md`](../../02-reference/gameplay/tunables.md) § 9 |
| `input` message and `seq` | [`02-reference/api/signaling.md`](../../02-reference/api/signaling.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|---|---|---|
| AC1 | the player's turn | one finger drags `powerDragFull` (0.45 × the shorter screen edge) | The ring is full and the number reads exactly `4.0`; half that distance reads `2.0` ±0.1 (`TC-MATCH-915`) |
| AC2 | a pull in progress | the ring is drawn | The gradient arc runs clockwise from −90° through amber to red in proportion to power, the numeric value sits inside the ring, and both update within one frame (< 16 ms) of the pointer move (`NFR-02`) (`TC-MATCH-936` sets the arc; the 16 ms is a device trace, `TC-MATCH-938`) |
| AC3 | a pull released at `power ≥ 0.3` | the finger lifts | Exactly one `fire` is sent with `force = round(power × 25)`, the angle and the active `weaponSlot`; the ring clears and the shot plays locally at once (`TC-MATCH-936`, `TC-MATCH-151`) |
| AC4 | a pull released below `0.3`, or ended by `pointercancel` | the gesture ends | Nothing is sent, the ring animates back to zero, and a hint `Kéo để lấy lực` appears once (`TC-MATCH-916`, `TC-MATCH-936`) |
| AC5 | a pull in progress | a second finger lands and pans or pinches | The pull is cancelled **without firing** and the camera gesture takes over (`TC-MATCH-916`, `TC-MATCH-936`) |
| AC6 | the drag direction | the pull is drawn | The angle follows ~~`atan2(-dy, dx)`~~ **superseded 2026-11-09 / `US-MATCH-010`**: the pull *rotates* the barrel from the angle it already had (`baseAngle − dy × 0.25`, latched at press), clamped to the mobile's own `angleMin…angleMax`, and the ring's centre prints it (`TC-MATCH-936`, `TC-MATCH-955`) |
| AC7 | not the player's turn | a pull is attempted | No ring, no arc, no message; a single hint `Lượt của {tên}` (`TC-MATCH-937`) |
| AC8 | an eliminated player or a second fire in the same turn | input is attempted | Controls are disabled and the second fire is blocked locally until the turn resolves (`TC-MATCH-937`, `TC-CORE-901`) |

## 4. Contract

```ts
export interface PowerPull {
  power: number;        // 0.0–4.0, one decimal, the value shown inside the ring
  force: number;        // Math.round(power * 25), 0–100, what goes on the wire
  angle: number;        // degrees, already clamped to the mobile window
  dragDistance: number; // px, for tests and the debug overlay
}

export interface AimController {
  attach(canvas: HTMLElement): void;
  setEnabled(on: boolean): void;
  getPull(): PowerPull | null;
  onFire(cb: (input: Extract<Input, {kind: "fire"}>) => void): void;
  onCancel(cb: (reason: "deadzone" | "gesture" | "pointercancel") => void): void;
}

export function powerFromDrag(distancePx: number, fullPx: number): number; // clamp(4 * d / full, 0, 4), 1 dp
```

The ring is drawn by the scene around the mobile at a **fixed 64 px screen radius**, so the readable number never shrinks
when the camera zooms out.

## 5. Rules and edge cases

- Pointer events only, `touch-action: none` on the canvas; the pad, weapon strip and item tray are DOM elements above the
  canvas, so a touch that starts on them never becomes a pull.
- A pull that starts while the ring is already animating back is ignored until it reaches zero.
- Losing focus, `pointercancel`, a route change, host migration (`US-NET-003`) and the turn clock expiring all cancel the
  pull; nothing is fired.
- The `power` number is display-only: the wire carries `force`, so the server and older clients never see a float.
- Landscape only; nothing here requests an orientation lock (`US-PWA-003`).

## 6. Implementation notes

- `apps/web/src/game/aim.ts` holds the decisions a browser cannot be asked about: `fireFromPull` (one `fire` per
  release, `force = round(power × 25)`, the angle clamped to `angleMin…angleMax`), `canAim` (whose turn, wrecked,
  already fired) and the ring's geometry (`RING_RADIUS`, `RING_START`, `ringSweep`, `ringColor`).
- The gesture state machine and the ring itself live in `apps/web/src/game/scene.ts` — `attachPointerHandlers` builds
  `idle → pulling → (fire | cancel)`, `setAimAllowed` gates it, and `drawAim` paints the arc. There is no
  `apps/web/src/game/hud/PowerRing.ts`: the ring is scene graphics, not DOM.
- `powerFromDrag` and `angleFromPull` are pure, live in `packages/core` and are re-exported by
  `apps/web/src/game/viewport.ts`; the ring reads the same functions the tests use, so the number on screen and the
  number in the test cannot drift.
- `seq` comes from a per-match counter, never `Date.now()`.

## 7. Out of scope

- An on-screen fire button, a joystick (`OQ-40`), aim assist, trajectory persistence.
- Keyboard aiming (desktop is a test harness only).

## 8. Test notes

`TC-MATCH-915` / `TC-MATCH-914` (mapping and angle), `TC-MATCH-916` (dead zone and gesture cancel), `TC-MATCH-936`
(one `fire` per release, its payload, the ring's arc and gradient, the same-turn block), `TC-MATCH-937` (`canAim`),
`TC-MATCH-151` (the drag itself in a browser), `TC-CORE-901` (eliminated).

Red: `apps/web/tests/aim-fire.test.tsx` — written before `apps/web/src/game/aim.ts` existed, so the run failed on the
unresolved import; then `canAim` and the same-turn branch were added until the two out-of-turn cases went green.

## 9. Open questions

- **OQ-03** (accepted assumption) — one shot per turn on a 20 s clock; a two-phase "move then shoot" turn would add a
  phase field here.
- **OQ-38** (answered) — release fires above a 0.3 dead zone; revisit after the M1 playtest.
- **OQ-40** (answered) — no joystick anywhere; this controller is the only aiming input.

<!-- delivery:2026-11-07 -->

## Delivery status — 2026-11-07

**done.** The gesture, the ring and the wire are now tied together by one module, so the claims in § 3 are cases rather
than observations:

| AC | Evidence |
|----|----------|
| AC1 | `apps/web/tests/aim.test.tsx` (TC-MATCH-914) — 45 % of the shorter edge reads 4.0, half of it 2.0 ± 0.1 |
| AC2 | `apps/web/tests/aim-fire.test.tsx` (TC-MATCH-936) — the arc runs from −90° clockwise, fills the circle at 4.0 and goes amber → red; `scene.ts` draws it at the fixed 64 px radius with the number at the top of the ring |
| AC3 | `TC-MATCH-936` — `fireFromPull` is the only producer of a `fire`, `force = round(power × 25)`, angle clamped, `weaponSlot` and `seq` carried; `tests/e2e/smoke.spec.ts` (TC-MATCH-902) shows the shot landing in the feed |
| AC4 | `TC-MATCH-936` (below the dead zone is `null`) + `TC-MATCH-916`; the `Kéo để lấy lực` hint now exists (`apps/web/src/i18n/*.json` `match.hint.pull`) and is raised once per match by the page |
| AC5 | `apps/web/tests/aim.test.tsx` (TC-MATCH-916) — two fingers classify as pan/zoom, never a pull |
| AC6 | `TC-MATCH-936` — the angle is clamped to the mobile window after the pad's offset |
| AC7 | `TC-MATCH-937` + `BattleHandle.setAimAllowed`: the scene refuses to start a pull and `drawAim` draws nothing, so no ring, no arc and no message |
| AC8 | `TC-MATCH-937` + the same-turn branch of `fireFromPull`; the page re-checks `canAim` on release, so a stale callback cannot fire twice |

Still manual, on a device at UAT (M2): the 16 ms update budget of AC2 under a real 60 Hz trace on iPhone 12 and
Galaxy A52 (`TC-MATCH-938`, procedure in `evidence/US-MATCH-002/README.md`), and that the hint is actually noticed —
it is visible in the walkthrough screenshot but "appears once" is a human observation.
