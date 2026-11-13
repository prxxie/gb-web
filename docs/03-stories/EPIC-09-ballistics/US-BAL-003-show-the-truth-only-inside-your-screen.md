---
id: US-BAL-003
title: Show the truth only inside your screen
epic: EPIC-09-ballistics
status: done
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
export function baselineShot(state: MatchState, slot: number, weaponSlot: 0 | 1 | 2, angle: number, force: number): ShotPreview;
```

Superseded in place: the draft contract above took `bar`, but nothing in the repo speaks bars yet — the wire field and the
resolver take `force` (`US-BAL-004` introduces bars), so the baseline takes `force` and the conversion stays in one place.

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

`TC-BAL-113` (`clipToWindow`: inside, crossing with a trimmed segment, muzzle already outside, left edge, vertical segment),
`TC-BAL-114` (baseline equality at wind 0, divergence at wind 22), `TC-BAL-115` (11 ticks at frames 0…100 of 101, collapse on
a short flight, last dot on the impact) in `apps/web/tests/preview-clip.test.tsx`; `TC-BAL-116`/`TC-BAL-117` (the drawn arc
ends at the edge; off by default and remembered across a reload) in `tests/e2e/aim-aid.spec.ts`.

Red: `apps/web/tests/preview-clip.test.tsx` — the aid's arc was the whole flight (58 raw resolver points on a 2 màn shot), so
`TC-BAL-113`'s first assertion (`toHaveLength(3)`) and `TC-BAL-115`'s tick count both failed against `previewDots: 24`, and
`data-preview-max-x` did not exist to read.

## 9. Open questions

None.

<!-- delivery:2026-11-13 -->

## Delivery status — 2026-11-13

**done.** `clipToWindow` in `apps/web/src/game/viewport.ts` (horizontal clipping — a shell arcs above the top of the frame in
every artillery game, so `x` is the axis the secret lives on; the crossing point is computed by trimming the last segment, and
the scene draws no tick and no blast ring there). `baselineShot` and `sampleByTime` in `apps/web/src/game/preview.ts`, with
`PREVIEW_STEPS` moved into `TUNABLES.previewSteps` (10) and the 6 px minimum gap into `TUNABLES.previewDotMinPx`; `previewDots:
24` is superseded — a fixed count said nothing about the flight.

The scene publishes `data-preview-max-x` / `data-preview-clipped` on the match screen so the rule is observable from a test
instead of a screenshot diff. The blast ring is withheld when the window cut the arc: a ring in the unseen half of the map is
the landing point, which is the answer the aid must not give.
