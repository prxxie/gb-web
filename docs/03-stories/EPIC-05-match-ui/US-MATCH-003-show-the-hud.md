---
id: US-MATCH-003
title: Show HP, wind, the turn clock and the roster in the HUD
epic: EPIC-05-match-ui
status: ready
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
| AC9 | 12 sectors of 30° and magnitudes 0–26 | the dial renders | 12 ticks with longer ticks at `0/90/180/270`, cardinal labels, the arrow at `directionDeg`, the magnitude as a whole number beside it (`TC-MATCH-923`) |
| AC10 | `weather.rolledAtRound` changes | a new round starts | The 1.5 s banner `match.weather.changed` appears once, shows magnitude and direction in degrees, and any tap dismisses it without blocking input (`TC-MATCH-923`) |
| AC7 | The app at 200 % text size | The HUD renders | No number is clipped and the canvas keeps its aspect ratio (`TC-PWA-159`) |

## 4. Contract

HUD regions (top bar 56 px, roster strip 64 px, controls bottom-right):

| Region | Content | Copy keys |
|--------|---------|-----------|
| Roster strip | one chip per slot: avatar, display name, HP bar + number, eliminated marker, active highlight | `match.roster.*` |
| Wind dial | 12-tick compass, arrow at the sector, magnitude `0–26` | `weather.wind` |
| Turn clock | seconds remaining, active player's name, turn number | `match.turn`, `match.turnOf` |
| Controls | skip (60×60), phrase/emote (60×60) | `match.skip`, `match.phrases` |

The HUD subscribes to `SceneView.setState` output via the same `GameSession` callback; it never polls.

## 5. Rules and edge cases

- The dial's arrow points at `directionDeg` (a multiple of 30°); the magnitude is printed whole (`14`), never as a
  decimal, because the roll is an integer — and the same number the integrator uses (`tunables.md` § 1.1).
- The dial is 56 px and sits left of the turn clock; it never scales with camera zoom (`US-MATCH-007` AC6).
- The clock shows `0` and the skip animation while the turn resolves; it never shows a negative number.
- A missing member (disconnected) keeps a chip with a "disconnected" badge instead of disappearing.
- No HUD element may cover the aim area: the canvas is inset by the HUD heights, not overlaid by an opaque panel.
- Live-region announcements are throttled to one per second to avoid flooding a screen reader.

## 6. Implementation notes

- `apps/web/src/game/hud/` with `RosterStrip`, `WindDial`, `TurnClock`, `MatchControls`; each is a pure function of
  the snapshot.
- The clock uses `deadlineAt` from the snapshot and a local `requestAnimationFrame` tick; no `setInterval` drift.

## 7. Out of scope

- Skip and phrase actions themselves — [US-MATCH-004](US-MATCH-004-skip-and-send-a-phrase.md).
- Damage numbers floating over units (a scene effect, not shipped).

## 8. Test notes

`TC-MATCH-903` (values equal the snapshot), `TC-MATCH-904` (announcement), `TC-PWA-160`, `TC-PWA-159`. RTL tests render
the components from a fixture snapshot; one Playwright test asserts the clock counts down.

## 9. Open questions

- **OQ-24** (accepted assumption) — eight chips fit in the 64 px strip at the two reference widths; if not, the strip
  scrolls horizontally instead of shrinking text below 12 px.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**in-progress.** the HUD (wind dial with twelve ticks, power readout, clock, roster) is implemented and its components are unit-tested; the live HUD needs a running match.
