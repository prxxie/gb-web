# US-MATCH-001 — battlefield and HUD, browser run

- Ran: 2026-11-05, `npx playwright test` with the `Pixel 7 landscape` profile; worker on `127.0.0.1:8787`, Vite on
  `127.0.0.1:5273` (`E2E_WEB_PORT=5273`, because 5173 is held by another project on this machine)
- Result: `6 passed (8.2s)`; `e2e.txt` holds the run lines
- The case that belongs to this story: `TC-MATCH-901 ... the battlefield mounts and the HUD reports the turn` — asserts
  `match-screen`, `turn-clock`, `wind-dial` and `ruler[data-segments="8"]` after `play-bot`
- Not proven: AC for the "no unit jumps backwards between snapshots" half of TC-MATCH-901, and the real-device FPS check
  (`TC-OPS-180`)

## 2026-11-06 — still open

Re-ran the e2e suite today: `TC-MATCH-901` is green, so AC1 stands. The story stays `in-progress` because AC2 (no unit
jumps back between two snapshots 100 ms apart) has no case, AC3 is the manual device FPS check (`TC-OPS-180`), and
AC4/AC6/AC7 carry no traced case. See the story's Delivery status section.
