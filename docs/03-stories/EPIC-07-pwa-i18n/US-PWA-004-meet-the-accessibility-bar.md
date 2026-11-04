---
id: US-PWA-004
title: Meet the accessibility bar on every screen
epic: EPIC-07-pwa-i18n
status: ready
priority: P2
size: M
depends_on: [US-FND-003, US-MATCH-003]
open_questions: []
accepted_assumptions: []
refs: [01-overview/nonfunctional-requirements.md, 02-reference/screens/match.md, 02-reference/screens/README.md]
---

# US-PWA-004 — Meet the accessibility bar on every screen

## 1. Story

**As a** player with low vision or a screen reader
**I want** every control reachable and every number readable as text
**so that** the game is playable without perfect eyesight or a precise thumb.

## 2. Context

The canvas is the one part of the product that cannot be made fully accessible; the HUD carries the same information as
text and the scene is `aria-hidden`. The bar is WCAG 2.2 AA on the DOM surfaces, which is what the register owns.

| Topic | Reference |
|-------|-----------|
| NFR-16, NFR-17 | [nonfunctional-requirements.md](../../01-overview/nonfunctional-requirements.md) |
| HUD as the accessible mirror | [screens/match.md](../../02-reference/screens/match.md) |
| Layout and states | [screens/README.md](../../02-reference/screens/README.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | All seven routes | `axe-core` runs with the WCAG 2.2 AA rule set | Zero violations on each route (`TC-PWA-158`) |
| AC2 | Any screen at 200 % browser text size | It is rendered | No clipped text, no overlap, and the canvas keeps its aspect ratio (`TC-PWA-159`) |
| AC3 | Every interactive control on `/lobby/:code` and `/match/:code` | Its box is measured | Each is ≥ 44×44 logical px, fire/skip ≥ 60×60, spacing ≥ 8 px (`TC-PWA-160`) |
| AC4 | Keyboard only (desktop) | Tab through menu, lobby and results | Focus is visible, the order is logical, and no focus trap exists outside dialogs (`TC-PWA-161`) |
| AC5 | A screen reader on the match screen | HP or the active turn changes | The change is announced once via the polite live region; the canvas is not announced |
| AC6 | Colour alone conveys a state (win/loss, team) | It is inspected | A text or icon label accompanies the colour |
| AC7 | The focus order after a route change | A route loads | Focus moves to the route's `h1`, never stays on the removed control |

## 4. Contract

Rule: `@axe-core/playwright` `analyze()` with tags `["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]`, run per route
in `tests/e2e/a11y.spec.ts`, asserted with `expect(violations).toEqual([])`.

Live regions: one `aria-live="polite"` node per screen, updated at most once per second, text from `match.announce.*`.

Contrast tokens: `#f2f5ff` on `#0b1020` (12.6:1), muted `#a8b3cf` (6.1:1) — both pass AA for body text.

## 5. Rules and edge cases

- A canvas-only interaction must have a DOM equivalent: skip is a real button, the phrase picker is a real listbox.
- Aiming is pointer-only; it is documented as an accessibility gap in `screens/match.md`, and the bot match is the
  accessible path to gameplay — stated, not hidden.
- No `tabindex` above 0; no `role="button"` on a `div`; dialogs trap focus and return it on close.
- Motion: no autoplaying animation in the shell; the aim overlay respects `prefers-reduced-motion`.
- The document `lang` attribute follows the active locale.

## 6. Implementation notes

- `tests/e2e/a11y.spec.ts` iterates the route table from `screens/README.md`.
- `useRouteFocus()` moves focus to `#main h1` on navigation.
- Touch-target assertion iterates `button, [role="button"], a` and measures `boundingBox()`.

## 7. Out of scope

- Screen-reader support for aiming and the trajectory (documented gap).
- AAA conformance, high-contrast theme, colour-blind palettes beyond label pairing.

## 8. Test notes

`TC-PWA-158`, `TC-PWA-159`, `TC-PWA-160`, `TC-PWA-161`. `axe` runs in the CI e2e job; a violation fails the build.

## 9. Open questions

None.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**in-progress.** focus rings, 60 px canvas targets, `aria-live` and reduced motion are implemented; the axe pass is an e2e spec that was not executed here.
