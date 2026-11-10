# Test plan — what is written, what is planned

This register exists because the reference docs name the test file that proves each contract, and a name in a doc is a
promise the repository is expected to keep. It is checked by the `Oracle` tables in `02-reference/` and `03-stories/`:
every path listed there is either in the *written* list below or in the *planned* table with the docs that name it, and
an oracle whose file is still planned says so in the cell (`— planned, see 05-quality/test-plan-status.md`).

A planned file is not a defect by itself — it is the honest state between a plan and its implementation. Marking a
story `done` while one of its oracles is still planned is a Definition-of-Done failure
(`.agents/rules/03-definition-of-ready-and-done.md` § D2/D6); the stories in that position are named in § 3 instead of
being left implicit.
The list is a snapshot taken by hand as files land; `verify-docs.mjs` does not generate it.

## 1. Written

**123 Vitest files (1036 cases)** across the four suites and **22 Playwright specs (74 cases)**, green on 2026-11-08
(`pnpm test`, `pnpm e2e`). `tests/meta/traceability.test.ts` reports **296 of 360 documented cases** with an automated
test; the floor it enforces is `tests/meta/traceability-baseline.txt`.

| Area | Files |
|------|-------|
| Core simulation and content | `packages/core/tests/avatars.test.ts`, `packages/core/tests/ballistics.test.ts`, `packages/core/tests/bot.test.ts`, `packages/core/tests/camera.test.ts`, `packages/core/tests/combat.test.ts`, `packages/core/tests/data.test.ts`, `packages/core/tests/gimmicks.test.ts`, `packages/core/tests/imports.test.ts`, `packages/core/tests/items.test.ts`, `packages/core/tests/maps.test.ts`, `packages/core/tests/match.test.ts`, `packages/core/tests/mobiles.test.ts`, `packages/core/tests/modes.test.ts`, `packages/core/tests/movement.test.ts`, `packages/core/tests/phrases.test.ts`, `packages/core/tests/protocol.test.ts`, `packages/core/tests/rating.test.ts`, `packages/core/tests/room.test.ts`, `packages/core/tests/snapshot.test.ts`, `packages/core/tests/terrain.test.ts`, `packages/core/tests/turn-queue.test.ts`, `packages/core/tests/turn.test.ts`, `packages/core/tests/weather.test.ts` |
| Worker and Durable Object | `apps/worker/tests/accounts.test.ts`, `apps/worker/tests/api-contract.test.ts`, `apps/worker/tests/auth.test.ts`, `apps/worker/tests/authz.test.ts`, `apps/worker/tests/deletion.test.ts`, `apps/worker/tests/display-name.test.ts`, `apps/worker/tests/elo.test.ts`, `apps/worker/tests/env.test.ts`, `apps/worker/tests/health.test.ts`, `apps/worker/tests/history.test.ts`, `apps/worker/tests/leaderboard.test.ts`, `apps/worker/tests/lib.test.ts`, `apps/worker/tests/logging.test.ts`, `apps/worker/tests/matches.test.ts`, `apps/worker/tests/metrics.test.ts`, `apps/worker/tests/migrations.test.ts`, `apps/worker/tests/privacy.test.ts`, `apps/worker/tests/profile.test.ts`, `apps/worker/tests/purge.test.ts`, `apps/worker/tests/ratelimit.test.ts`, `apps/worker/tests/room-auth.test.ts`, `apps/worker/tests/room-election.test.ts`, `apps/worker/tests/room-forfeit.test.ts`, `apps/worker/tests/room-host.test.ts`, `apps/worker/tests/room-membership.test.ts`, `apps/worker/tests/room-reject-log.test.ts`, `apps/worker/tests/room-relay.test.ts`, `apps/worker/tests/room-rules.test.ts`, `apps/worker/tests/room-settings.test.ts`, `apps/worker/tests/room-validate.test.ts`, `apps/worker/tests/room.test.ts`, `apps/worker/tests/rooms.test.ts`, `apps/worker/tests/schema-whitelist.test.ts`, `apps/worker/tests/sessions.test.ts`, `apps/worker/tests/signaling.test.ts`, `apps/worker/tests/snapshot-push.test.ts`, `apps/worker/tests/state-machine.test.ts`, `apps/worker/tests/turn.test.ts` |
| Web UI | `apps/web/tests/aim.test.tsx`, `apps/web/tests/aim-fire.test.tsx`, `apps/web/tests/aim-preview.test.tsx`, `apps/web/tests/camera.test.tsx`, `apps/web/tests/channels.test.tsx`, `apps/web/tests/chat.test.tsx`, `apps/web/tests/chat-wiring.test.tsx`, `apps/web/tests/clock.test.tsx`, `apps/web/tests/diagnostics.test.tsx`, `apps/web/tests/direction-pad.test.tsx`, `apps/web/tests/errors.test.tsx`, `apps/web/tests/fullscreen.test.tsx`, `apps/web/tests/gestures.test.tsx`, `apps/web/tests/host-clock.test.tsx`, `apps/web/tests/hud.test.tsx`, `apps/web/tests/i18n.test.tsx`, `apps/web/tests/input.test.tsx`, `apps/web/tests/install-prompt.test.tsx`, `apps/web/tests/interpolate.test.tsx`, `apps/web/tests/leaderboard.test.tsx`, `apps/web/tests/live-announcement.test.tsx`, `apps/web/tests/lobby-gating.test.tsx`, `apps/web/tests/lobby-join.test.tsx`, `apps/web/tests/lobby-mobile.test.tsx`, `apps/web/tests/lobby-rename.test.tsx`, `apps/web/tests/lobby-settings.test.tsx`, `apps/web/tests/manifest.test.tsx`, `apps/web/tests/match-controls.test.tsx`, `apps/web/tests/match-end.test.tsx`, `apps/web/tests/match-record.test.tsx`, `apps/web/tests/match-wiring.test.tsx`, `apps/web/tests/mesh.test.tsx`, `apps/web/tests/migration.test.tsx`, `apps/web/tests/migration-wiring.test.tsx`, `apps/web/tests/netplay.test.tsx`, `apps/web/tests/netplay-wiring.test.tsx`, `apps/web/tests/orientation.test.tsx`, `apps/web/tests/outcome.test.tsx`, `apps/web/tests/pad-layout.test.tsx`, `apps/web/tests/phrases.test.tsx`, `apps/web/tests/power-ring.test.tsx`, `apps/web/tests/profile.test.tsx`, `apps/web/tests/reconnect.test.tsx`, `apps/web/tests/results-outcome.test.tsx`, `apps/web/tests/results-screen.test.tsx`, `apps/web/tests/resync.test.tsx`, `apps/web/tests/roster.test.tsx`, `apps/web/tests/route-focus.test.tsx`, `apps/web/tests/ruler.test.tsx`, `apps/web/tests/service-worker.test.tsx`, `apps/web/tests/session-storage.test.tsx`, `apps/web/tests/shell.test.tsx`, `apps/web/tests/update-prompt.test.tsx`, `apps/web/tests/weapon-strip.test.tsx`, `apps/web/tests/weather-banner.test.tsx`, `apps/web/tests/wind-dial.test.tsx` |
| Repository | `tests/meta/bundle-secrets.test.ts`, `tests/meta/openapi.test.ts`, `tests/meta/slo-snapshot.test.ts`, `tests/meta/story-evidence.test.ts`, `tests/meta/traceability.test.ts`, `tests/meta/workspace.test.ts` |
| Browser flows | `tests/e2e/a11y.spec.ts`, `tests/e2e/bundle.spec.ts`, `tests/e2e/errors.spec.ts`, `tests/e2e/focus.spec.ts`, `tests/e2e/leaderboard.spec.ts`, `tests/e2e/lobby-mobile.spec.ts`, `tests/e2e/lobby.spec.ts`, `tests/e2e/main.spec.ts`, `tests/e2e/match-feedback.spec.ts`, `tests/e2e/migration.spec.ts`, `tests/e2e/privacy.spec.ts`, `tests/e2e/profile.spec.ts`, `tests/e2e/pwa-a11y.spec.ts`, `tests/e2e/pwa-i18n.spec.ts`, `tests/e2e/pwa-offline.spec.ts`, `tests/e2e/pwa-prod.spec.ts`, `tests/e2e/pwa-shell.spec.ts`, `tests/e2e/reconnect.spec.ts`, `tests/e2e/results.spec.ts`, `tests/e2e/routes.spec.ts`, `tests/e2e/signin.spec.ts`, `tests/e2e/smoke.spec.ts` |

