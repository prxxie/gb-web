# Test plan — what is written, what is planned

This register exists because the reference docs name the test file that proves each contract, and a name in a doc is a
promise the repository is expected to keep. It is checked by the `Oracle` tables in `02-reference/` and `03-stories/`:
every path listed there is either in the *written* list below or in the *planned* table with the docs that name it.

A planned file is not a defect by itself — it is the honest state between a plan and its implementation. Marking a
story `done` while one of its oracles is still planned is a Definition-of-Done failure
(`.agents/rules/03-definition-of-ready-and-done.md` § D3).
The list is a snapshot taken by the 2026-11-05 verification pass and moves by hand as files land; `verify-docs.mjs`
does not generate it.

## Written

118 Vitest files (953 cases) across the four suites, and 13 Playwright specs (53 cases), green on 2026-11-07:

| Area | Files |
|------|-------|
| Core simulation and content | `packages/core/tests/avatars.test.ts`, `packages/core/tests/ballistics.test.ts`, `packages/core/tests/bot.test.ts`, `packages/core/tests/camera.test.ts`, `packages/core/tests/combat.test.ts`, `packages/core/tests/data.test.ts`, `packages/core/tests/gimmicks.test.ts`, `packages/core/tests/imports.test.ts`, `packages/core/tests/items.test.ts`, `packages/core/tests/maps.test.ts`, `packages/core/tests/match.test.ts`, `packages/core/tests/mobiles.test.ts`, `packages/core/tests/modes.test.ts`, `packages/core/tests/movement.test.ts`, `packages/core/tests/phrases.test.ts`, `packages/core/tests/protocol.test.ts`, `packages/core/tests/rating.test.ts`, `packages/core/tests/room.test.ts`, `packages/core/tests/snapshot.test.ts`, `packages/core/tests/terrain.test.ts`, `packages/core/tests/turn-queue.test.ts`, `packages/core/tests/turn.test.ts`, `packages/core/tests/weather.test.ts` |
| Worker and Durable Object | `apps/worker/tests/accounts.test.ts`, `apps/worker/tests/api-contract.test.ts`, `apps/worker/tests/auth.test.ts`, `apps/worker/tests/authz.test.ts`, `apps/worker/tests/deletion.test.ts`, `apps/worker/tests/display-name.test.ts`, `apps/worker/tests/elo.test.ts`, `apps/worker/tests/env.test.ts`, `apps/worker/tests/health.test.ts`, `apps/worker/tests/history.test.ts`, `apps/worker/tests/leaderboard.test.ts`, `apps/worker/tests/lib.test.ts`, `apps/worker/tests/logging.test.ts`, `apps/worker/tests/matches.test.ts`, `apps/worker/tests/metrics.test.ts`, `apps/worker/tests/migrations.test.ts`, `apps/worker/tests/privacy.test.ts`, `apps/worker/tests/profile.test.ts`, `apps/worker/tests/purge.test.ts`, `apps/worker/tests/ratelimit.test.ts`, `apps/worker/tests/room-auth.test.ts`, `apps/worker/tests/room-election.test.ts`, `apps/worker/tests/room-forfeit.test.ts`, `apps/worker/tests/room-host.test.ts`, `apps/worker/tests/room-membership.test.ts`, `apps/worker/tests/room-relay.test.ts`, `apps/worker/tests/room-rules.test.ts`, `apps/worker/tests/room-settings.test.ts`, `apps/worker/tests/rooms.test.ts`, `apps/worker/tests/room.test.ts`, `apps/worker/tests/room-reject-log.test.ts`, `apps/worker/tests/room-validate.test.ts`, `apps/worker/tests/schema-whitelist.test.ts`, `apps/worker/tests/sessions.test.ts`, `apps/worker/tests/signaling.test.ts`, `apps/worker/tests/snapshot-push.test.ts`, `apps/worker/tests/state-machine.test.ts`, `apps/worker/tests/turn.test.ts` |
| Web UI | `apps/web/tests/aim.test.tsx`, `apps/web/tests/aim-fire.test.tsx`, `apps/web/tests/aim-preview.test.tsx`, `apps/web/tests/camera.test.tsx`, `apps/web/tests/channels.test.tsx`, `apps/web/tests/chat.test.tsx`, `apps/web/tests/chat-wiring.test.tsx`, `apps/web/tests/fullscreen.test.tsx`, `apps/web/tests/clock.test.tsx`, `apps/web/tests/direction-pad.test.tsx`, `apps/web/tests/errors.test.tsx`, `apps/web/tests/gestures.test.tsx`, `apps/web/tests/host-clock.test.tsx`, `apps/web/tests/hud.test.tsx`, `apps/web/tests/i18n.test.tsx`, `apps/web/tests/input.test.tsx`, `apps/web/tests/install-prompt.test.tsx`, `apps/web/tests/interpolate.test.tsx`, `apps/web/tests/live-announcement.test.tsx`, `apps/web/tests/lobby-gating.test.tsx`, `apps/web/tests/lobby-rename.test.tsx`, `apps/web/tests/lobby-settings.test.tsx`, `apps/web/tests/manifest.test.tsx`, `apps/web/tests/match-controls.test.tsx`, `apps/web/tests/match-end.test.tsx`, `apps/web/tests/match-wiring.test.tsx`, `apps/web/tests/netplay.test.tsx`, `apps/web/tests/netplay-wiring.test.tsx`, `apps/web/tests/diagnostics.test.tsx`, `apps/web/tests/migration.test.tsx`, `apps/web/tests/migration-wiring.test.tsx`, `apps/web/tests/mesh.test.tsx`, `apps/web/tests/orientation.test.tsx`, `apps/web/tests/phrases.test.tsx`, `apps/web/tests/pad-layout.test.tsx`, `apps/web/tests/power-ring.test.tsx`, `apps/web/tests/profile.test.tsx`, `apps/web/tests/reconnect.test.tsx`, `apps/web/tests/results-outcome.test.tsx`, `apps/web/tests/resync.test.tsx`, `apps/web/tests/roster.test.tsx`, `apps/web/tests/route-focus.test.tsx`, `apps/web/tests/ruler.test.tsx`, `apps/web/tests/service-worker.test.tsx`, `apps/web/tests/session-storage.test.tsx`, `apps/web/tests/shell.test.tsx`, `apps/web/tests/update-prompt.test.tsx`, `apps/web/tests/weapon-strip.test.tsx`, `apps/web/tests/weather-banner.test.tsx`, `apps/web/tests/wind-dial.test.tsx` |
| Repository | `tests/meta/bundle-secrets.test.ts`, `tests/meta/openapi.test.ts`, `tests/meta/slo-snapshot.test.ts`, `tests/meta/story-evidence.test.ts`, `tests/meta/traceability.test.ts`, `tests/meta/workspace.test.ts` |
| Browser flows | `tests/e2e/a11y.spec.ts`, `tests/e2e/bundle.spec.ts`, `tests/e2e/lobby.spec.ts`, `tests/e2e/main.spec.ts`, `tests/e2e/migration.spec.ts`, `tests/e2e/pwa-a11y.spec.ts`, `tests/e2e/pwa-i18n.spec.ts`, `tests/e2e/pwa-offline.spec.ts`, `tests/e2e/pwa-prod.spec.ts`, `tests/e2e/pwa-shell.spec.ts`, `tests/e2e/routes.spec.ts`, `tests/e2e/signin.spec.ts`, `tests/e2e/smoke.spec.ts` |

