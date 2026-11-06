# US-MATCH-001 — battlefield and HUD, browser run

- Ran: 2026-11-05, `npx playwright test` with the `Pixel 7 landscape` profile; worker on `127.0.0.1:8787`, Vite on
  `127.0.0.1:5273` (`E2E_WEB_PORT=5273`, because 5173 is held by another project on this machine)
- Result: `6 passed (8.2s)`; `e2e.txt` holds the run lines
- The case that belongs to this story: `TC-MATCH-901 ... the battlefield mounts and the HUD reports the turn` — asserts
  `match-screen`, `turn-clock`, `wind-dial` and `ruler[data-segments="8"]` after `play-bot`
- Not proven: AC for the "no unit jumps backwards between snapshots" half of TC-MATCH-901, and the real-device FPS check
  (`TC-OPS-180`)

## 2026-11-06 — browser walk at 844×390

Driven through the Chrome DevTools MCP tools against the dev servers already running on this machine (worker
`127.0.0.1:8787`, Vite `127.0.0.1:5273`), viewport `844x390` landscape with touch emulation, `?` cleared so the real
menu serves. `ac1-battlefield-844x390.png` is the screenshot of the mounted screen.

What the DOM reported after `play-bot` and the redirect to `/match/AAAAAA`:

- `canvas` 844 × 313 with `touch-action: none`; `turn-clock` reading `20s`; `wind-dial` with `aria-label="Gió: 0"`;
  `ruler[data-segments="8"]` with ticks 0, 125, 250, 375, 500, 625, 750, 875, 1000
- roster cells: `Guest e856 · 1050/1050 +150` and `Máy · 1150/1150 +250`, both present before any shot
- `document.scrollingElement.scrollWidth` 844 = viewport width, so the page never scrolls sideways (`TC-FND-133`)
- `scrollHeight` 394 against a 390 viewport: 4 px of vertical overflow, recorded as a follow-up in the story

Interaction (`AC1`, `AC2` by eye): synthetic `PointerEvent`s reach the scene once `setPointerCapture` is stubbed (a
synthetic pointer id makes the real call throw `NotFoundError`). A pull raised `power-value` to 1.90 and then 4.00 and
the release fired: `event-feed` grew with `Lượt 7`, `Thời tiết: gió 25`, `Lượt 8`, `Bắn (đạn 230)`, `Lượt 9`,
`Thời tiết: gió 0` — the shot resolved, the turn went to the bot and came back, and the console stayed clean. Neither
mobile took damage because the aim was arbitrary, so this walk says nothing about elimination.

## 2026-11-06 — what closed since

`AC7` is automated now: `apps/web/tests/match-end.test.tsx` `TC-MATCH-926` (2 cases) mocks `mountBattle`, drives the
page with a finished state and asserts the handle is destroyed, the `gbw.result` payload is written once with
`winCondition`, and the route lands on the results screen. The WebGL-context half of the old manual check (no second
context retained in a heap snapshot) is still worth one look at UAT.

`AC2` and `AC6` are `apps/web/tests/interpolate.test.tsx` `TC-MATCH-924` (12 cases) and `apps/web/tests/roster.test.tsx`
`TC-MATCH-925` (5 cases).

## Still owed — the one device check

- **AC3** — `TC-MATCH-927` (60 FPS ±5 over 30 s with eight players, iPhone 12 + Galaxy A52). Not performed: no device on
  hand. Procedure: load the screen on each phone in landscape, start a bot match with the full 4v4 roster, play five
  turns firing at least one weapon, and record the frame rate from the browser's performance panel over 30 s. Runs on
  the `US-OPS-004` device matrix at UAT (M2) and lands in that story's record.
- **AC4's HUD clause** — on 844 × 390 the weapon pad covers about 60 % of a mobile near the map's left edge. HUD layout,
  owned by `US-MATCH-003` § 5; the framing itself (window aspect, feet 70 % down, no sideways scroll) is met and measured.
- **AC5** — `TC-MATCH-929` is the rotate gate, proven by `TC-PWA-063` in `tests/e2e/pwa-shell.spec.ts`; the portrait
  screenshot is not filed here because `US-PWA-003` owns it.
