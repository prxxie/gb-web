---
id: US-PWA-006
title: A browser tab can ask for landscape too
epic: EPIC-07-pwa-i18n
status: done
priority: P1
size: S
depends_on: [US-PWA-005]
open_questions: []
accepted_assumptions: []
refs: [02-reference/screens/match.md]
---

# US-PWA-006 — A browser tab can ask for landscape too

## 1. Story

**As a** player who opens the site from a link instead of installing it

**I want** the app to try the landscape lock anyway

**so that** I am not told to rotate my phone by an app that never asked the platform to do it for me.

## 2. Context

`US-PWA-005` shipped a lock that only ever ran for an **installed** app: `requestLandscapeLock()` returned `false` unless
`display-mode` was `standalone`, `fullscreen` or `minimal-ui`. The owner reported that production still did not rotate.

Reproduced against `https://gbw-pages.pages.dev` on 2026-11-11 with a touch device held upright (412×839):

- the rotate notice rendered, `pointer: coarse` and portrait both true, and no display-mode matched — a browser tab;
- `typeof screen.orientation.lock` was `"function"`, and calling `lock("landscape")` in that tab **succeeded**;
- the app never called it: after a tap, `document.fullscreenElement` was still `null` and nothing had been asked.

So the capability was there and the guard threw it away. Chrome honours `lock()` in a **fullscreen** document, and a tab is
not fullscreen however the manifest reads — asking for fullscreen from the same gesture is what makes the lock reachable
outside an installed app. `US-PWA-005` AC2/AC3 codified the guard rather than the goal, so both are superseded here.

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | a touch device in a browser tab (no display-mode) | the first pointer or key gesture happens | The app asks the document for fullscreen and then asks for `landscape`, once; a refusal is swallowed and the notice stays (`TC-PWA-195`, `TC-PWA-197`) |
| AC2 | a document that already owns the screen (real fullscreen, or an installed app's `display-mode: fullscreen`) | the same gesture happens | No second fullscreen request is made, and the lock is still asked for (`TC-PWA-196`) |
| AC3 | a desktop window (fine pointer) | the first click happens | Nothing is asked at all — no fullscreen, no lock: a mouse has no orientation to lock (`TC-PWA-198`) |

## 4. Contract

```ts
/** Real fullscreen, or an installed app's fullscreen display mode. */
export function isFullscreenNow(): boolean;

/** Lock exists? → if the document does not own the screen, ask for fullscreen → ask for `landscape`. */
export async function requestLandscapeLock(): Promise<boolean>;
```

`enterFullscreen()` swallows its own rejection: a browser that refuses the gesture has the rotate notice as its fallback,
and the caller cannot tell the two refusals apart in any way a player would notice.

## 5. Rules and edge cases

- A platform without `lock` (Safari) returns `false` **before** any fullscreen request, so an iPhone is never thrown into
  fullscreen for nothing.
- Fullscreen refused → the lock is still attempted once (a browser may refuse fullscreen and still allow the lock); if it
  rejects, the promise resolves `false` and nothing throws.
- The gate only arms the gesture listener on a touch device, so a desktop page cannot jump to fullscreen on its first click.
- The match keeps its own fullscreen arming (`US-MATCH-007` AC1); a second request in the same gesture rejects harmlessly.

## 6. Implementation notes

- `apps/web/src/components/OrientationGate.tsx` — `isFullscreenNow`, `enterFullscreen`, the rewritten
  `requestLandscapeLock`, and `isTouchDevice()` around the listener registration.
- `apps/web/tests/orientation.test.tsx` — the case that asserted "a browser tab is not asked" is re-specified into
  `TC-PWA-195`; the fullscreen spy is installed once and a case changes its behaviour, because reassigning the spy between
  tests left the document element holding the previous one (which is what hid the refusal case for a moment).

## 7. Out of scope

- Software rotation for a device the platform refuses to rotate (iPhone portrait): that needs the touch coordinates and the
  44 px hit boxes remapped, and it was rejected as option B in `US-PWA-005`.
- A visible "enter fullscreen" control: the first gesture is already the player's own, and adding a button to the rotate
  notice would break `US-PWA-003` AC3's one-control rule.

## 8. Test notes

`apps/web/tests/orientation.test.tsx` under jsdom: the document element carries one `requestFullscreen` spy for the file, a
case flips `fullscreenImpl` to refuse, and `display-mode` comes from the existing `matchMedia` stub.

Red: `apps/web/tests/orientation.test.tsx` — `TC-PWA-195` failed before the fix: `requestLandscapeLock()` returned
`false` in a tab and the fullscreen spy was never called, which is exactly what production did.

## 9. Open questions

None.

<!-- delivery:2026-11-11 -->

## Delivery status — 2026-11-11

**done**, with one honest caveat: the mechanism is proven by unit tests and by a production probe that ran `lock()` in a
tab, but *"the phone really rotated"* can only be confirmed on a physical Android device in Chrome — headless Chromium
reports the lock as accepted without a screen to turn. `docs/05-quality/test-plan-status.md` records that gap.
