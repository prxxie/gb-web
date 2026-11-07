---
id: US-PWA-001
title: Install the app and open it without a network
epic: EPIC-07-pwa-i18n
status: done
priority: P1
size: M
depends_on: [US-FND-003, US-CORE-005]
open_questions: []
accepted_assumptions: []
refs: [01-overview/nonfunctional-requirements.md, 02-reference/screens/main.md, 01-overview/architecture.md]
---

# US-PWA-001 — Install the app and open it without a network

## 1. Story

**As a** player on mobile data
**I want** the app to open from my home screen with no signal
**so that** a dead zone does not mean a dead app.

## 2. Context

A Workbox-built service worker precaches the shell and the match bundle; offline play runs the bot match entirely
locally. The install prompt is offered after a match, not on first paint. There is deliberately no
`apple-mobile-web-app-capable` meta tag (`gbw-spec § 2.4`); Safari opens in a tab and that is accepted.

| Topic | Reference |
|-------|-----------|
| NFR-03 bundle budget, NFR-21 offline play | [nonfunctional-requirements.md](../../01-overview/nonfunctional-requirements.md) |
| Bot match entry point | [screens/main.md](../../02-reference/screens/main.md) |
| Shell and code splitting | [architecture.md](../../01-overview/architecture.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A first visit on a phone | The app finishes loading | A service worker is registered and the shell plus match bundle are precached (`TC-PWA-043`) |
| AC2 | A cold load over a throttled Fast 3G profile | The network panel is summed | Total transfer is < 5 MB, and the match chunk is fetched only when the player asks for a match, after the menu is interactive (`NFR-03`, `TC-PWA-044`) |
| AC3 | The app installed and the network disabled | The app is opened from the home screen | The menu renders and "Play bot" starts a full offline match (`TC-PWA-064`) |
| AC4 | The match route | Its chunk is inspected | It contains no Clerk code and no leaderboard code (`TC-PWA-139`) |
| AC5 | A new deployment | The app is reopened | The update is applied on the next navigation with a visible "Cập nhật" prompt, never mid-match (`TC-PWA-045`) |
| AC6 | iOS Safari 16+ | The app is opened | It works in a normal tab; no `apple-mobile-web-app-capable` meta tag is present in `index.html` (`TC-PWA-046`) |
| AC7 | The manifest | It is installed | Name, short name, `display: fullscreen`, `orientation: landscape`, theme colour and 192/512 icons are valid (`TC-PWA-047`) |

## 4. Contract

`vite-plugin-pwa` with `registerType: "prompt"`;
precache groups: `shell` (`index.html`, CSS, avatars, sky/terrain), `match` (Phaser + scene + core), `i18n`.
Runtime caching: none for `/api/v1/*` (always network, offline shows the banner), `stale-while-revalidate` for avatars.

`manifest.webmanifest`: `name` "Game Bắn Súng Đạn Theo Lượt", `short_name` "GBW", `display: "fullscreen"`,
`orientation: "landscape"`, `background_color` `#0b1020`, `theme_color` `#0b1020`, icons 192/512 (maskable).

## 5. Rules and edge cases

- The service worker never caches an API response, a session token or a TURN credential.
- An update must not swap the bundle during a match: `registerType: "prompt"` plus a route guard on `/match/:code`.
- A device in landscape-only mode and a stale cache must not produce a white screen: navigation fallback is `index.html`.
- Offline mode disables sign-in, rooms and the leaderboard with an explicit message, not a spinner.
- The install prompt is only offered from the results screen (one tap, dismissible, remembered).

## 6. Implementation notes

- `apps/web/vite.config.ts` PWA block (`VitePWA`, `registerType: "prompt"`, `injectRegister: null`, `manifest: false`, Workbox `navigateFallback: "/index.html"` with `/api/` denied); `apps/web/public/manifest.webmanifest`; `apps/web/src/app/serviceWorker.ts` (`registerServiceWorker`, `watchRegistration`, `applyUpdate`); `apps/web/src/components/UpdatePrompt.tsx`, suspended on `/match/:code` by `apps/web/src/app/RouteFrame.tsx`.
- The three criteria this story owns (AC1, AC2, AC3) are **only** observable on a production build: the dev server ships no `sw.js` and resolves every `import()` over the network. `tests/e2e/pwa-prod.spec.ts` therefore builds the app, serves `dist` with `vite preview` on its own port and drives that — AC1 reads the real precache out of the cache API, AC2 sums `transferSize` and proves the match chunk is not fetched until the button is tapped, AC3 turns the network off and plays.
- The budget is measured, not asserted in CI as a file check: the spec reads the precached responses and the cold-load `transferSize` and fails above `5 MB` (`BUDGET_BYTES`). The number behind it: 12 precached entries / 1.88 MB on 2026-11-07.

## 7. Out of scope

- Background sync of results (the result is submitted while online or retried on the results screen).
- Push notifications, offline multiplayer.

## 8. Test notes

Red: `tests/e2e/pwa-prod.spec.ts` — three criteria had no case at all before it: `TC-PWA-043` (precache) and the
transfer budget were prose in this file, and `TC-PWA-064` only proved the *menu* survived going offline, never a match.
The spec was written to fail on the dev server (no worker, no precache) and to pass only against `dist` — its first run
did fail, on the offline match's turn clock.

`TC-PWA-043` (precache + budget), `TC-PWA-044` (cold-load transfer, lazy match chunk), `TC-PWA-064` (offline menu and
offline bot match), `TC-PWA-045` (update prompt), `TC-PWA-046` (iOS tab), `TC-PWA-047`
(manifest), `TC-PWA-139` (no Clerk in the match chunk).
Playwright uses `context.setOffline(true)` after the worker controls the page.

## 9. Open questions

None.

<!-- delivery:2026-11-07 -->

## Delivery status — 2026-11-07

**done**, with one manual check owed.

| Criterion | Evidence |
|-----------|----------|
| AC1 registered + precached | `tests/e2e/pwa-prod.spec.ts` `TC-PWA-043` on a production build: root scope from `navigator.serviceWorker.ready`; the cache holds `index.html`, the CSS, the `index.html`/`index` script pair, `MatchPage-*`, `SignInPage-*`, the manifest and both icons — 12 entries, 1.88 MB, under the 5 MB budget |
| AC2 budget and lazy chunk | `TC-PWA-044`: summed `transferSize` of the cold load under 5 MB, no `MatchPage-*` request in that sum, and the click on "Play bot" is what fetches it |
| AC3 offline match | `tests/e2e/pwa-offline.spec.ts` `TC-PWA-064` (menu, disabled server actions) + `tests/e2e/pwa-prod.spec.ts` `TC-PWA-064` (offline reload, battlefield, the turn clock running, a pull charging power — with the network still off) |
| AC4 no Clerk in the match chunk | `tests/e2e/bundle.spec.ts` `TC-PWA-139` |
| AC5 update prompt | `apps/web/tests/update-prompt.test.tsx` `TC-PWA-045`, suspended on `/match/:code` |
| AC6 normal tab on iOS | `tests/e2e/pwa-shell.spec.ts` `TC-PWA-046` |
| AC7 manifest | `tests/e2e/pwa-shell.spec.ts` `TC-PWA-047` |

**Deviation recorded.** AC2 originally asked that the first interactive paint beat the match chunk. Measured as
"the chunk is not in the cold-load request list and the menu is interactive before it", which is the observable half;
the paint timing itself is not asserted, and the budget is measured on served bytes rather than on a throttled profile.

**Owed manual check.** Installing from a phone's home screen (Chrome on Android and Safari's "Add to Home Screen") and
opening it with the network off. Procedure: `docs/05-quality/evidence/US-PWA-001/README.md`; run at UAT M2, where the
phone checks are collected.

**Not changed.** `apps/web/vite.config.ts` lists `manifest.webmanifest` and both icons twice (once through
`includeAssets`, once through `globPatterns`). Workbox de-duplicates them on install, so the cache holds each once; the
duplication is noise in the config, left alone rather than risk the icon revisions.
