---
id: US-PWA-003
title: Enforce the landscape layout with a rotate notice
epic: EPIC-07-pwa-i18n
status: done
priority: P1
size: S
depends_on: [US-FND-003]
open_questions: []
accepted_assumptions: []
refs: [01-overview/nonfunctional-requirements.md, 02-reference/screens/README.md, 04-decisions/open-questions.md]
---

# US-PWA-003 — Enforce the landscape layout with a rotate notice

## 1. Story

**As a** player
**I want** a clear instruction instead of a broken layout when I hold the phone upright
**so that** I never see a half-drawn battlefield.

## 2. Context

The spec asked for both orientations at FIT scale; the interview decided landscape-only (`OQ-22`), because a 4v4
battlefield in portrait makes touch targets and the HUD unusable. Portrait shows a rotate notice and nothing else.

| Topic | Reference |
|-------|-----------|
| NFR-19 landscape-only | [nonfunctional-requirements.md](../../01-overview/nonfunctional-requirements.md) |
| Layout rules | [screens/README.md](../../02-reference/screens/README.md) |
| Decision | [OQ-22](../../04-decisions/open-questions.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A phone in portrait | The app loads | Only the rotate notice is rendered — no canvas, no HUD, no partial shell (`TC-PWA-063`) |
| AC2 | A phone rotated to landscape | The rotation completes | The app renders the requested route without a reload and the match, if any, is unaffected |
| AC3 | The rotate notice | It is displayed | It is translated in the active locale, names the reason in one sentence, and has no interactive control except the locale toggle |
| AC4 | A tablet in landscape at 1024×768 | The app renders | The layout uses the extra height without stretching the canvas beyond FIT |
| AC5 | A device rotated during an active match | The rotation completes | The match continues, the scene re-scales, and no turn is lost |
| AC6 | A desktop browser window narrower than it is tall | The app loads | ~~The rotate notice appears, with the same rule as a phone~~ — **superseded by `US-PWA-005` AC1**: a window with a fine pointer gets the game, because it cannot rotate |

## 4. Contract

Detection: `matchMedia("(orientation: landscape)")` plus `window.innerHeight > window.innerWidth`, evaluated on
`resize`/`orientationchange` (debounced 100 ms). Rendering: `<OrientationGate>` wraps the router outlet.

`manifest.orientation = "landscape"` for installed instances; the gate remains the fallback in a browser tab.

## 5. Rules and edge cases

- The gate must not unmount the match route; it hides it (`display: none`) so the scene keeps its state.
- ~~The screen lock API is not requested~~ — **superseded by `US-PWA-005` AC2**: it is requested once, best-effort, and
  only for an installed app. Safari has no such API, which is why the notice stays the fallback.
- The notice must not flash during the first paint of a landscape device (evaluate before the first render).
- Height-based CSS (`dvh`) is used so the iOS toolbars do not crop the HUD.

## 6. Implementation notes

- `apps/web/src/components/OrientationGate.tsx` (moved from `app/`), `apps/web/tests/orientation.test.tsx` with a mocked
  `matchMedia`.
- `resize_page` in the Playwright suite covered AC6, which `US-PWA-005` AC1 supersedes.

## 7. Out of scope

- A portrait match layout, a rotated canvas, orientation-specific artwork.

## 8. Test notes

`TC-PWA-063` (portrait → notice, landscape → route; rotation mid-match keeps state), `TC-PWA-152`.
Red: none — the gate and its cases arrived in the same change, so no earlier case exists to name; the first failure
on this surface is `tests/e2e/a11y.spec.ts::TC-FND-133`, which belongs to the shell's tap targets, not to the gate.

## 9. Open questions

None. The deviation from the spec is recorded as answered `OQ-22`.

<!-- delivery:2026-11-06 -->

## Delivery status — 2026-11-06

**done.** All six ACs passed on 2026-11-06. `tests/e2e/pwa-shell.spec.ts` proves the portrait notice with nothing of
the game reachable and the locale toggle as the only control (TC-PWA-063, AC1/AC3), rotation painting the requested
route without a second navigation (AC2), the tablet's extra height going to the battlefield instead of a stretched
canvas (AC4) and a mid-match rotation keeping the same canvas and the same turn clock (AC5); a tall desktop window
shows the notice too (AC6, superseded by `US-PWA-005` AC1). `apps/web/tests/orientation.test.tsx` covers the gate itself, including the debounced resize.
