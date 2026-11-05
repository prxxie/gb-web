---
id: US-FND-001
title: Set up the pnpm workspace so the documented commands run
epic: EPIC-00-foundation
status: in-progress
priority: P0
size: M
depends_on: []
open_questions: []
accepted_assumptions: []
refs: [01-overview/architecture.md, 01-overview/conventions.md, 01-overview/environment-setup.md]
---

# US-FND-001 — Set up the pnpm workspace so the documented commands run

## 1. Story

**As a** developer joining the project
**I want** the three source roots, the test runners and the commands from `AGENTS.md` to exist and work
**so that** every later story starts from a green build instead of an argument about tooling.

## 2. Context

`cpt-docs` wrote the command lines in `AGENTS.md` § PROJECT and `environment-setup.md` marked `(planned — verify after
US-FND-001)`. This story makes them real and deletes the markers. The layout and the boundary rules it must enforce
come from the architecture and conventions files.

| Topic | Reference |
|-------|-----------|
| Source layout and module boundaries | [architecture.md](../../01-overview/architecture.md#source-layout) |
| Strictness, naming, boundary enforcement | [conventions.md](../../01-overview/conventions.md) |
| Commands and prerequisites | [environment-setup.md](../../01-overview/environment-setup.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A clean checkout with Node 22.12 or newer and pnpm 10 | `pnpm install` runs | It exits 0 and creates `apps/web`, `apps/worker`, `packages/core`, `tests/` per the layout tree, with no dependency added beyond those already approved |
| AC2 | A clean checkout | `pnpm typecheck`, `pnpm lint` and `pnpm test` run in that order | All three exit 0; `pnpm test` reports at least one passing test per project (core, worker, web) |
| AC3 | `packages/core` as written | A static scan of its imports runs | It contains no `phaser`, no DOM global reference and no network module (`TC-FND-018`) |
| AC4 | A production build | The emitted web bundle is searched for `SESSION_TOKEN_SECRET` and `TURN_KEY_API_TOKEN` values | No match (`TC-FND-012`) |
| AC5 | `apps/worker/.dev.vars.example` and `apps/web/.env.example` | Both are read | Every name the code reads appears in one of them, neither file lists a name the code does not read, and no row carries a value — only public defaults (`VITE_API_BASE=/api/v1`, an empty `VITE_CLERK_PUBLISHABLE_KEY`, and the worker's local placeholder `SESSION_TOKEN_SECRET=dev-only-change-me`) (`TC-FND-002`) |
| AC6 | The repository with CI configured | A pull request with a failing unit test is opened | CI fails on the test job and the merge is blocked |
| AC7 | `AGENTS.md` and `docs/01-overview/environment-setup.md` | This story is `done` | No `(planned — …)` marker remains in either file and every documented command has been executed successfully |

## 4. Contract

pnpm workspace and scripts (`package.json`, root):

| Script | Runs |
|--------|------|
| `pnpm dev` | `vite` in `apps/web` (port 5173) |
| `pnpm dev:worker` | `wrangler dev` in `apps/worker` (port 8787) |
| `pnpm build` | `tsc -b && vite build` (web) plus `wrangler deploy --dry-run` (worker) |
| `pnpm test` | `vitest run` across the three Vitest projects |
| `pnpm test:unit <path>` | one Vitest project, one file |
| `pnpm e2e` | `playwright test` against a running `pnpm dev:worker` + preview |
| `pnpm lint` | `eslint .` |
| `pnpm typecheck` | `tsc -b` over the project references |
| `pnpm verify:docs` | `node .agents/scripts/verify-docs.mjs` |

TypeScript settings (`tsconfig.base.json`): `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride`, `verbatimModuleSyntax`, target `ES2023`. `apps/web` extends it with `lib: ["DOM", "DOM.Iterable"]`
and `types: ["vite/client"]`; `packages/core` uses `lib: ["ES2023"]` only — that is what makes AC3 enforceable.

## 5. Rules and edge cases

- No secret value enters the repository: `.env.example` carries names only, and CI builds with dummy values (`NFR-12`).
- No new dependency without explicit approval naming version and licence (rule 06); the packs already approved cover everything here.
- `engines.node` is `>=22.12` and CI runs Node 22 LTS: a newer runtime is allowed, an older one fails at install time rather than halfway through a build. Verified on 22.22.2.
- E2E tests may not require network access to Cloudflare — they run against `wrangler dev`.

## 6. Implementation notes

- One Vitest run with four globs: `vitest.config.ts` at the root includes `packages/core/tests/**/*.test.ts`, `apps/worker/tests/**/*.test.ts`, `apps/web/tests/**/*.test.tsx` and `tests/meta/**/*.test.ts` — one file per package instead of a workspace file, so `pnpm test` stays a single command.
- Playwright starts both servers itself (`playwright.config.ts` `webServer`), so a spec run needs no manual terminals; every spec opens its own browser context.
- The import scan is a test, not an ESLint rule, so it also catches transitive imports through `packages/core/src/index.ts`.
- Keep `tsc -b` project references; the build order is `core → worker → web`.

## 7. Out of scope

- The `/health` endpoint, D1 binding and the error envelope — [US-FND-002](US-FND-002-worker-skeleton-and-health.md).
- The React shell and router — [US-FND-003](US-FND-003-web-shell.md).
- Deployment jobs — [US-FND-004](US-FND-004-deploy-preview-and-production.md).

## 8. Test notes

Red first: `TC-FND-018` (`packages/core/tests/imports.test.ts`) and `TC-FND-002` (`apps/worker/tests/env.test.ts`) fail before the
scan and the `.env.example` exist. `TC-FND-012` is a build-output test. AC6 is verified in the pull request itself;
AC7 is verified by `grep -c "planned —" AGENTS.md docs/01-overview/environment-setup.md` returning 0.

## 9. Open questions

None. The toolchain question (`OQ-11`) was answered when the stack ADR was accepted.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**shipped 2026-11-05, awaiting the CI evidence for AC6.** What exists and was run on Node 22.22.2:

- AC1–AC5, AC7: `pnpm install`, `pnpm build` (115.97 KiB bundle + `wrangler deploy --dry-run`), `pnpm typecheck`, `pnpm lint`, `pnpm test` (15 files / 110 cases) and `pnpm e2e` (6 specs) all pass. `AGENTS.md` and
  `docs/01-overview/environment-setup.md` carry no `(planned — …)` marker. `TC-FND-002` (`apps/worker/tests/env.test.ts`),
  `TC-FND-012` (`tests/meta/bundle-secrets.test.ts`) and `TC-FND-018` (`packages/core/tests/imports.test.ts`) exist and are green.
- AC6: `.github/workflows/ci.yml` runs the same five commands plus Playwright; evidence is the workflow run recorded in
  `docs/05-quality/evidence/US-FND-001/`.
