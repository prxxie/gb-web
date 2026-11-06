# US-PWA-003 — landscape gate, automated run

Superseded on 2026-11-06: every acceptance criterion now has a passing case. The 2026-11-05 note is kept below as
history because it predates the specs that closed the gaps.

## 2026-11-06 — what the story now stands on

- `tests/e2e/pwa-shell.spec.ts`, green in the 2026-11-06 run (`E2E_WEB_PORT=5273 npx playwright test`, 49 cases):
  - AC1/AC3 — a 412 × 915 window shows the rotate notice, the menu heading is mounted but invisible, and the notice
    carries exactly one control, the locale toggle (TC-PWA-063)
  - AC2 — rotating back paints `/leaderboard` with a single navigation entry, so the route was not reloaded
  - AC4 — at 1024 × 768 the battlefield takes more than 500 px of height and the canvas never exceeds it
  - AC5 — a rotation mid-match keeps the same canvas element and the same turn clock
  - AC6 — an 820 × 1180 desktop window gets the notice too
- `apps/web/tests/orientation.test.tsx` — the gate's unit half: one sentence of instruction, the game hidden but never
  unmounted, the debounced resize, and the pre-paint evaluation that avoids a flash of the game

## 2026-11-05 — original note (historical)

- Ran: Playwright, `TC-PWA-063` asserted only that the document has no `apple-mobile-web-app-capable` meta and that the
  viewport meta carries `viewport-fit=cover`; no portrait viewport was emulated in that pass
- No axe run and no mid-match rotation at the time
