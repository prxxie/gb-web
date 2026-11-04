# Conventions

Project decisions and deviations only. Everything the installed packs already define is theirs — read
[`cpt-stack-react-vite`](../../.agents/skills/cpt-stack-react-vite/SKILL.md),
[`cpt-stack-api`](../../.agents/skills/cpt-stack-api/SKILL.md) and
[`cpt-stack-browser-verify`](../../.agents/skills/cpt-stack-browser-verify/SKILL.md) instead of restating them here.

## 1. Deviations from the packs

| Pack says | This project does | Why |
|-----------|-------------------|-----|
| React 19 + Vite with MSW for API mocking | MSW is used in unit/component tests only; e2e runs against `wrangler dev` with a local D1 | The Worker and its DO cannot be faithfully faked in the browser; the API contract is the thing under test `[assumption: OQ-13]` |
| Vite SPA build | Build ships a PWA manifest + service worker (Workbox via `vite-plugin-pwa`) | Offline bot play and installability are requirements (`NFR-21`) |
| `api` pack expects one backend service | One Worker entry serving both `/api/v1` and the DO binding | One deployable, one dashboard, free-tier friendly (`ADR-0001`) |
| `api` pack OpenAPI lives in `docs/02-reference/api/` | Same, but the spec is authored as `openapi.yaml` next to the docs and linted in CI | `npx @redocly/cli lint` must run on the real file; the Markdown pages stay human-readable |
| `api` pack: no opinion on IDs | Client-visible ids are opaque UUIDv4 strings; no numbers, no sequential ids | Room codes are guessable by design; account ids must not be (`NFR-11`) |

## 2. Language and naming

| Thing | Rule |
|-------|------|
| Code, file names, comments, commits | English |
| UI copy, docs the client reads, status reports | Vietnamese (`docs/06-reports/`) |
| TypeScript | `strict: true`, no `any`, no non-null `!` outside tests; `type` over `interface` unless augmentation is needed |
| Files | `kebab-case.ts` for modules, `PascalCase.tsx` for components, `*.test.ts` beside the unit under test in `tests/` mirrors |
| Hooks | `useThing` in `apps/web/src/**/hooks/`; no hook may import from `src/game/` |
| Wire format | `snake_case` keys inside JSON messages (`room_code`, `host_generation`), matching `signaling.md` |
| In-code model | `camelCase` (`roomCode`, `hostGeneration`), mapped at the boundary in `src/net/` |
| Database | `snake_case` columns, plural-free table names (`account`, `match_record`) |
| Events / channels | Channel names `control` and `state`; message `t` values are `snake_case` (`peer_joined`, `match_end`) |
| i18n keys | `screen.element.state` (`lobby.startHint`, `results.ratings.reasonBot`); never concatenated at runtime |

## 3. Module boundaries

```
apps/web/src/game/**   → may import packages/core, Phaser, DOM
apps/web/src/net/**    → may import packages/core types only; no Phaser
apps/web/src/routes/** → may import net, i18n, ui components; no Phaser except the match route mounting the scene
packages/core/**       → imports nothing but itself and tunables.json
apps/worker/**         → may import packages/core types; never DOM, never Phaser
```

An import that crosses these arrows backwards is a review blocker, not a style nit (`NFR-22`). `tests/core/imports.test.ts`
enforces the `core` half.

## 4. Game code

- One Phaser scene per concern (`BootScene`, `LobbyScene`, `MatchScene`, `ResultScene`); scenes own rendering and input,
  never game rules.
- All numeric tuning values live in `packages/core/src/tuning.ts` (`TUNABLES`) and are read through it; no magic
  numbers in scene code (`NFR-23`). A change there bumps `rulesetVersion` and invalidates ranked matches from the old
  version.
- Simulation is driven by an explicit `step(state, input, dtMs)` function; the scene calls it, tests call it, and the
  host's network loop calls it — three callers, one implementation.
- Randomness goes through a seeded stream stored in the match state so a replay of the same inputs matches frame for
  frame; never `Math.random()` inside `core`.

## 5. Network and state

- Every snapshot carries `seq`; a client applies only `seq > lastApplied`, and applies idempotently (same `seq` twice is
  a no-op).
- Every host→peer message carries `host_generation`; a client ignores messages from an older generation.
- Channels are fixed: `control` (`ordered: true`) for inputs/chat/team/start; `state` (`ordered: false, maxRetransmits: 0`)
  for snapshots. A message type on the wrong channel is a bug.
- Nothing in the DO parses or persists SDP; signaling is relay-only (`ADR-0004`).

## 6. Errors

