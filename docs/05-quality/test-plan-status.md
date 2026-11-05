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

20 Vitest files (152 cases) and 3 Playwright specs (6 cases), green on 2026-11-05:

| Area | Files |
|------|-------|
| Core simulation | `packages/core/tests/ballistics.test.ts`, `combat.test.ts`, `data.test.ts`, `match.test.ts`, `room.test.ts`, `rating.test.ts`, `snapshot.test.ts`, `camera.test.ts`, `terrain.test.ts`, `movement.test.ts`, `weather.test.ts` |
| Core protocol | `packages/core/tests/protocol.test.ts` — every documented socket frame parses, an undocumented field is refused by name, the 8 KB budgets hold (TC-ROOM-163) |
| Core boundary | `packages/core/tests/imports.test.ts` — no Phaser, network or `apps/` import; pins `lib: ["ES2023"]`, which is what makes a DOM global a type error |
| Worker helpers | `apps/worker/tests/lib.test.ts` (pure helpers: tokens, CORS, cursors, validation) |
| Worker environment | `apps/worker/tests/env.test.ts` — every name the code reads is declared in `wrangler.jsonc` or an example file, and no example row carries a secret |
| Web UI | `apps/web/tests/hud.test.tsx`, `input.test.tsx` |
| Browser flows | `tests/e2e/smoke.spec.ts`, `lobby.spec.ts`, `a11y.spec.ts` |
| Repository | `tests/meta/traceability.test.ts` — checks that every TC id cited in a test exists in `test-cases.md`; it does **not** check that the cited case is the one being asserted, which is how the mis-citations in the 2026-11-05 report survived |
| Repository | `tests/meta/bundle-secrets.test.ts` — builds the SPA into a temp dir and greps every asset for the Worker secret names and for real values from an untracked `apps/worker/.dev.vars` (7 s, the slowest case) |

## Planned

### Web UI (`apps/web/tests/`)

| File | Named by |
|------|----------|
| `apps/web/tests/aim.test.tsx` | `docs/03-stories/EPIC-05-match-ui/US-MATCH-002-aim-and-fire-by-touch.md` |
| `apps/web/tests/camera.test.tsx` | `docs/02-reference/screens/match.md` |
| `apps/web/tests/direction-pad.test.tsx` | `docs/03-stories/EPIC-05-match-ui/US-MATCH-006-move-with-touch-controls.md` |
| `apps/web/tests/gestures.test.tsx` | `docs/02-reference/screens/match.md` |
| `apps/web/tests/i18n.test.tsx` | `docs/03-stories/EPIC-00-foundation/US-FND-003-web-shell.md`, `docs/03-stories/EPIC-07-pwa-i18n/US-PWA-002-switch-between-vietnamese-and-english.md` |
| `apps/web/tests/lobby-settings.test.tsx` | `docs/03-stories/EPIC-02-rooms/US-ROOM-007-pick-mode-map-and-loadout.md` |
| `apps/web/tests/orientation.test.tsx` | `docs/03-stories/EPIC-07-pwa-i18n/US-PWA-003-landscape-only-layout.md` |
| `apps/web/tests/phrases.test.tsx` | `docs/03-stories/EPIC-05-match-ui/US-MATCH-004-skip-and-send-a-phrase.md` |
| `apps/web/tests/power-ring.test.tsx` | `docs/02-reference/screens/match.md` |
| `apps/web/tests/ruler.test.tsx` | `docs/02-reference/screens/match.md`, `docs/03-stories/EPIC-05-match-ui/US-MATCH-007-zoom-and-pan-the-battlefield.md` |
| `apps/web/tests/shell.test.tsx` | `docs/03-stories/EPIC-00-foundation/US-FND-003-web-shell.md` |
| `apps/web/tests/weapon-strip.test.tsx` | `docs/03-stories/EPIC-05-match-ui/US-MATCH-005-pick-a-weapon-and-use-items.md` |
| `apps/web/tests/wind-dial.test.tsx` | `docs/02-reference/screens/match.md` |

### Worker and Durable Object (`apps/worker/tests/`)

