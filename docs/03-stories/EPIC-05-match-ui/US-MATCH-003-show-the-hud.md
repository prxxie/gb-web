---
id: US-MATCH-003
title: Show HP, wind, the turn clock and the roster in the HUD
epic: EPIC-05-match-ui
status: done
priority: P0
size: S
depends_on: [US-MATCH-001]
open_questions: []
accepted_assumptions: [OQ-24]
refs: [02-reference/screens/match.md, 01-overview/nonfunctional-requirements.md, 01-overview/glossary.md]
---

# US-MATCH-003 — Show HP, wind, the turn clock and the roster in the HUD

## 1. Story

**As a** player
**I want** the numbers that decide my next shot visible at a glance
**so that** I never lose a turn reading the screen.

## 2. Context

The HUD is DOM above the canvas: a roster strip with HP per player, the wind indicator, the turn clock with the active
player, and the turn number. It is also the accessible mirror of the canvas — every number the scene draws exists as
text here (`NFR-16`).

| Topic | Reference |
|-------|-----------|
| HUD layout and fields | [screens/match.md](../../02-reference/screens/match.md) |
| `maxHp`, `weather`, `turn` in the snapshot | [glossary.md](../../01-overview/glossary.md) |
| NFR-16, NFR-17 | [nonfunctional-requirements.md](../../01-overview/nonfunctional-requirements.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A snapshot | It is applied | HP **and shield** per slot, the wind dial, energy, the active slot, the round and each player's delay update within 100 ms and match the snapshot (`TC-MATCH-903`) |
| AC2 | The turn clock | It is rendered | It counts down from `deadlineAt` in whole seconds and never shows more than `turnDurationMs` |
| AC3 | A status change (active slot or turn number) | It happens | The change is announced once through an `aria-live="polite"` region in the current locale (`TC-MATCH-904`) |
| AC4 | Any HUD control | It is measured | Every target is ≥ 44×44, fire/skip are ≥ 60×60, gaps ≥ 8 px (`TC-PWA-160`) |
| AC5 | A player at HP 0 | The snapshot applies | Their roster entry shows `0` and an eliminated marker, still present in the strip |
| AC8 | The roster strip | It is rendered | Each seat shows its delay the way GunBound does: absolute for the active player, signed relative for the others (`TC-MATCH-903`) |
| AC6 | `weather.wind.magnitude = 0` | It is rendered | A hollow grey arrow and the number `0`, not "no wind" text |
| AC9 | east-or-west and magnitudes 0–26 | the dial renders | 2 ticks (east, west) with the sector's tick highlighted, the needle on the horizontal axis at `directionDeg`, the magnitude as a whole number beside it (`TC-MATCH-923`) |
| AC10 | `weather.rolledAtRound` changes | a new round starts | The 1.5 s banner `match.weather.changed` appears once, shows magnitude and direction in degrees, and any tap dismisses it without blocking input (`TC-MATCH-923`) |
| AC7 | The app at 200 % text size | The HUD renders | No number is clipped and the canvas keeps its aspect ratio (`TC-PWA-159`) |
| AC11 | A match on an 844×390 phone | The HUD is laid out | The four-way pad rings **this client's mobile** — the active one on the player's own turn (one button-gap from the hull, icon-only buttons at 80 % opacity), is clamped inside the viewport, and never covers the mobile it belongs to (`TC-MATCH-930`) |

## 4. Contract

HUD regions (top bar 56 px, roster strip 64 px, controls bottom-right):

| Region | Content | Copy keys |
|--------|---------|-----------|
| Roster strip | one chip per slot: avatar, display name, HP bar + number, eliminated marker, active highlight | `match.roster.*` |
| Wind dial | 12-tick compass, arrow at the sector, magnitude `0–26` | `weather.wind` |
| Turn clock | seconds remaining, active player's name, turn number | `match.turn`, `match.turnOf` |
| Controls | skip (60×60), phrase/emote (60×60) | `match.skip`, `match.phrases` |

The HUD subscribes to `SceneView` output via the same `GameSession` callback; it never polls.

| Signal | Direction | Contract |
|--------|-----------|----------|
| `setState(state, localSlot)` | page → scene | draw this snapshot, blending from what is on screen |
| `onPull/onRelease/onCancel` | scene → page | the local gesture, in power/angle units |
| `onCamera(window)` | scene → page | the visible window changed (pan or pinch) |
| `onFocus(point \| null)` | scene → page | where this client's mobile landed, in CSS pixels; `null` when it is not on screen. Reported only when the point moves ≥ 2 px, and `padLayout` turns it into the pad's corner (`TC-MATCH-930`) |

## 5. Rules and edge cases

- The dial's arrow points at `directionDeg` (a multiple of 30°); the magnitude is printed whole (`14`), never as a
  decimal, because the roll is an integer — and the same number the integrator uses (`tunables.md` § 1.1).
- The dial is 56 px and sits left of the turn clock; it never scales with camera zoom (`US-MATCH-007` AC6).
- The clock shows `0` and the skip animation while the turn resolves; it never shows a negative number.
- A missing member (disconnected) keeps a chip with a "disconnected" badge instead of disappearing.
- The canvas fills the viewport and the HUD is a transparent overlay on top of it (`US-MATCH-001` AC4); the pad's
  position, not an inset, is what keeps the controls off the aim area.
- The pad is the **one** control cluster: it rings the active mobile at 96 px, with icon-only buttons at 80 % opacity so
  the hull stays readable through it. When the ring would leave the viewport the box is clamped, corner-first; when the
  renderer reports no point (a client that has not drawn yet) the pad stays in its corner cluster.
- Each seat's delay is absolute for the active slot and signed against it for everyone else, because a queue is only
  meaningful relative to the player who is shooting.
- Live-region announcements are throttled to one per second to avoid flooding a screen reader.

## 6. Implementation notes

- The components live in `apps/web/src/components/`: `Roster`, `WindDial`, `WeaponStrip`, `ItemTray`, `DirectionPad`,
  `PhrasePicker`, `WeatherBanner`; each is a pure function of the snapshot plus its labels.
- The clock reads `deadlineAt` through `clockSeconds` (`apps/web/src/lib/clock.ts`), so "never more than the turn
  duration" is a unit test rather than a browser observation.
- The pad's geometry is `padLayout` (`apps/web/src/components/pad-layout.ts`): pure, clamped, and tested without a
  browser; the scene only reports the point it drew the mobile at.

## 7. Out of scope

- Skip and phrase actions themselves — [US-MATCH-004](US-MATCH-004-skip-and-send-a-phrase.md).
- Damage numbers floating over units (a scene effect, not shipped).

## 8. Test notes

`TC-MATCH-903` (values equal the snapshot), `TC-MATCH-904` (announcement), `TC-MATCH-930` (pad geometry), `TC-MATCH-931`
(the wind banner), `TC-MATCH-932` (the clock), `TC-MATCH-933` (delay column and the `0` on a wreck), `TC-MATCH-925` and
`TC-MATCH-923` (roster and dial), `TC-PWA-160` and `TC-PWA-159` (target sizes, 200 % text). RTL tests render the
components from a fixture snapshot; one Playwright test asserts the clock counts down.

Red: none — the components and their cases predate this pass; the pad's geometry and the banner were written red-first in
`apps/web/tests/pad-layout.test.tsx` and `apps/web/tests/weather-banner.test.tsx`.

## 9. Open questions

- **OQ-24** (accepted assumption) — eight chips fit in the 64 px strip at the two reference widths; if not, the strip
  scrolls horizontally instead of shrinking text below 12 px.

<!-- delivery:2026-11-06 -->

## Delivery status — 2026-11-06

**done.** All eleven acceptance criteria are met and traced. What this pass changed:

- **The pad rings the mobile (AC11)** — the defect recorded on 2026-11-06 is closed. `apps/web/src/game/scene.ts` reports
  the point it drew the active mobile at through the new `onFocus` callback (≤ 2 px threshold, so React is not asked to
  render per frame); `apps/web/src/components/pad-layout.ts` clamps that point into a 192 px box
  (`apps/web/tests/pad-layout.test.tsx`, `TC-MATCH-930`); `apps/web/src/components/DirectionPad.tsx` takes the point and
  the viewport, marks itself `match__pad--on-mobile`, and falls back to the corner cluster when there is none. The buttons
  stay icon-only (▲◀▶▼ with `aria-label`s) at `opacity: 0.8` in `apps/web/src/styles.css`, per the owner's instruction.
- **The delay column (AC1, AC5, AC8)** — `apps/web/src/components/Roster.tsx` gained `delayText` and a
  `data-testid="delay-<slot>"` cell: absolute for the active seat, signed against it for the others. A wreck now prints
  `0` **and** the marker, which is what this story's AC5 asks for (the `US-MATCH-001` AC6 wording was relaxed to match).
- **The round (AC1)** — `match.round` (`apps/web/src/i18n/{vi,en}.json`) renders in a `data-testid="turn-round"` chip
  beside the clock.
- **The clock (AC2)** — `apps/web/src/lib/clock.ts` `clockSeconds` caps at `turnDurationMs` and floors at 0
  (`TC-MATCH-932`). Corrected 2026-11-07: the readout was correct but frozen — it was derived at render time and
  nothing re-rendered while a turn ran, so a player watched `20s` for the whole turn (found by the offline walk for
  `US-PWA-001` AC3). `apps/web/src/routes/MatchPage.tsx` now runs a one-second heartbeat while the turn is live
  (`TC-MATCH-950`).
- **The wind banner (AC10)** — `apps/web/src/components/WeatherBanner.tsx` was missing entirely; it now appears once per
  `rolledAtRound`, lasts 1.5 s, and dismisses on a tap (`TC-MATCH-931`).
- Verified: `npx vitest run` 103 files / 863 cases, `npx tsc -b` and `npx eslint .` clean,
  `node .agents/scripts/verify-docs.mjs --fix` 0/0, `npx playwright test` 49 cases.

Still open, and **not** claimed by this story: the weapon/item strip keeps a fixed bottom-left corner
(`apps/web/src/styles.css` `.match__loadout`), so on 844×390 it sits over the aim area when the local mobile stands at
the map's left edge (`evidence/US-MATCH-003/ac11-pad-around-mobile-844x390.png`). AC11 covers the pad, not the strip;
giving the strip its own placement is a follow-up that needs a `US-MATCH-006` change or a new story.
