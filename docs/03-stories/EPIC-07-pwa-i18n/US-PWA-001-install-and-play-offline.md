---
id: US-PWA-001
title: Install the app and open it without a network
epic: EPIC-07-pwa-i18n
status: ready
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
| AC2 | A cold load over a throttled Fast 3G profile | The network panel is summed | Total transfer is < 5 MB, and the first interactive paint happens before the match chunk is fetched (`NFR-03`) |
| AC3 | The app installed and the network disabled | The app is opened from the home screen | The menu renders and "Play bot" starts a full offline match (`TC-PWA-064`) |
| AC4 | The match route | Its chunk is inspected | It contains no Clerk code and no leaderboard code (`TC-PWA-139`) |
| AC5 | A new deployment | The app is reopened | The update is applied on the next navigation with a visible "Cập nhật" prompt, never mid-match |
| AC6 | iOS Safari 16+ | The app is opened | It works in a normal tab; no `apple-mobile-web-app-capable` meta tag is present in `index.html` |
| AC7 | The manifest | It is installed | Name, short name, `display: fullscreen`, `orientation: landscape`, theme colour and 192/512 icons are valid |

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

- `apps/web/vite.config.ts` PWA block; `apps/web/src/app/update.ts` for the prompt.
- Bundle budget asserted in CI with a size check on `dist/assets/*` (fails above 5 MB total, 1.5 MB for the match chunk).

## 7. Out of scope

- Background sync of results (the result is submitted while online or retried on the results screen).
- Push notifications, offline multiplayer.

## 8. Test notes

`TC-PWA-043` (precache + < 5 MB), `TC-PWA-064` (offline bot match), `TC-PWA-139` (no Clerk in the match chunk).
Playwright uses `context.setOffline(true)` after the first load.

## 9. Open questions

None.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**in-progress.** the manifest, the service worker and the bot offline path are configured and the production build precaches 1.86 MB; installation on a phone is a manual check.