| File | Named by |
|------|----------|
| `apps/worker/tests/accounts.test.ts` | `docs/01-overview/roles-and-permissions.md`, `docs/02-reference/data/README.md`, `docs/03-stories/EPIC-01-accounts/US-AUTH-003-edit-display-name-and-avatar.md`, `docs/03-stories/EPIC-01-accounts/US-AUTH-004-delete-the-account.md` |
| `apps/worker/tests/api-contract.test.ts` | `docs/02-reference/api/README.md` |
| `apps/worker/tests/auth.test.ts` | `docs/02-reference/api/accounts.md`, `docs/02-reference/data/accounts.md` |
| `apps/worker/tests/authz.test.ts` | `docs/01-overview/roles-and-permissions.md` |
| `apps/worker/tests/deletion.test.ts` | `docs/02-reference/api/accounts.md` |
| `apps/worker/tests/display-name.test.ts` | `docs/03-stories/EPIC-01-accounts/US-AUTH-003-edit-display-name-and-avatar.md` |
| `apps/worker/tests/elo.test.ts` | `docs/03-stories/EPIC-06-ranked/US-RANK-002-rate-players-with-elo.md` |
| `apps/worker/tests/health.test.ts` | `docs/01-overview/environment-setup.md` |
| `apps/worker/tests/history.test.ts` | `docs/02-reference/api/matches.md` |
| `apps/worker/tests/leaderboard.test.ts` | `docs/02-reference/api/matches.md`, `docs/02-reference/data/README.md`, `docs/02-reference/data/accounts.md`, `docs/02-reference/screens/leaderboard.md` |
| `apps/worker/tests/logging.test.ts` | `docs/01-overview/architecture.md` |
| `apps/worker/tests/metrics.test.ts` | `docs/08-ops/slo.md` |
| `apps/worker/tests/matches.test.ts` | `docs/01-overview/architecture.md`, `docs/01-overview/workflow-state-machine.md`, `docs/02-reference/api/matches.md`, `docs/02-reference/api/signaling.md`, `docs/02-reference/data/README.md`, `docs/02-reference/data/matches.md`, `docs/03-stories/EPIC-06-ranked/US-RANK-001-record-a-finished-match.md` |
| `apps/worker/tests/migrations.test.ts` | `docs/02-reference/data/README.md`, `docs/02-reference/data/accounts.md`, `docs/02-reference/data/matches.md`, `docs/03-stories/EPIC-00-foundation/US-FND-002-worker-skeleton-and-health.md` |
| `apps/worker/tests/privacy.test.ts` | `docs/01-overview/roles-and-permissions.md` |
| `apps/worker/tests/profile.test.ts` | `docs/02-reference/api/accounts.md`, `docs/02-reference/data/accounts.md` |
| `apps/worker/tests/ratelimit.test.ts` | `docs/03-stories/EPIC-08-ops/US-OPS-001-emit-structured-logs-and-rate-limits.md` |
| `apps/worker/tests/room-auth.test.ts` | `docs/02-reference/api/signaling.md` |
| `apps/worker/tests/room-election.test.ts` | `docs/02-reference/api/signaling.md` |
| `apps/worker/tests/room-host.test.ts` | `docs/02-reference/api/signaling.md` |
| `apps/worker/tests/room-relay.test.ts` | `docs/02-reference/api/signaling.md` |
| `apps/worker/tests/room-rules.test.ts` | `docs/03-stories/EPIC-02-rooms/US-ROOM-003-assign-teams-and-start-the-match.md` |
| `apps/worker/tests/room-settings.test.ts` | `docs/02-reference/api/signaling.md` |
| `apps/worker/tests/room-validate.test.ts` | `docs/03-stories/EPIC-04-netplay/US-NET-004-reject-messages-from-the-wrong-sender.md` |
| `apps/worker/tests/room.test.ts` | `docs/01-overview/architecture.md`, `docs/01-overview/roles-and-permissions.md`, `docs/01-overview/workflow-state-machine.md`, `docs/02-reference/api/signaling.md`, `docs/02-reference/data/README.md`, `docs/02-reference/data/room-state.md`, `docs/03-stories/EPIC-02-rooms/US-ROOM-005-elect-a-new-host-when-the-host-leaves.md`, `docs/03-stories/EPIC-04-netplay/US-NET-004-reject-messages-from-the-wrong-sender.md` |
| `apps/worker/tests/rooms.test.ts` | `docs/02-reference/api/rooms.md`, `docs/03-stories/EPIC-02-rooms/US-ROOM-001-create-a-room-with-a-shareable-code.md` |
| `apps/worker/tests/schema-whitelist.test.ts` | `docs/02-reference/api/accounts.md` |
| `apps/worker/tests/sessions.test.ts` | `docs/02-reference/api/accounts.md`, `docs/03-stories/EPIC-01-accounts/US-AUTH-001-continue-as-a-guest.md`, `docs/03-stories/EPIC-01-accounts/US-AUTH-002-sign-in-with-clerk.md` |
| `apps/worker/tests/signaling.test.ts` | `docs/01-overview/architecture.md`, `docs/03-stories/EPIC-02-rooms/US-ROOM-002-join-a-room-and-see-the-roster.md` |
| `apps/worker/tests/state-machine.test.ts` | `docs/01-overview/workflow-state-machine.md` |
| `apps/worker/tests/turn.test.ts` | `docs/02-reference/api/rooms.md` |

