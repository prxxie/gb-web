# Non-functional requirements

Every requirement below is measurable: a number and the way it is verified. `NFR-<nn>` ids are stable — stories cite
them, and `08-ops/slo.md` names the ones it monitors. A row marked **operational** is met by a process, not by a code
path, and it appears in the runbook instead of a test.

Targets inherited from the source spec carry `[spec: gbw-spec.md#…]`; targets added here carry `[brief §9]`.

## Performance

| Id | Requirement | How it is measured | Source |
|----|-------------|--------------------|--------|
| NFR-01 | The match scene holds **60 FPS** on iPhone 12 (Safari) and Galaxy A52 (Chrome) in a 2v2 match, defined as average frame time ≤ 16.7 ms over a 60 s sample. | Chrome DevTools performance trace on the device matrix, `05-quality/test-cases.md` TC-OPS-180; frame-time log in the debug overlay (`?debug=1`). | `[spec: gbw-spec.md#NFR-01]` |
| NFR-02 | A touch on an aim/fire control produces visible feedback in **< 100 ms** (touchstart → first painted frame showing the change). | Trace timeline with the `input` and `paint` markers, TC-OPS-180. | `[spec: gbw-spec.md#NFR-01]` |
| NFR-03 | Peak JS heap during a 4v4 match stays **< 200 MB**; first load transfers **< 5 MB** compressed (JS + assets for the shell and the match scene). | Heap snapshot after 3 matches (TC-PWA-043); Playwright network sum on a cold load (TC-PWA-043); `pnpm build` chunk report. | `[spec: gbw-spec.md#NFR-01]` |
| NFR-04 | A snapshot on the `state` channel stays **≤ 800 B** in an 8-player room at 10–20 Hz. The one frame that carries the terrain mask — sent once per carve — is instead bounded by the 8 KB per-frame cap, because the mask alone is 2.3–5.5 KB at 1 001 samples. | Protocol unit test that encodes a worst-case 8-player snapshot and asserts byte length by default and without the mask, plus the masked frame against the 8 KB cap, TC-CORE-041. | `[brief §9 / OQ-24]` |

## Cost and quota

| Id | Requirement | How it is measured | Source |
|----|-------------|--------------------|--------|
| NFR-05 | Every runtime component stays inside its **free tier**: Workers 100k requests/day, Durable Objects 1M requests/month, TURN 1,000 GB/month, D1 5M rows read and 100k rows written per day. Reaching 80 % of a limit is an alert, not a surprise. | Cloudflare dashboard quotas reviewed weekly (**operational**); the runbook names the alert for each quota. | `[spec: gbw-spec.md#NFR-02]` |

## Reliability and netcode

| Id | Requirement | How it is measured | Source |
|----|-------------|--------------------|--------|
| NFR-06 | Host migration completes in **< 5 s** from the moment the DO detects the host socket loss to the first snapshot from the new host. | Automated two-browser test that kills the host tab and measures `host_changed` → `snapshot` (TC-ROOM-049). | `[spec: gbw-spec.md#FR-06]` |
| NFR-07 | A dropped peer that reconnects within **20 s** returns to the same slot with the current snapshot; after 20 s its turns are skipped; it forfeits only when its whole team is disconnected. | Two-browser test with a forced offline window (TC-ROOM-046). | `[brief §4]` |
| NFR-08 | A match continues after any **single** peer disconnects; the room only ends when a whole team is disconnected or the host finishes the match. | Same test family (TC-ROOM-055, TC-ROOM-055). | `[brief §9]` |

## Security

