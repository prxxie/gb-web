---
id: US-MATCH-006
title: Move and angle with the four-way pad
epic: EPIC-05-match-ui
status: ready
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
| AC1 | the player's turn | the scene renders | ◀ ▶ ▲ ▼ appear around the mobile at a 96 px ring, each ≥ 60 × 60 logical px, and are absent outside your turn (`TC-MATCH-907`) |
| AC2 | a tap on ◀ or ▶ | the tap lands | The mobile steps one `moveDistance`/8 increment, `moveEnergy` is debited, and the moves-remaining badge decrements (`TC-MATCH-907`) |
| AC3 | ◀ or ▶ held | 100 ms elapses | The mobile keeps walking at 8 px per 100 ms until released, the energy or incline limit, the map bound, or `maxMovesPerTurn` is reached (`TC-CORE-904`) |
| AC4 | a tap on ▲ or ▼ | the tap lands | The barrel rotates ±1° inside the mobile's own window and the angle chip shows the new value (`TC-MATCH-917`) |
| AC5 | ▲ or ▼ held | 100 ms elapses | The barrel rotates 10°/s; the control dims and stops at `angleMin`/`angleMax` without overshooting (`TC-MATCH-917`) |
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

- `apps/web/src/game/hud/DirectionPad.tsx` (DOM buttons over the canvas, `pointerdown/up` captured per button) and
  `apps/web/src/game/hud/padAnchor.ts` (world → screen projection).
- `stepHold` is pure and unit-tested for the 120 ms tap threshold and the hold rate.

## 7. Out of scope

- A joystick (`OQ-40`), jumping/flying/mounts, tilt steering.
- Free drag-movement of the mobile sprite.

## 8. Test notes

`TC-MATCH-907` (pad visibility, steps, budget, turn end), `TC-MATCH-917` (angle stepping and band dimming),
`TC-MATCH-922` (pad stays fixed while zooming), `TC-CORE-904` (energy, incline and action limits) — see
[`05-quality/test-cases.md`](../../05-quality/test-cases.md).
Red first: `tests/web/direction-pad.test.tsx::disabled_when_moves_exhausted`.

## 9. Open questions

- **OQ-19** (accepted assumption) — movement values are design targets from our model; they change with playtest.
- **OQ-40** (answered) — the pad is the only movement control; the joystick is out of scope.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**in-progress.** the four-way pad, hold-repeat and the per-turn budget are inherited from `US-MATCH-007`; `stepHold` and `DirectionPad` are unit-tested, the touch feel is not.