### Core simulation (`packages/core/tests/`)

| File | Named by |
|------|----------|
| `packages/core/tests/avatar.test.ts` | `docs/03-stories/EPIC-03-match-core/US-CORE-013-apply-avatar-stat-bonuses.md` |
| `packages/core/tests/blast.test.ts` | `docs/03-stories/EPIC-03-match-core/US-CORE-003-apply-damage-with-shield-and-defense.md` |
| `packages/core/tests/bot.test.ts` | `docs/03-stories/EPIC-03-match-core/US-CORE-005-play-against-a-bot.md` |
| `packages/core/tests/gimmicks.test.ts` | `docs/03-stories/EPIC-03-match-core/US-CORE-011-apply-stage-gimmicks.md` |
| `packages/core/tests/ice.test.ts` | `docs/02-reference/api/rooms.md` |
| `packages/core/tests/input.test.ts` | `docs/02-reference/api/signaling.md` |
| `packages/core/tests/items.test.ts` | `docs/03-stories/EPIC-03-match-core/US-CORE-009-apply-item-effects.md` |
| `packages/core/tests/maps.test.ts` | `docs/03-stories/EPIC-03-match-core/US-CORE-012-load-the-eleven-maps.md` |
| `packages/core/tests/mobiles.test.ts` | `docs/02-reference/data/mobiles.md`, `docs/03-stories/EPIC-03-match-core/US-CORE-007-load-mobile-stats-and-weapons.md` |
| `packages/core/tests/modes.test.ts` | `docs/03-stories/EPIC-03-match-core/US-CORE-010-score-the-four-modes.md` |
| `packages/core/tests/physics.test.ts` | `docs/01-overview/environment-setup.md`, `docs/02-reference/screens/match.md`, `docs/03-stories/EPIC-03-match-core/US-CORE-001-simulate-a-shot.md` |
| `packages/core/tests/turn-queue.test.ts` | `docs/03-stories/EPIC-03-match-core/US-CORE-002-resolve-turns-and-the-clock.md` |
| `packages/core/tests/turn.test.ts` | `docs/01-overview/workflow-state-machine.md`, `docs/02-reference/screens/match.md` |

### Browser flows (`tests/e2e/`)

| File | Named by |
|------|----------|
| `tests/e2e/bundle.spec.ts` | `docs/02-reference/screens/sign-in.md` |
| `tests/e2e/errors.spec.ts` | `docs/02-reference/screens/README.md` |
| `tests/e2e/focus.spec.ts` | `docs/02-reference/screens/README.md` |
| `tests/e2e/fullscreen.spec.ts` | `docs/02-reference/screens/match.md` |
| `tests/e2e/leaderboard.spec.ts` | `docs/02-reference/screens/leaderboard.md` |
| `tests/e2e/main.spec.ts` | `docs/02-reference/screens/main.md` |
| `tests/e2e/match.spec.ts` | `docs/02-reference/screens/match.md`, `docs/03-stories/EPIC-05-match-ui/US-MATCH-001-render-the-battlefield.md` |
| `tests/e2e/migration.spec.ts` | `docs/02-reference/screens/match.md` |
| `tests/e2e/offline.spec.ts` | `docs/02-reference/screens/main.md`, `docs/02-reference/screens/match.md` |
| `tests/e2e/orientation.spec.ts` | `docs/02-reference/screens/README.md` |
| `tests/e2e/privacy.spec.ts` | `docs/03-stories/EPIC-02-rooms/US-ROOM-006-relay-signaling-and-issue-turn-credentials.md` |
| `tests/e2e/prod-smoke.spec.ts` | `docs/01-overview/deployment.md` |
| `tests/e2e/profile.spec.ts` | `docs/02-reference/screens/profile.md` |
| `tests/e2e/reconnect.spec.ts` | `docs/01-overview/workflow-state-machine.md`, `docs/02-reference/screens/lobby.md`, `docs/02-reference/screens/match.md`, `docs/03-stories/EPIC-02-rooms/US-ROOM-004-reconnect-within-the-grace-window.md` |
| `tests/e2e/results.spec.ts` | `docs/02-reference/screens/results.md`, `docs/03-stories/EPIC-06-ranked/US-RANK-005-see-the-result-screen.md` |
| `tests/e2e/routes.spec.ts` | `docs/02-reference/screens/README.md` |
| `tests/e2e/signin.spec.ts` | `docs/02-reference/screens/sign-in.md` |
