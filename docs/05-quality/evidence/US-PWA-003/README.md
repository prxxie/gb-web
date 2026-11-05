# US-PWA-003 — landscape, browser run

- Ran: 2026-11-05, Playwright (same run as `../US-MATCH-001/e2e.txt`)
- `TC-PWA-063: the page asks for landscape, never for a fullscreen launch flag` — the document has no
  `apple-mobile-web-app-capable` meta and the viewport meta carries `viewport-fit=cover`
- Caveat: the documented `TC-PWA-063` is "Portrait viewport → rotate notice only, no gameplay input; rotation mid-match
  keeps state". No portrait viewport was emulated in this pass
- Not proven: the rotate notice itself, input suppression in portrait, rotation mid-match, iOS/Android splash