Each `apps/worker/tests/room-*.ts` file drives the real `Room` object through
`apps/worker/tests/support/room-harness.ts` (a Hibernation-API fake) or the real route through
`apps/worker/tests/support/fake-env.ts` (a `node:sqlite` D1 with the real migration applied), so a route test
asserts the same SQL that production runs.

## Planned

### Browser flows (`tests/e2e/`)

| File | Named by |
|------|----------|
| `tests/e2e/focus.spec.ts` | `docs/02-reference/screens/README.md` |
| `tests/e2e/leaderboard.spec.ts` | `docs/02-reference/screens/leaderboard.md` |
| `tests/e2e/orientation.spec.ts` | `docs/02-reference/screens/README.md` |
| `tests/e2e/privacy.spec.ts` | `docs/03-stories/EPIC-02-rooms/US-ROOM-006-relay-signaling-and-issue-turn-credentials.md` |
| `tests/e2e/prod-smoke.spec.ts` | `docs/01-overview/deployment.md` |
| `tests/e2e/profile.spec.ts` | `docs/02-reference/screens/profile.md` |
| `tests/e2e/reconnect.spec.ts` | `docs/01-overview/workflow-state-machine.md`, `docs/02-reference/screens/lobby.md`, `docs/03-stories/EPIC-02-rooms/US-ROOM-004-reconnect-within-the-grace-window.md` |
| `tests/e2e/results.spec.ts` | `docs/02-reference/screens/results.md`, `docs/03-stories/EPIC-06-ranked/US-RANK-005-see-the-result-screen.md` |
