# US-RANK-005 — results screen, browser run

## 2026-11-05 — cold open (superseded)

- `TC-RANK-153: a finished match lands on the result screen` opened `/results/ABCD23` cold and asserted a redirect to `/`,
  i.e. the screen refused to invent a result when no match payload existed.
- That case never proved the deltas, and the id was reused for a different assertion. It now lives in
  `tests/e2e/routes.spec.ts` (a cold open with no payload still goes home) and `TC-RANK-153` means what the story says.

## 2026-11-07 — `tests/e2e/results.spec.ts`

- Command: `E2E_WEB_PORT=5401 pnpm e2e` (5173 was held by another app; the Playwright config reuses a running server
  outside CI, so the port has to be chosen explicitly). Full run: 56 passed.
- `TC-RANK-153` — a ranked payload renders `1284 → 1296 (+12)` / `1300 → 1288 (-12)`, the winner banner, and the
  viewer's row carries `me`.
- `TC-RANK-154` — an unranked payload states the reason and prints `—` in both rating cells.
- `TC-RANK-155` — `Chơi lại` on a room that answers `410 room-closed` creates a real room and lands on
  `/lobby/<code>`; the created room reports the payload's `maxPlayers`, `mode` and `mapId`.
- `TC-RANK-157` — a `409 match-already-recorded` on `POST /matches` is treated as success: the failure line is gone, no
  error is shown, and the screen renders the record the history returns.
- `TC-RANK-156` (Back) is a `web` case: `apps/web/tests/match-record.test.tsx` proves the handover replaces its history
  entry, which is what makes Back land outside `/match/:code`. A browser test would have to finish a real match first.
- Bot matches (`AC7`) are covered at component level (`results-screen.test.tsx`, `match-end.test.tsx`): a practice match
  never reaches the network, so there is nothing for a browser run to observe beyond the screen the component cases
  already mount.