Each `apps/worker/tests/room-*.ts` file drives the real `Room` object through
`apps/worker/tests/support/room-harness.ts` (a Hibernation-API fake) or the real route through
`apps/worker/tests/support/fake-env.ts` (a `node:sqlite` D1 with the real migration applied), so a route test
asserts the same SQL that production runs.

## 2. Planned

**No oracle names a missing file any more.** The 2026-11-08 pass wrote the five specs that were still on this list —
`errors.spec.ts`, `focus.spec.ts`, `privacy.spec.ts`, `profile.spec.ts`, `reconnect.spec.ts` — and `prod-smoke.spec.ts`
left it for a different reason: a check that runs against a deployed environment is a release-stage check
(`deployment.md` § post-deploy, `cpt-release` RR7), not a design-baseline oracle, so `01-overview/deployment.md` no
longer claims it as one. It gets written with `US-FND-004`.

### Found by playing, not by testing (2026-11-08)

A browser play-through of a bot match found what the suites could not: the match could not really be played even with
1036 unit cases and 73 browser cases green — the enemy was never on screen, the shell was never drawn, and the number the
player aims with ignored the gesture. What changed, and how each part is verified:

| Fix | Verified by |
|---|---|
| The camera frames both mobiles (`windowOnBoth`) instead of only the shooter | by hand, screenshots of a landscape session show the enemy in frame; the maths is unit-tested in `packages/core/tests/camera.test.ts` |
| The shell flies along the engine's own `shot.path`, with a muzzle flash, an impact burst, a scorch and damage numbers | by hand, screenshots at release, mid-flight and impact |
| The angle readout carries the pull's angle, clamped to the barrel window | by hand: a right-and-up drag reads 41–45°, a flat one reads the −10° clamp. **Not automated**: Playwright's mobile emulation delivers the drag differently and reads the clamp every time, so `TC-MATCH-903` was dropped rather than made to pass for the wrong reason |
| The HUD no longer swallows the gesture (`.match__hud > *` is `pointer-events: none`) | by hand: a pull that starts over the HUD band moves the power readout |
| The menu fits a landscape phone: the play button sits at y=289 of 390 instead of below the fold | by hand, measured with `boundingBox` in the same session |
| A guest no longer asks `/me`, so `/profile` logs no 401 | by hand, the console is clean |