- Worker throws `AppError(status, type, detail)`; the handler serialises to `application/problem+json` with `request_id`
  and never leaks a stack (`api/README.md`).
- Client `net` layer converts a non-2xx into a typed `ApiError {status, type, requestId}`; routes render a translated
  sentence from `errors.<type>` and append the `request_id` in small text.
- The game loop may not throw: a scene-level error is caught, the match is marked degraded, and the player sees
  `match.error` rather than a black canvas.

## 7. Accessibility and mobile

- Every interactive element is a real `<button>`/`<a>`/`<input>`; canvas overlays use DOM controls positioned over it.
- Focus ring never removed; `:focus-visible` styled with a 3 px `primary` outline at 3:1 against both surfaces.
- Text scaling: layouts survive 200 % font size (WCAG 1.4.4) — no fixed-height text containers.
- Orientation is locked to landscape in the manifest; a portrait viewport shows the rotate notice instead of a broken
  layout (`NFR-19`).
- **The match is fullscreen and gesture-driven.** `requestFullscreen()` on the first tap (no API on iPhone Safari — fill
  the viewport with safe-area insets instead, `OQ-39`); no joystick (`OQ-40`); one finger pulls power and release fires
  above a 0.3 dead zone (`OQ-38`); two fingers pan; a pinch over 12 px zooms. A gesture that starts on a DOM control never
  becomes a canvas drag, and a two-finger gesture cancels a power pull without firing.
- Every canvas-anchored control (four-way pad, weapon strip, item tray, `Bỏ lượt`) is at least 60 × 60 logical px and is
  placed so it never covers the active mobile or its barrel.

## 8. Tests

| Layer | Tool | Location | Rule |
|-------|------|----------|------|
| Simulation | Vitest | `tests/core/` | Pure functions, no DOM; seeded RNG, table-driven damage cases |
| Worker + DO | Vitest + `@cloudflare/vitest-pool-workers` (miniflare) | `tests/worker/` | Real D1 migrations applied per test file; one DO per test via `runInDurableObject` |
| UI components | Vitest + RTL | `tests/web/` | Behaviour, not snapshots; i18n rendered through the real `t()` with `vi` |
| End-to-end | Playwright | `tests/e2e/` | Two-browser-context tests for anything with two players; phone viewport 844 × 390 |
| Accessibility | Playwright + `@axe-core/playwright` | `tests/e2e/a11y.spec.ts` | Zero critical/serious violations on every route |
| Docs | `verify-docs.mjs` | CI | `--fix` in CI, `--strict` on PRs |

Test naming: `describe('turn clock')` / `it('skips a disconnected player immediately')` — the sentence reads as the
acceptance criterion it encodes.

## 9. Git

Branches, commits and the local-merge procedure follow [`.agents/rules/04-git.md`](../../.agents/rules/04-git.md) as
written, with two project notes: the repo starts without a remote, so the first two commits are the scaffold and the doc
set; and `packages/core` changes that alter `tunables.json` or the wire format carry `!` in the commit subject (breaking).

## 10. Combat data and balance

- Every number that could be tuned lives in `packages/core/src/data/{tunables,mobiles,items,maps}.json` — no literals in
  `combat/`, `physics/`, `items/` or `modes/` ([NFR-29](../01-overview/nonfunctional-requirements.md)).
- A balance change is a data diff plus a `rulesetVersion` bump; a `!` commit is required because it invalidates
  in-flight ranked matches.
- Determinism first: no `Math.random()`, no `Date.now()` inside `core`; randomness enters as a seeded RNG carried in
  match state ([NFR-28](../01-overview/nonfunctional-requirements.md)).
- GunBound parity is a **playtest** judgement, never a test assertion: tests assert our documented behaviour, and the
  replica's limits are stated in [`02-reference/gameplay/tunables.md`](../02-reference/gameplay/tunables.md) § 10.

## 11. Decisions a reviewer will otherwise re-litigate

| Question | Answer |
|----------|--------|
| Why not a monorepo tool? | pnpm workspaces cover three packages; Turborepo/Nx add config for no measurable win at this size |
| Why is the DO not the authority? | 10 ms CPU per request cannot simulate physics (`ADR-0001`) |
| Why two data channels? | Head-of-line blocking: a lost snapshot must not delay the next input (`ADR-0004`) |
| Why no rollback netcode? | 10 Hz snapshots + local prediction of own shot only; full rollback is a rewrite of `core` for a 3-month v1 (`OQ-32`) |
| Why guests can play but not rank? | Rating needs an identity that cannot be re-rolled for free (`OQ-05`) |