| Id | Requirement | How it is measured | Source |
|----|-------------|--------------------|--------|
| NFR-09 | Gameplay media is encrypted end to end: WebRTC DTLS-SRTP only; signaling and API over WSS/HTTPS only; no TURN relay in plaintext. | Configuration review + a test that any `ws://`/`http://` endpoint URL is rejected by the client, TC-ROOM-052. | `[spec: gbw-spec.md#NFR-03]` |
| NFR-10 | TURN credentials are **short-lived (1 h)**, minted per session, never cached in the client beyond the session, never written to logs or `localStorage`. | Unit test on the credential response TTL and a grep-based log assertion in the Worker tests (TC-ROOM-051). | `[spec: gbw-spec.md#NFR-03]` |
| NFR-11 | Every protected operation authenticates **and** authorizes server-side, including object ownership (a profile write or a rated-match submission names only the caller's own account). | API tests for 401/403 on every protected endpoint + an IDOR test on `PATCH /api/v1/me` and `POST /api/v1/matches` (TC-ROOM-066…TC-ROOM-066). | `[brief §9, rule 06 §3]` |
| NFR-12 | No secret, token, cookie or PII appears in logs, error bodies, or client bundles. Clerk keys and the TURN secret live in Worker secrets; `.env.example` holds names only. | CI grep over the built bundle and a log-capture test (TC-OPS-173). | `[rule 06 §1]` |

## Privacy and data

| Id | Requirement | How it is measured | Source |
|----|-------------|--------------------|--------|
| NFR-13 | PII is limited to what the product needs: Clerk holds email; D1 stores **no** email address. A deletion request removes the Clerk user plus the `account`/`profile` rows within **30 days**. | Schema review (no email column in D1), a deletion test that asserts rows are gone (TC-AUTH-075). | `[brief §9 / OQ-26]` |
| NFR-14 | Every rating change is recorded in `rating_history` with before, after and delta, so any leaderboard value can be reconstructed. | Test that a rated-match submission writes one history row per participant (TC-RANK-110). | `[brief §8]` |
| NFR-15 | Match records and rating history are retained **24 months**, then deleted by an operational job; the leaderboard reads only `account.status = 'active'`. | Retention note in the runbook (**operational**) + a query test that excludes deleted accounts (TC-AUTH-103). | `[brief §9]` |

## Accessibility and localization

| Id | Requirement | How it is measured | Source |
|----|-------------|--------------------|--------|
| NFR-16 | The DOM shell meets **WCAG 2.2 AA**: contrast ≥ 4.5:1 for text, visible focus, keyboard operability of every non-gameplay screen, labels on all controls. The canvas scene exposes its critical state (turn, HP, wind, timer) as text outside the canvas. | axe-core in Playwright on every shell route (TC-PWA-156) + a manual screen-reader pass in the `M2` checklist. | `[brief §9]` |
| NFR-17 | Touch targets are **≥ 44 × 44 CSS px**, primary actions (fire, skip) **≥ 60 × 60**, with ≥ 8 px spacing. | Computed-style assertion in a Playwright test over the match and lobby screens (TC-PWA-158). | `[spec: gbw-spec.md#NFR-05]` |
| NFR-18 | The UI ships in **Vietnamese (default) and English**, switchable in-app without a reload; no user-visible string is hardcoded; layout tolerates 30 % text expansion (German-length test strings). | i18n lint (no literal strings in components), a Playwright pass in both locales, and the expansion fixture (TC-PWA-152). | `[brief §9 / OQ-09]` |
| NFR-19 | The app is **landscape-only** on phones: portrait shows a rotate notice instead of a squeezed layout. A tablet in landscape uses the same layout. | Playwright viewport test at 390 × 844 portrait and 844 × 390 landscape (TC-PWA-063). | `[brief §9 / OQ-22]` |

## Compatibility and installability

| Id | Requirement | How it is measured | Source |
|----|-------------|--------------------|--------|
| NFR-20 | Supported clients: **iOS 16+ Safari** and **Android 12+ Chrome** on the device matrix (iPhone 12, Galaxy A52, one tablet). Older browsers may degrade but are not tested. | Device matrix run before each gate (**operational**, manual). | `[brief §9 / OQ-23]` |
| NFR-21 | The PWA installs and launches offline for bot play; the service worker caches the shell and the match bundle and serves a versioned cache that is replaced on deploy. | Playwright offline test: load once, go offline, reload, start a bot match (TC-PWA-064). | `[spec: gbw-spec.md#FR-07]` |

## Maintainability

| Id | Requirement | How it is measured | Source |
|----|-------------|--------------------|--------|
| NFR-22 | Physics, protocol encoding and rating maths live in `packages/core` with **no Phaser, DOM or network imports**, so they are unit-testable in Node. | Import-boundary lint rule + the unit suite runs without a browser (TC-FND-018). | `[spec: gbw-spec.md#NFR-06]` |
| NFR-23 | All balance numbers come from `tunables/*.json` and each match records its `rulesetVersion`; changing a number requires no code change. | Test that loads two tunables files and asserts a different trajectory, plus the version field on a recorded match (TC-CORE-011). | `[spec: gbw-spec.md#NFR-06]` |

## Observability

| Id | Requirement | How it is measured | Source |
|----|-------------|--------------------|--------|
| NFR-24 | The Worker and the DO emit structured logs (JSON: `event`, `roomCode`, `matchId`, `durationMs`, `errorCode`) with **no** PII, and every 5xx is retrievable in Cloudflare Workers Logs for 3 days. | Log-shape unit test + a runbook drill that finds a seeded 5xx (**operational** for retention). | `[brief §10]` |
| NFR-25 | Room creation is rate-limited per IP (**10 rooms/minute**) and per account (**30 rooms/hour**); exceeding either returns `429` with `Retry-After`. | API test that exceeds the limit (TC-ROOM-072). | `[brief §9]` |

## Operations

| Id | Requirement | How it is measured | Source |
|----|-------------|--------------------|--------|
| NFR-26 | The API answers **99.5 % of requests with a non-5xx response** over a rolling 30 days, measured at the Worker. Room creation failing is a 5xx-class event even when the browser retries successfully. | Workers metrics: `5xx / total` per day, summed over 30 days (see `08-ops/slo.md`). | `[assumption: OQ-34]` |
| NFR-28 | The combat model is **deterministic**: the same seed, ruleset version and input sequence produce byte-identical state on host and peer, and across reloads. Anything that breaks it (an unseeded `Math.random`, wall-clock time inside `core`) is a defect, not a trade-off. | Two-device state-hash comparison in CI plus `TC-CORE-028`; the snapshot encoder is the canonical serialisation. | `[assumption: OQ-37]` |
| NFR-29 | Combat values are **data, not code**: mobiles, weapons, items, maps and tunables live in JSON versioned by `rulesetVersion`; a balance change needs no code deploy, and a version mismatch makes a match unranked rather than broken. GunBound numeric parity is **not** claimed — the model is a playtested replica. | Schema validation at build time (`TC-CORE-905`), `TC-CORE-011` for version propagation, `ADR-0005`. | `[assumption: OQ-19]` |
| NFR-27 | API latency **p95 ≤ 400 ms** and **p99 ≤ 1 s** for `/api/v1/*` excluding WebSocket lifetime, measured at the Worker. Leaderboard reads are cached 30 s and must stay under 150 ms p95. | Workers metrics per route (see `08-ops/slo.md`). | `[assumption: OQ-34]` |
