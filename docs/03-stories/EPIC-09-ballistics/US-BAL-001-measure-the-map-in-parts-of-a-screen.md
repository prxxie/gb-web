---
id: US-BAL-001
title: Measure the map in parts of a screen
epic: EPIC-09-ballistics
status: done
priority: P0
size: M
depends_on: [US-CORE-007]
open_questions: []
accepted_assumptions: []
refs: [02-reference/gameplay/tunables.md, 02-reference/screens/match.md]
---

# US-BAL-001 — Measure the map in parts of a screen

## 1. Story

**As a** player

**I want** the screen to be the ruler — one screen is eight parts, and the map is two and a half of them

**so that** I can say "three và một phần tư" to a teammate and we both mean the same distance.

## 2. Context

Distance was only ever expressed in world units, and the ruler on the map was decorative. The original game's whole
vocabulary is the screen: players count in parts of it. Fixing that unit is a precondition for the camera (`US-BAL-002`)
and for the solver (`US-BAL-007`) — both need the same definition of "how far".

| Topic | Reference |
|-------|-----------|
| Tunables and their units | [tunables](../../02-reference/gameplay/tunables.md) |
| The canvas and its framing | [screens/match](../../02-reference/screens/match.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | the tunables | they are read | `manWidth = 800`, `partsPerMan = 8`, `partWidth = 100`, and the map (2 000 u) is documented as 2.5 màn |
| AC2 | a match is on screen | the ruler is drawn | it divides the field into 8 divisions per màn and labels them in phần; no string in the UI or in `docs/` calls the unit a pixel |
| AC3 | the shooter and a point under the reticle | the HUD is read | the height difference between the shooter's feet and that point is shown in phần (negative when the point is below), to one decimal |
| AC4 | a canvas of any aspect | the window is computed | the window width is a whole number of parts and the part width is the same on both axes, so a circle drawn in world units stays a circle |

## 4. Contract

```ts
/** One screen of the original: the unit every distance is spoken in. */
export const MAN_WIDTH = 800;
export const PARTS_PER_MAN = 8;
export const PART_WIDTH = MAN_WIDTH / PARTS_PER_MAN; // 100
```

`TUNABLES` gains the three values; the camera, the ruler and the aim aid read them instead of literals.

## 5. Rules and edge cases

- The unit is world-space, never CSS or device pixels: a phone with twice the density must show the same distances.
- Rounding for display is one decimal of a phần (`3.2`), never more, and `-0.0` prints as `0.0`.
- The map edge is trimmed by `clampWindow`, so a window at the edge still shows 8 divisions.
- Any test or doc that still says "pixels" is stale and must be rewritten in the same commit.

## 6. Implementation notes

- `packages/core/src/tuning.ts` owns the constants; `packages/core/src/camera.ts` already has `RulerLayout` and can own the
  division maths.
- The HUD reads them through `useAimHud` — it must not import from `tuning` in two different ways.

## 7. Out of scope

- The camera's one-screen clamp (`US-BAL-002`).
- The solver's own use of the unit (`US-BAL-007`).

## 8. Test notes

`TC-BAL-101` (constants and the map in màn), `TC-BAL-102` (the ruler: one division is one part at every zoom, labels are
map part numbers), `TC-BAL-103` (the probe on a tap), `TC-BAL-104` (parts round-trip and the window keeps the aspect) —
`packages/core/tests/camera.test.ts`, `apps/web/tests/ruler.test.tsx`, `tests/e2e/one-screen.spec.ts`.

Red: `packages/core/tests/camera.test.ts` — `partsOf`/`unitsOf`/`formatParts` did not exist and every ruler case reported
**125** units per division against the old `rulerUnitTarget`, so `TC-BAL-101`/`TC-BAL-102` could not pass until the part
constants replaced it.

## 9. Open questions

None.

<!-- delivery:2026-11-13 -->

## Delivery status — 2026-11-13

**done.** `manWidth 800 / partsPerMan 8 / partWidth 100` in `packages/core/src/tuning.ts`, `partsOf`/`unitsOf`/`formatParts`
in `camera.ts`, the ruler re-based on parts (`segments = clamp(round(width / 100), 8, 24)`, labels are map part numbers), and
the HUD prints a tapped point as `Δ 2.3 phần · cao -0.8 phần` (`data-testid="probe"`). The window's width is published as
`data-field-width` on the match screen so the rule is observable from a test.

Superseded in place: `TC-MATCH-918`'s framing half and `TC-MATCH-920` (a division was 125 units, now one part).
