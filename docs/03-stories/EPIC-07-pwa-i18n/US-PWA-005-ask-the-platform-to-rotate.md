---
id: US-PWA-005
title: Ask the platform to rotate, and stop nagging desktop windows
epic: EPIC-07-pwa-i18n
status: done
priority: P2
size: S
depends_on: [US-PWA-003]
open_questions: []
accepted_assumptions: []
refs: [01-overview/nonfunctional-requirements.md, 02-reference/screens/README.md, 04-decisions/open-questions.md]
---

# US-PWA-005 — Ask the platform to rotate, and stop nagging desktop windows

## 1. Story

**As a** player

**I want** the app to turn the screen itself where the platform allows it, and never to be told to rotate a screen that
cannot rotate

**so that** the first thing the game asks of me is something I can actually do.

## 2. Context

`US-PWA-003` decided landscape-only (`OQ-22`) and gated portrait behind a rotate notice. Two things about that gate turned
out to be wrong in practice, and the owner asked for both to be fixed (2026-11-10, in reply to "sao cần người chơi phải tự
quay ngang, không tự quay ngang được à?"):

- **The app never asked the platform to rotate.** The manifest already declares `orientation: "landscape"`, which Android
  honours for an installed app — but nothing asked at runtime, so a browser tab or a device with rotation lock stayed stuck.
- **The gate fired on desktop windows.** A narrow browser window on a laptop is taller than it is wide, so it got "rotate the
  device" — an instruction for a screen that has no orientation. `US-PWA-003` AC6 codified that.

| Topic | Reference |
|-------|-----------|
| NFR-19 landscape-only | [nonfunctional-requirements.md](../../01-overview/nonfunctional-requirements.md) |
| Layout rules | [screens/README.md](../../02-reference/screens/README.md) |
| Decision this supersedes | [OQ-22](../../04-decisions/open-questions.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A desktop window taller than it is wide (fine pointer, no touch) | The app loads | The requested route renders and no rotate notice appears — supersedes `US-PWA-003` AC6 (`TC-PWA-194`) |
| AC2 | An installed app on a platform that has `ScreenOrientation.lock` | The player's first pointer or key gesture happens | The app asks for `landscape` exactly once, and a rejection changes nothing on screen (`TC-PWA-192`) |
| AC3 | A platform without the API (Safari) or a browser tab that is not installed | The player's first gesture happens | No lock is requested and no error is surfaced; the rotate notice stays the only fallback (`TC-PWA-192`) |
| AC4 | A touch device held in portrait | The app loads | The rotate notice appears, unchanged from `US-PWA-003` AC1 (`TC-PWA-152`) |

## 4. Contract

`isTouchDevice()` reads `(pointer: coarse)` or `(hover: none)`; `shouldGate()` is `isTouchDevice() && isPortraitViewport()`.
The gate is `shouldGate()`, evaluated before the first render and re-evaluated on the orientation media query and the
debounced `resize`/`orientationchange`.

`requestLandscapeLock()` awaits `screen.orientation.lock("landscape")` **only** when the display mode is `standalone`,
`fullscreen` or `minimal-ui`, because Chrome refuses the call outside an installed app and Safari has no `lock` at all. It
returns a boolean and never throws. `OrientationGate` calls it once, from the first `pointerdown` or `keydown`.

## 5. Rules and edge cases

- The lock is asked for **once**. A second call would be a second gesture the player never made, and the API needs one.
- A rejection is the normal path, not an error: Safari is roughly half the mobile web, and Chrome rejects in a tab. The
  promise's result is discarded on purpose.
- Being gated is a property of the **device**, not of the window shape, so resizing a desktop window never shows the notice
  and resizing a phone never hides it.
- The gate still hides rather than unmounts the match (`US-PWA-003` AC5 keeps its meaning).
- A touch laptop with a narrow window is gated, because `(pointer: coarse)` is true there; this is accepted rather than
  special-cased.

## 6. Implementation notes

- `apps/web/src/components/OrientationGate.tsx` — `isTouchDevice`, `shouldGate`, `requestLandscapeLock`, and the one-shot
  gesture listener.
- `apps/web/tests/orientation.test.tsx` — mocked `matchMedia` per query, a stubbed `screen.orientation`, and the rejection
  path.
- `tests/e2e/pwa-shell.spec.ts` — the landscape-gate describe now runs with `hasTouch: true`, and the desktop case lives in
  its own describe with the default (mouse) context.

## 7. Out of scope

- Software rotation (rendering the landscape UI turned 90° inside a portrait viewport). It is the only way to spare an
  iPhone the rotation, and it changes the touch coordinate system the aim gesture depends on, so it needs its own story and
  a decision about feel.
- Requesting fullscreen in order to unlock `ScreenOrientation.lock` on a non-installed Android tab.

## 8. Test notes

`TC-PWA-192` (the lock: asked once, installed only, rejection swallowed), `TC-PWA-193` (the unit-level gate decision),
`TC-PWA-194` (a desktop window gets the game; the same window with touch emulation is gated), plus the unchanged
`TC-PWA-152` and `TC-PWA-063`.

Red: `apps/web/tests/orientation.test.tsx` — `TC-PWA-193` and `TC-PWA-192` were written against the shipped gate, which had
no touch check and no lock request, and `tests/e2e/pwa-shell.spec.ts::TC-PWA-194` failed against the old AC6 behaviour.

## 9. Open questions

None. The one trade-off that is not taken here — software rotation — is named in § 7 as out of scope rather than assumed away.

<!-- delivery:2026-11-10 -->

## Delivery status — 2026-11-10

**done.** `apps/web/tests/orientation.test.tsx` proves the gate is now a device rule (a 600 × 900 fine-pointer window gets the
game, the same window with `(pointer: coarse)` gets the notice, and `shouldGate()` reports both), that the lock is requested
exactly once from the first gesture, that it is not requested when `screen.orientation.lock` is missing or the app is not
installed, and that a rejection resolves `false` instead of surfacing. `tests/e2e/pwa-shell.spec.ts` runs the landscape-gate
describe with `hasTouch: true` — Playwright's touch emulation does flip `(pointer: coarse)` and `(hover: none)`, which was
verified before the tests were changed — and keeps the desktop case in its own describe.

What is **not** proven, and cannot be from here: that an installed Android PWA actually lands in landscape. That needs a real
phone with the app installed; the code path is exercised with a stub, and the failure mode if it is wrong is the old notice.
