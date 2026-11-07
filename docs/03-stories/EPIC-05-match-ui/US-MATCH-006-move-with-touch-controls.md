---
id: US-MATCH-006
title: Move and angle with the four-way pad
epic: EPIC-05-match-ui
status: done
priority: P1
size: S
depends_on: [US-MATCH-002, US-CORE-008]
open_questions: []
accepted_assumptions: [OQ-19, OQ-40]
refs: [02-reference/screens/match.md, 02-reference/gameplay/tunables.md, 02-reference/data/mobiles.md]
---

# US-MATCH-006 — Move and angle with the four-way pad

## 1. Story

As a player, I want four controls to appear around my mobile on my turn — left/right to move, up/down to angle — so that
I can reposition and fine-tune the barrel without fighting the power pull.

## 2. Context

With one finger reserved for power and two fingers for the camera, movement and angle need their own affordance: a
**four-way pad anchored to the active mobile**. Left/right walk within the mobile's own movement budget; up/down rotate
the barrel inside the mobile's own angle window. The pad replaces the joystick entirely (`OQ-40`).

| Topic | Reference |
|---|---|
| Four-way pad, angle chip, gesture table | [`02-reference/screens/match.md`](../../02-reference/screens/match.md) |
| `moveDistance`, `moveEnergy`, `moveDelay`, `runMultiplier` | [`02-reference/gameplay/tunables.md`](../../02-reference/gameplay/tunables.md) § 4.4 |
| Per-mobile `angleMin…angleMax`, `maxMovesPerTurn` | [`02-reference/data/mobiles.md`](../../02-reference/data/mobiles.md) § 2 |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|---|---|---|
| AC1 | the player's turn | the scene renders | ◀ ▶ ▲ ▼ appear around the mobile at a 96 px ring, each ≥ 60 × 60 logical px, and are absent outside your turn (`TC-MATCH-907`, `TC-MATCH-930`) |
| AC2 | a tap on ◀ or ▶ | the tap lands | The mobile steps one `moveDistance`/8 increment, `moveEnergy` is debited, and the moves-remaining badge decrements (`TC-MATCH-907`) |
| AC3 | ◀ or ▶ held | 100 ms elapses | The mobile keeps walking at 8 px per 100 ms until released, the energy or incline limit, the map bound, or `maxMovesPerTurn` is reached (`TC-CORE-904`) |
| AC4 | a tap on ▲ or ▼ | the tap lands | The barrel rotates ±1° inside the mobile's own window and the angle chip shows the new value (`TC-MATCH-917`, `TC-MATCH-939`) |
| AC5 | ▲ or ▼ held | 100 ms elapses | The barrel rotates 10°/s; the control dims and stops at `angleMin`/`angleMax` without overshooting (`TC-MATCH-939`) |
| AC6 | the energy budget is spent or the move count is exhausted | a direction is pressed | The control is disabled with the badge `0` and no `move` is sent (`TC-MATCH-907`) |
| AC7 | the camera pans or zooms | the pad is drawn | It stays anchored to the mobile on screen and keeps its 96 px ring and 60 px size (`TC-MATCH-922`) |
| AC8 | the turn ends while a control is held | the turn passes | The control releases cleanly, the pad hides, and no stray `move` is sent (`TC-MATCH-907`) |

## 4. Contract

```ts
export type PadDirection = "left" | "right" | "angleUp" | "angleDown";

export interface DirectionPadProps {
  enabled: boolean;
  screenAnchor: { x: number; y: number }; // the mobile's position in screen space
  movesLeft: number;
  energy: number;
  angleWindow: { min: number; max: number };
  onMove(d: "left" | "right"): void;
  onAngle(d: "angleUp" | "angleDown"): void;
}

export function stepHold(heldMs: number, ratePerSecond: number, cap: number): number; // 0 when held < 120 ms
```

## 5. Rules and edge cases

- Direction is relative to the mobile's `facing`; a run is a hold that passes the 600 ms threshold on the same control
  (it doubles `moveEnergy` and `moveDelay` and adds `runMultiplier` distance).
