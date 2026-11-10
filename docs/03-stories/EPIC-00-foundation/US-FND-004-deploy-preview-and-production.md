---
id: US-FND-004
title: Deploy a preview per pull request and production from main
epic: EPIC-00-foundation
status: done
priority: P0
size: M
depends_on: [US-FND-002, US-FND-003]
open_questions: []
accepted_assumptions: []
refs: [01-overview/deployment.md, 01-overview/environment-setup.md, 08-ops/runbook.md]
---

# US-FND-004 — Deploy a preview per pull request and production from main

## 1. Story

**As the** tech lead
**I want** every pull request to deploy a shareable preview and `main` to deploy production with its migrations
**so that** the client and the two test phones can open real builds weeks before launch, and a bad deploy can be undone.

## 2. Context

`deployment.md` documents three environments and a forward-only migration rule; nothing implements them yet. This
story adds the GitHub Actions workflow, the wrangler environments, the migration step that runs before the worker, and a
rehearsed rollback — the last item because `cpt-release` checks rollback readiness with evidence (rule 03 RR5).

| Topic | Reference |
|-------|-----------|
| Environments, pipeline, rollback | [deployment.md](../../01-overview/deployment.md) |
| Local prerequisites and env names | [environment-setup.md](../../01-overview/environment-setup.md) |
| What on-call does when it breaks | [runbook.md](../../08-ops/runbook.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A pull request touching `apps/*` or `packages/*` | CI runs | It deploys a Pages preview and a `-preview` worker, and the pull request comment contains both URLs plus the commit sha (`TC-FND-901`) |
| AC2 | A merge to `main` | The workflow runs | Migrations are applied to the production D1 before the worker deploys, then the Pages production deployment happens last; the job fails and stops at the first failing step |
| AC3 | A worker deployment that has already shipped | The documented rollback is executed on the preview environment | The previous version serves again within 5 minutes and `GET /api/v1/health` reports the previous sha (`TC-FND-902`) |
| AC4 | Production secrets | The workflow files and the built artifacts are inspected | Only secret *names* appear; no value is committed, echoed or printed in a log line |
| AC5 | A preview deployment | `docs/01-overview/deployment.md` is followed from a clean checkout by someone who has never deployed | Every step matches reality and the environments table entries are correct |
| AC6 | A failing typecheck | The workflow runs | Nothing deploys: no preview, no migration, no Pages upload |

## 4. Contract

Workflows (`.github/workflows/`):

| File | Trigger | Steps |
|------|---------|-------|
| `ci.yml` | `pull_request`, `push` to `main` | install → lint → typecheck → unit tests → e2e (chromium) → `verify-docs` |
| `deploy-preview.yml` | `pull_request` after `ci` | `wrangler d1 migrations apply --remote --env preview` → `wrangler deploy --env preview` → `wrangler pages deploy --branch <pr>` → comment URLs |
| `deploy-production.yml` | `push` to `main` | same order with `--env production`, Pages production branch `main` |

`apps/worker/wrangler.jsonc` environments: `preview` (D1 `GBW_DB_PREVIEW`, DO class same) and `production`
(D1 `GBW_DB`, custom domain `gbw.example`). Secrets are set with `wrangler secret put` and `gh secret set`; the
names are exactly those in `environment-setup.md`.

## 5. Rules and edge cases

- Migrations run **before** the worker deploy and must be backward compatible with the previous worker version, because
  the two overlap during the rollout (rule 03 RR4).
- A migration that drops a column is a ⚠️ irreversible step: the release record must name the D1 export that makes it
  recoverable.
- Preview deployments must never share the production D1 or the production Clerk instance.
- Rollback of Pages is a re-publish of the previous deployment id, recorded in the release record; rollback of the
  worker is `wrangler rollback --env <env>`.
- The pipeline may not be skipped by a `[skip ci]` commit on `main`.

## 6. Implementation notes

- `wrangler-action` for deploy, `cloudflare/pages-action` for Pages; both pinned to a commit sha.
- The preview worker needs `CLERK_SECRET_KEY` for the preview Clerk instance — a separate secret name, not a fallback
  to production.
- Keep one branch deploy per PR (Pages preview alias `pr-<number>`).
- `verify-docs` runs in CI exactly as documented in `AGENTS.md`; a doc-only change still passes it.

## 7. Out of scope

- The M1/M2/M3 gate records and the go-live checklist — [US-OPS-004](../EPIC-08-ops/US-OPS-004-cut-the-release-and-go-live.md).
- Incident handling — `08-ops/runbook.md` and the OPS epic.

## 8. Test notes

`TC-FND-901` (preview deploy evidence: URL + sha in the PR comment) and `TC-FND-902` (rollback rehearsal on preview).
Both are `manual` level and their evidence is pasted into the pull request and later into the release record. CI
behaviour for AC6 is proven by a deliberately broken commit on a scratch branch, not merged.

Red: `tests/meta/deploy-pipeline.test.ts` — the pipeline had no case asserting its own shape, so
every regression here was caught by a red CI run after a merge instead: `Command "wrangler" not found` at the Pages
step, then `health never reported 82e93f3: version 9adfcc2` after an outranking secret.

## 9. Open questions

None. The environment question (`OQ-13`) was answered during the interview; the Cloudflare account and domain are the
client's.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**in-progress.** the workflows are written but cannot be exercised here: they need a GitHub remote and the Cloudflare secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLERK_SECRET_KEY`, `TURN_KEY_*`). Remaining step: push the repository, add the secrets, watch the first preview deployment.

## Delivery status — 2026-11-10

**The pipeline is live and has deployed production for real.** Run `42828656432` went green end to end —
`migrations → worker → build → Pages → verify the deployed sha` — and `vars.PRODUCTION_READY` is `true`, so a green CI run on
`main` now deploys by itself.

| AC | Evidence |
|---|---|
| AC1 | **Verified on PR #3**: CI passed and `deploy-preview` commented both URLs — web `https://pr-3.gbw-pages.pages.dev`, API `https://gbw-api-preview.gbw-demo.workers.dev/api/v1/health` — against commit `081e87d`. The preview has its own database (`gbw-preview`, `c969e339…`) and its own worker. |
| AC2 | Run `42828656432`: migrations applied to `gbw` before the worker, the Pages deploy last, `set -e` with separate steps. The first two attempts failed at the Pages step (`Command "wrangler" not found` — wrangler belongs to `apps/worker`, not the root) and then at the health check (`version: 9adfcc2` against an expected `82e93f3`, because a `VERSION` secret outranked `--var`). Both are fixed; the check is what caught them. |
| AC3 | **Rehearsed on preview.** `wrangler rollback <version-id> --env preview` put `f1b54352` back at 100 % of traffic in seconds, and `.github/workflows/smoke.yml` — a dispatch job that asks a deployed worker which sha it serves — confirmed the answer from a clean network. Two findings: the bare `wrangler rollback` flips between the last two deployments, so a second call undoes the first; and the sha assertion only became meaningful once `VERSION` was stamped, which for **preview** needed the fix merged to `main` first, because a `workflow_run` workflow reads the default branch's copy of itself. |
| AC4 | Secrets exist only as names in the workflow files and in the worker's binding list; the values were set with `gh secret set` and `wrangler secret put` and never echoed. |
| AC5 | `deployment.md` § 1 and `runbook.md` § 1 now describe what exists: no Cloudflare zone, so production answers on the workers.dev hostname and the Pages subdomain, with Clerk still on the test instance. |
| AC6 | The workflow's first step is CI's `typecheck`; nothing deploys unless CI is green, and `deploy-production` only arms itself on `workflow_run.conclusion == 'success'`. |

Still open, and not closable here: a **Clerk production instance** needs a domain (its dialog demands one) and the account has
no zone, so the deployed app runs the test instance and its sessions are unranked. That is the one thing standing between
this pipeline and a real production release, and it costs a domain.
