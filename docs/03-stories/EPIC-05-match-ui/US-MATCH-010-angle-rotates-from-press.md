---
id: US-MATCH-010
title: The angle rotates from where the pull started
epic: EPIC-05-match-ui
status: done
priority: P1
size: S
depends_on: [US-MATCH-002]
open_questions: []
accepted_assumptions: []
refs: [02-reference/screens/match.md]
---

# US-MATCH-010 — The angle rotates from where the pull started

## 1. Story

**As a** player

**I want** the same drag to give the same angle every time

**so that** aiming is a skill I can learn instead of a number that depends on how the browser batched my moves.

## 2. Context

Found by hand-playing a bot match on 2026-11-11, not by a test.

`game/viewport.ts` rotates the barrel with `baseAngle − dy × ANGLE_DEG_PER_PX` (0.25 °/px, `dy` measured from the press
point). `game/scene.ts` fed that function `this.barrelAngle` — *the angle the previous event had just produced* — and wrote
the result back on every `pointermove`. So each event re-applied the whole travel on top of an already-rotated barrel, and
a gesture's rotation scaled with the number of events the browser happened to deliver.

Measured before the fix: a 60 px downward drag swung the barrel from **45° to −10°** — its entire window, 55° — instead of
the 15° the constant promises, and the same physical drag landed on different angles in different runs. The 45° ceiling
also hid it: an upward drag clamped to 45° either way, so only downward (and small) movements showed the bug, which is why
four snapshots of a hand-run probe "looked fine".

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | the barrel is at 45° | the finger travels 60 px down, delivered as one move or as twelve | The angle reads 30° either way — the result does not depend on how many `pointermove` events carried the travel (`TC-MATCH-955`) |
| AC2 | a gesture has started | the finger moves up, down or sideways | The rotation is measured from the angle the barrel had **when the press armed**, so upward travel raises it symmetrically and sideways travel leaves it alone (`TC-MATCH-955`) |

## 4. Contract

```ts
/** Latch at press; never recompute while the pull runs. */
export function pullBaseAngle(pressAngle: number | null, barrelAngle: number): number {
  return pressAngle ?? barrelAngle;
}
```

`scene.ts` stores `pressAngle` when the hold arms (after the once-per-match seed) and clears it together with `origin` in
`clearOrigin()`, so a dropped gesture cannot rotate from a stale base.

## 5. Rules and edge cases

- The barrel still keeps the previous shot's angle between turns: the latch is taken at *press*, and the running
  `barrelAngle` is still written on every event for the ring and the readout.
- A press that arms but never travels (a tap) leaves the angle untouched, and a cancelled gesture keeps the last angle it
  reached, which is what the player saw before letting go.
- The angle is a rotation of the barrel, not `atan2(-dy, dx)` over the drag vector. `US-MATCH-002` AC6 still described the
  older radial model; that clause is marked superseded there and the rotation model (`gesture-input.md`) is the contract.
- The window still clamps: at the 45° ceiling an upward drag legitimately does nothing, and that is the mobile's window
  rather than a dead control.

## 6. Implementation notes

- `apps/web/src/game/viewport.ts` — `pullBaseAngle`, and the paragraph that says why the base is latched.
- `apps/web/src/game/scene.ts` — `pressAngle`, `clearOrigin()`, and the two `classify` calls that now pass the latched base.

## 7. Out of scope

- The 0.25 °/px feel itself. The bug was that the *rate* depended on the event count; whether 180 px should sweep 45° is a
  tuning question and belongs to a tunables change with its own measurement.

## 8. Test notes

`TC-MATCH-955` in `apps/web/tests/aim.test.tsx` models the scene's loop — latch at press, one `classify` per event, carry
the result forward — and asserts that one move of 60 px and twelve moves of 5 px agree, that the value is
`45 − 60 × ANGLE_DEG_PER_PX`, and that upward travel is symmetric while sideways travel is a no-op.

Red: `apps/web/tests/aim.test.tsx` — before the fix the same twelve-event drag resolved to −52.5° (the running barrel
subtracting each event's cumulative travel), while the single-event drag gave 30°; the case fails on that difference.

## 9. Open questions

None.

<!-- delivery:2026-11-11 -->

## Delivery status — 2026-11-11

**done.** Hand-verified in the same session: after the fix, a 60 px drag down read 45° → 30°, the same drag up read
30° → 45°, a sideways-only drag left the angle alone, and shots at 45° / 3.3 bars started landing (`Bắn trúng! … gây 148
sát thương`) where every shot in the four runs before the fix missed.