- The angle the player sets is folded into the next `fire`; the pad never sends its own network message for angle, so a
  turn cannot be split into two partial inputs.
- A touch that starts on a pad control never becomes a power pull; the pad re-anchors on every scene frame while the
  camera moves.
- Pad visibility follows `turn.activeSlot === mySlot && !eliminated`.

## 6. Implementation notes

- `apps/web/src/components/DirectionPad.tsx` — DOM buttons over the canvas, `pointerdown/up` captured per button; the
  repeat comes from `stepHold`, the anchor from `apps/web/src/components/pad-layout.ts`. There is no
  `apps/web/src/game/hud/` package: the pad is DOM, the mobile is canvas.
- `stepHold` lives in `packages/core` and is unit-tested for the 120 ms tap threshold and the hold rate; the pad's own
  behaviour (budget, window bounds, a hold that outlives the turn) is `TC-MATCH-907` / `TC-MATCH-939`.
- The angle chip reads `45 + aimDelta`: the gesture angle is added to it at release, so the chip shows the resting
  barrel the pad has set. The scene paints the barrel itself from the same value.

## 7. Out of scope

- A joystick (`OQ-40`), jumping/flying/mounts, tilt steering.
- Free drag-movement of the mobile sprite.

## 8. Test notes

`TC-MATCH-907` (pad visibility, steps, budget, turn end), `TC-MATCH-917` (angle stepping and band dimming),
`TC-MATCH-922` (pad stays fixed while zooming), `TC-CORE-904` (energy, incline and action limits) — see
[`05-quality/test-cases.md`](../../05-quality/test-cases.md).
Red: `apps/web/tests/direction-pad.test.tsx` — `TC-MATCH-939` was written first and failed on the missing `angle` and
`angleWindow` props, then on the live interval that kept repeating after `enabled` went false.

## 9. Open questions

- **OQ-19** (accepted assumption) — movement values are design targets from our model; they change with playtest.
- **OQ-40** (answered) — the pad is the only movement control; the joystick is out of scope.

<!-- delivery:2026-11-07 -->

## Delivery status — 2026-11-07

**done.** The pad already carried most of § 3; this pass closed the four gaps between it and the criteria:

| AC | Evidence |
|----|----------|
| AC1 | `apps/web/tests/direction-pad.test.tsx` (TC-MATCH-907) — four labelled controls, disabled outside the turn; `TC-MATCH-930` pins the 192 px ring around the mobile (`US-MATCH-003` AC11) |
| AC2 | `TC-MATCH-907` — one step per tap; the badge now receives `maxMovesPerTurn − effects.movesThisTurn` (`apps/web/src/routes/MatchPage.tsx`) instead of the default `0` it had been showing |
| AC3 | `TC-MATCH-907` — 8 steps a second through `stepHold`, first step on press |
| AC4 | `TC-MATCH-907` — ▲/▼ one degree-step per tap; the **angle chip now exists** (`[data-testid="angle-value"]`, `45 + aimDelta`) — before this pass the page discarded the angle (`const [, setAngle]`) and showed nothing |
| AC5 | `TC-MATCH-939` — ▲ is disabled at `angleMax` and ▼ at `angleMin`, and the hold rate stays 10°/s |
| AC6 | `TC-MATCH-907` — a spent budget disables ◀ ▶ only, and a press sends nothing |
| AC7 | `TC-MATCH-930` — the pad re-anchors from the renderer's focus point every frame, so a pan or zoom moves it with the mobile |
| AC8 | `TC-MATCH-939` — a hold stops the moment `enabled` goes false (the interval is cleared in an effect), so a turn ending mid-drag sends no stray `move` |

Still manual: the pad's 96 px ring and 60 px targets on a real device (`TC-MATCH-907` covers the DOM, `TC-PWA-160` the
sizes), and the run threshold (600 ms) which is design until the M1 playtest (`OQ-19`).
