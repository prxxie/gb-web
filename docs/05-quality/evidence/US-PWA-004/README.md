# US-PWA-004 — accessibility, browser run

- Ran: 2026-11-05, Playwright (same run as `../US-MATCH-001/e2e.txt`)
- `TC-PWA-158: every button on the menu has an accessible name and a 44 px target` — every `button` on `/` has a non-empty
  accessible name and a bounding box of at least 44×44 px
- Caveat: the documented `TC-PWA-158` is "axe-core on every route, both locales → zero WCAG 2.2 AA violations". The test
  that carries the id is a hand-rolled name/size check on one route and one locale; the axe run does not exist
- Not proven: axe on the seven routes, the English locale, contrast, the fire/skip 60 px and 8 px gap rules of
  `TC-PWA-160`

## 2026-11-06 — still open

Re-ran the suite today: `tests/e2e/pwa-a11y.spec.ts` (AC5) and `apps/web/tests/route-focus.test.tsx` (AC7) are green.
The story stays `in-progress` because AC1 still has no `axe-core` run — the package is not a dependency, and
`tests/e2e/a11y.spec.ts` carries TC-PWA-158 as a hand-rolled name/size check — while AC2 (200 % text),
the 8 px spacing, the lobby/results focus order and the colour-plus-label rule are untraced.