Still open from the same session: the engagement distance on `map-01` (1 640 units) leaves a narrow power window for a
1v1 — the aim preview makes it workable, but a hit still needs the ring on the target — and the bot lands roughly one
shot in six, so a match against it runs long.

## 3. Gaps a `done` story still carries

A row here is a Definition-of-Done gap on the record rather than a hidden one. Closing one means a new story (`fix:` in
the title, `depends_on` the original — `03-definition-of-ready-and-done.md` § 3), never a silent edit to a shipped story.

| Story | What is not proven | Criterion |
|-------|--------------------|-----------|
| `US-ROOM-004` | `TC-ROOM-046` proves the seat and the team come back through a lobby reload; the `lastSnapshot` half (HP restored mid-match) has no automated case, and `TC-ROOM-047` (the 20 s countdown to `disconnected`) has none either | AC2/AC3 |
| `US-AUTH-003` | `TC-AUTH-142` (delete flow: typed confirmation, `204`, redirect, no further API access) needs a signed-in account, so `tests/e2e/profile.spec.ts` covers only the guest redirect | AC7 |
| `US-PWA-005` | The platform lock is proven against a stubbed `screen.orientation`, never on a real installed app: `TC-PWA-192` shows the call is made once, installed-only, and that a rejection is swallowed, but that an Android PWA actually lands in landscape needs a phone with the app installed. The failure mode if it does not is the old notice | AC2 |
| `US-PWA-004` | AC7 is now covered on the failure path as well — the lobby's no-session branch renders an `h1`
(`TC-PWA-191`, component level, because a browser always mints a guest session and cannot reach that branch). What is
still unproven are the other two ACs that name cases no file defines: **AC2** (200 % browser text size, `TC-PWA-159`)
and **AC4** (keyboard-only order, `TC-PWA-161`) | AC2, AC4 |

Two citations of files that never existed were also found and corrected: `US-FND-003` and `US-PWA-002` named
`apps/web/tests/i18n.test.ts`; the file is `i18n.test.tsx` and it is written.
