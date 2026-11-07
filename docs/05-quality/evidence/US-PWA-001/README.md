# US-PWA-001 — install the app and open it without a network

Evidence for the three criteria that need a production build (`AC1`–`AC3`), plus the manual check the story owes.

## Automated, 2026-11-07

`tests/e2e/pwa-prod.spec.ts` builds `apps/web`, serves `dist` with `vite preview` on `E2E_PREVIEW_PORT` (default
`5391`), and drives that server — the dev server ships no `sw.js`, so nothing here can pass against it.

| Criterion | Case | What it asserts |
|-----------|------|-----------------|
| AC1 | `TC-PWA-043` | `navigator.serviceWorker.ready` reports the root scope; the precache holds `index.html`, the CSS, the entry chunk, `MatchPage-*`, `SignInPage-*`, the manifest and both icons (12 entries, 1.88 MB on 2026-11-07); the served bytes stay under 5 MB |
| AC2 | `TC-PWA-044` | the summed `transferSize` of the cold load is under 5 MB, no `MatchPage-*` request is in that sum, and clicking "Play bot" is what fetches the chunk |
| AC3 | `TC-PWA-064` | after the worker controls the page: reload with `context.setOffline(true)`, the menu renders, "Play bot" reaches the battlefield, the turn clock counts down and a pull charges power |

Supporting cases in the same story: `TC-PWA-045` (`apps/web/tests/update-prompt.test.tsx`, AC5), `TC-PWA-046`
(`tests/e2e/pwa-shell.spec.ts`, AC6 — no `apple-mobile-web-app-capable`), `TC-PWA-047` (manifest, AC7), `TC-PWA-139`
(`tests/e2e/bundle.spec.ts`, AC4).

### The defect the offline walk found

The turn clock rendered `20s` and never moved: the readout was derived from `deadlineAt` at render time, and nothing
re-rendered while a turn ran. `US-MATCH-003` AC2 claimed a countdown; only the pure function had a case. Fixed with a
one-second heartbeat in `apps/web/src/routes/MatchPage.tsx` and guarded by `TC-MATCH-950`
(`apps/web/tests/match-wiring.test.tsx`).

## Manual check — installation on a phone (owed)

Not yet performed. Steps, on both an Android phone (Chrome) and an iPhone (Safari):

1. Open the deployed URL, "Thêm vào màn hình chính" / "Add to Home Screen".
2. Confirm the icon and the name `GBW` / `Game Bắn Súng Đạn Theo Lượt`.
3. Launch from the home screen. It opens **fullscreen, landscape** (no browser chrome).
4. Turn the network off, relaunch from the icon: the menu renders, "Chơi với máy" starts a match, the clock runs and a
   shot resolves.
5. Turn the network back on, redeploy, reopen: the "Cập nhật" prompt appears — and does not appear while a match runs.

Record the device, OS version and the result here when it is run (UAT M2 collects the phone checks).
