# Verification pass — 2026-11-05

Independent re-run of what [`2026-11-05-implementation-status.md`](2026-11-05-implementation-status.md) claims, so the
first stories can move to `done` on evidence instead of on a note. Everything below was executed on this machine on
2026-11-05; the artifacts live under `docs/05-quality/evidence/`.

## 1. What was executed

| Command | Result |
|---|---|
| `npx tsc -b` | exit 0 |
| `npx eslint .` | exit 0 |
| `npx vitest run` | 12 files, **102 passed**, 2.50 s |
| `node .agents/scripts/verify-docs.mjs` | 0 errors, 0 warnings |
| `npx playwright test` (`E2E_WEB_PORT=5273`) | **6 passed**, 8.2 s |
| `wrangler dev` + ten-request curl smoke | health `200`, session `201`, room `201`, preview `200`, join `200`, turn credentials `200`, leaderboard `200`, WS `101`, unknown route `400` RFC 9457 |
| Two-socket script (host + guest) | `room_state`, `peer_joined`, `team_assign` → `A`/`B`, `match_started` (seed, `hostGeneration: 1`, ruleset `2026-11-05`), snapshot relay `seq: 1`, `host_changed` → `hostGeneration: 2`, reconnect replays `snapshot_state` |

Port note: Playwright's default web port 5173 was held by another project on this machine, so the run used
`E2E_WEB_PORT=5273`. The worker port is fixed at 8787 in `playwright.config.ts:30` and `apps/web/vite.config.ts:45`.

## 2. Findings

### Critical

1. **The doc set names test files that do not exist.** A scan of every `tests/...test.ts` path mentioned in `docs/`
   finds 65 missing files, including all five oracles that `docs/02-reference/api/signaling.md` relies on:
   `tests/worker/room-auth.test.ts`, `tests/worker/room-relay.test.ts`, `tests/worker/room-host.test.ts`,
   `tests/worker/room-election.test.ts`, `tests/core/protocol.test.ts`. The real suites are `packages/core/tests/`,
   `apps/worker/tests/lib.test.ts`, `apps/web/tests/`. Consequence: auth timeout, host-only enforcement, relay
   isolation and host election have **no automated test**, and the oracle column of that reference page is false.
2. **Test ids are cited for the wrong cases.** `tests/e2e/lobby.spec.ts` cites `TC-ROOM-071` (documented as
   `POST /rooms` with `maxPlayers: 3` → `422`, worker level) for a create-and-join happy path; `smoke.spec.ts` cites
   `TC-MATCH-902` (second finger cancels the pull), `TC-RANK-153` (ranked deltas) and `TC-PWA-063` (portrait rotate
   notice) for three different assertions; `a11y.spec.ts` cites `TC-PWA-158` (axe, zero WCAG 2.2 AA violations) for a
   name-and-size check; `apps/worker/tests/lib.test.ts:102` labels CORS tests `TC-FND-002` (env-var parity).
   `tests/meta/traceability.test.ts` only checks that a cited id exists in `test-cases.md`, so the mis-citation passes.
   The "72 of 162 cases automated" figure in the status report should be treated as unverified until the citations are
   corrected.

### Medium

3. **`.env.example` does not exist**, yet `US-FND-001` AC5 and `TC-FND-002` require it to match the env keys the worker
   reads (`ALLOWED_ORIGINS`, `CLERK_ISSUER`, `ENVIRONMENT`, `SESSION_TOKEN_SECRET`, `TURN_KEY_ID`,
   `TURN_KEY_API_TOKEN`, `VERSION`, plus the `GBW_DB`/`ROOMS` bindings). `apps/worker/.dev.vars` is present and
   git-ignored.
4. **Error-code and payload drift between story text and code.** `US-ROOM-003` AC4/AC5 and `US-NET-004:52-53` name
   `teams-not-balanced` and `invalid-state`; `packages/core/src/room.ts:189` emits `teams-unbalanced`, `not-lobby`,
   `not-full`, `not-enough-players`. `US-ROOM-003` § 4 also promises `match_started {startedAt: iso, turnOrder, seed:
   hex}` while the DO broadcasts epoch ms, no `turnOrder` and a numeric seed — the shape `signaling.md` documents.
5. **Layout drift.** `AGENTS.md` § PROJECT and several oracles say `tests/{core,worker,web,e2e}`; the repository has
   per-package `tests/` directories plus `tests/e2e` and `tests/meta`.
6. **Node version is stated three ways**: `AGENTS.md` says Node 24+, `package.json` `engines.node` says `>=22.12`, and
   this pass ran on v22.22.2 with everything green.
7. **TURN credentials are never issued locally.** `GET /api/v1/turn-credentials` answers `200` with
   `{"turn": false}` because the `.dev.vars` TURN values are placeholders; the WebRTC leg of `US-NET-*` remains
   unverified (the same is true of the Clerk placeholder `https://clerk.example.com`).

## 3. What this pass changes about the backlog

Stories stay `ready`. The pass proves slices of ACs for `US-FND-001`, `US-FND-002`, `US-AUTH-001`, `US-ROOM-002`,
`US-ROOM-003`, `US-ROOM-005`, `US-MATCH-001`, `US-MATCH-002`, `US-RANK-005`, `US-PWA-003` and `US-PWA-004` — recorded per
story under `docs/05-quality/evidence/<US-id>/README.md`, each naming what it does **not** prove. Marking any of them
`done` needs findings 1–4 resolved first, because their ACs cite cases that either do not exist or assert something
else.

## 4. Suggested order

1. Fix the citations and the oracle tables: make `test-cases.md`, `signaling.md` and the specs agree on which id belongs
   to which assertion, then make `tests/meta/traceability.test.ts` fail when a cited id's level or story differs.
2. Write the five missing worker suites named in `signaling.md` (auth, relay, host-only, election, protocol) — they are
   the only evidence for `US-ROOM-002/003/004/005` and `US-NET-004`.
3. Add `.env.example`, then reconcile `AGENTS.md`, `package.json` and `environment-setup.md` on the Node floor and the
   test layout.
4. Only then walk the stories in delivery order with `cpt-ship`, starting at `US-FND-001`.
