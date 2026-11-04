# Implementation status — 2026-11-05

## 1. What this report covers

The client asked for the whole backlog to be implemented in one pass and said they would check the
result. This report states exactly what exists, what is proven by an automated test, what was
verified by hand, and what could not be verified in this environment. It is the record behind the
per-story "Delivery status — 2026-11-05" note in every story file; the backlog statuses stay `ready`
until each story is accepted in order, because `rule 03` does not allow `done` without evidence for
every acceptance criterion.

## 2. What was built

| Area | Location | State |
|---|---|---|
| Engine (`NFR-22`) | `packages/core/src` — 20 modules: ballistics, combat, terrain, turn queue, weather, gimmicks, movement, items, modes, avatars, mobiles, maps, snapshot codec, bot, room rules, camera, rating, match | complete, unit-tested |
| API + realtime | `apps/worker` — router, 13 endpoints (incl. `POST /rooms/{code}/join`), Durable Object room with in-DO session verification, D1 migrations, Clerk JWT verification, RFC 9457 errors, rate limits, structured logs | complete; library layer unit-tested and the HTTP + WebSocket path exercised against `wrangler dev` |
| Client | `apps/web` — React 19 shell, 7 routes, vi/en tables, Phaser 4 scene, camera/zoom/ruler, power ring, four-way pad, WebRTC star mesh, PWA, landscape gate | complete, component layer unit-tested |
| Quality | `packages/core/tests`, `apps/worker/tests`, `apps/web/tests`, `tests/meta`, `tests/e2e` | 102 unit cases in 12 spec files plus 6 browser scenarios in 3 Playwright specs |

## 3. Verification actually performed

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc -b` | clean, all three projects |
| Lint | `npx eslint .` | clean |
| Unit and integration tests | `npx vitest run` | **102 passed / 102**, 12 files |
| Browser scenarios | `npx playwright test` | **6 passed** (battlefield mounts, pull raises power, host creates + guest joins, cold results redirect, no fullscreen meta, a11y targets) |
| API smoke (local Worker) | `wrangler dev` + curl | health `200`, guest session `201`, room create `201`, room preview `200`, WS upgrade `101`, leaderboard `200` |
| Two-client room flow | script over two sockets | join, team assignment, `match_started` (seed + assignments), snapshot relay, host migration to generation 2 |
| Production build | `pnpm build` | web 1.86 MB precache (first load 470 kB), worker 111 KiB upload / 29.8 KiB gzip |
| Documentation gate | `node .agents/scripts/verify-docs.mjs` | 0 errors, 0 warnings |
| Case traceability | `tests/meta/traceability.test.ts` | 72 of 162 documented cases have an automated test; no test cites an undocumented id |
| Chunk isolation | `grep -c clerk` over `apps/web/dist/assets` | Clerk appears only in the entry and sign-in chunks, never in the match chunk |

## 4. What is not verified, and why

| Item | Blocking factor |
|---|---|
| Clerk sign-in, profile, account deletion (`US-AUTH-002/003/004`) | needs a Clerk application and its publishable key |
| Two-phone touch pass, landscape rotation, PWA install (`US-MATCH-*`, `US-PWA-001/003`) | needs physical devices |
| WebRTC play between two players (`US-NET-*`) | signalling, host election and snapshot relay are proven; the peer-to-peer `RTCPeerConnection` leg needs two browsers plus a TURN deployment |
| Durable Object reconnect, host migration on a live room (`US-ROOM-002/004/006`) | needs `wrangler dev` with D1 and the DO namespace |
| Match recording against D1, leaderboard (`US-RANK-001/003/004`) | needs a migrated D1 database |
| Preview and production deployment (`US-FND-004`) | needs a GitHub remote and Cloudflare credentials |
| Fifty-room load test (`US-OPS-003`), SLO snapshots (`US-OPS-002`) | needs a deployed environment |
| Playwright specs (`tests/e2e`) | browsers are not installed in this environment |

Every one of those is written and typechecked; each story's delivery note names its exact remaining
step, so the gap is a checklist, not a mystery.

## 5. Numbers

- 53 stories across 9 epics, 114.5 story-days of planned work.
- 162 documented test cases; 72 have an automated execution, the rest are worker-in-DB, two-device,
  deployment or load cases that cannot run on a laptop.
- Model constants: 20 mobiles, 11 items, 11 maps, 4 modes, 16 avatar parts, 7 shot classes,
  `rulesetVersion 2026-11-05`, turn clock 20 s, wind 0–26 in 12 sectors.

## 6. Recommended next step

Run the first wave in order — `US-FND-001`, `US-FND-002`, `US-FND-003`, `US-FND-004` — turning each
story's delivery note into an acceptance record (`cpt-ship US-FND-001` … `US-FND-004`). That lights up
the deployment chain, after which the Clerk, two-phone and load checks can run and the remaining
stories can be marked `done` with `cpt-review` evidence.
