# US-PWA-004 — accessibility, browser run

- Ran: 2026-11-05, Playwright (same run as `../US-MATCH-001/e2e.txt`)
- `TC-PWA-158: every button on the menu has an accessible name and a 44 px target` — every `button` on `/` has a non-empty
  accessible name and a bounding box of at least 44×44 px
- Caveat: the documented `TC-PWA-158` is "axe-core on every route, both locales → zero WCAG 2.2 AA violations". The test
  that carries the id is a hand-rolled name/size check on one route and one locale; the axe run does not exist
- Not proven: axe on the seven routes, the English locale, contrast, the fire/skip 60 px and 8 px gap rules of
  `TC-PWA-160`
