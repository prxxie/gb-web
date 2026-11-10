---
id: US-FND-005
title: Prove the release on the deployed site, and undo it when the proof fails
epic: EPIC-00-foundation
status: done
priority: P2
size: S
depends_on: [US-FND-004]
open_questions: []
accepted_assumptions: []
refs: [01-overview/deployment.md, 08-ops/runbook.md]
---

# US-FND-005 — Prove the release on the deployed site, and undo it when the proof fails

## 1. Story

**As the** owner

**I want** a merge to `main` to deploy by itself, and a release that cannot be called successful until the deployed site
serves it

**so that** "deployed" is a fact I can check rather than a green tick I have to trust.

## 2. Context

`US-FND-004` built the pipeline and it has deployed production for real. Two holes remained, both found by asking what the
gate actually proves:

- **The gate only asked the worker.** `Verify the deployed sha` fetches `GET /health` and greps for the commit — so a
  Pages deployment that served an old bundle, or a bundle built against the wrong API, passed. `VITE_API_BASE` is baked in
  at build time, which makes a stale repository variable a real way to ship an app pointing at another backend.
- **A failed gate left the bad version serving.** The job went red, the notification arrived, and the worker stayed on the
  version that failed the check.

The trigger itself was already automatic: `workflow_run` on `CI`/`main`, gated on `vars.PRODUCTION_READY`, with no
protection rule on the `production` environment. The owner asked for "CI/CD so `main` deploys by itself" — the honest
answer is that it already did, and the work was to make the proof worth something.

| Topic | Reference |
|-------|-----------|
| Environments and hostnames | [deployment.md](../../01-overview/deployment.md) |
| The release gate procedure | [runbook.md](../../08-ops/runbook.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A green CI run on `main` | It completes | `deploy-production` arms itself with no manual approval, the repository variable `PRODUCTION_READY` guarding it, and two deploys never race (`TC-FND-135`) |
| AC2 | The deploy job | It runs | Migrations apply before the worker deploys and Pages deploys last, and the worker deploy stamps the commit the gate will grep for (`TC-FND-136`) |
| AC3 | A deploy that reported success | The gate runs | It asks three questions — the worker's sha, the built bundle's API host, and the site's page and asset — and only then succeeds (`TC-FND-137`) |
| AC4 | A gate that fails after the worker deployed | The job ends | The worker is rolled back instead of left serving the version that failed (`TC-FND-138`) |
| AC5 | A pull request, and any deployed worker | Each happens | The PR still gets its own preview worker and database with both URLs commented, and the smoke job can still be pointed at any deployment to ask which sha it serves (`TC-FND-139`) |

## 4. Contract

```yaml
on: { workflow_run: { workflows: [CI], types: [completed], branches: [main] } }
if: (workflow_run.conclusion == 'success' && vars.PRODUCTION_READY == 'true') || workflow_dispatch
concurrency: { group: deploy-production, cancel-in-progress: false }
steps: migrations → worker (--var VERSION) → build → pages
       → verify sha (/health)  → verify bundle (dist mentions the API host)  → verify site (200 + asset)
       → on failure: wrangler rollback --env production
```

Repository variables: `PRODUCTION_READY`, `PRODUCTION_API_URL`, `PRODUCTION_WEB_URL`,
`CLOUDFLARE_PAGES_PROJECT`, `CLOUDFLARE_ACCOUNT_ID`, `GBW_WORKER_NAME`.

## 5. Rules and edge cases

- The site check reads `PRODUCTION_WEB_URL`, which must be a **variable**, not a secret: the runner only reads `vars.` for it,
  and a secret of that name is invisible to the step.
- The bundle check greps `apps/web/dist/assets` on the runner, not the served JavaScript: it proves the *build* wiring
  without depending on which chunk Vite happened to put the API client in.
- The rollback step is conditional on the worker having deployed (`steps.worker.outcome == 'success'`) and on the job
  already failing. It cannot undo a Pages deployment; it says so out loud rather than implying a clean revert.
- The Pages deployment is last for the same reason it was in `US-FND-004`: the site must never point at a worker whose
  schema is older than the database.

## 6. Implementation notes

- `.github/workflows/deploy-production.yml` — three verification steps and the rollback step.
- `tests/meta/deploy-pipeline.test.ts` — reads the workflow text and asserts the arming condition, the step order, the
  three checks and the rollback, so a future edit cannot quietly drop one.

## 7. Out of scope

- Rolling back the Pages deployment. Cloudflare Pages has no equivalent of `wrangler rollback`; a bad bundle is re-deployed
  from the previous commit, which is a runbook step rather than a workflow step.
- Blue/green traffic splitting and canary percentages.

## 8. Test notes

`TC-FND-135` (arming and concurrency), `TC-FND-136` (step order and the stamped sha), `TC-FND-137` (the three
verifications), `TC-FND-138` (rollback on a failed gate), `TC-FND-139` (preview and smoke unchanged) — all in
`tests/meta/deploy-pipeline.test.ts`, which asserts the workflow file itself.

Red: `tests/meta/deploy-pipeline.test.ts` — the pipeline had one verification step, no rollback and no bundle check, so
`TC-FND-137` and `TC-FND-138` failed against the previous workflow before the steps were added.

## 9. Open questions

None.

<!-- delivery:2026-11-10 -->

## Delivery status — 2026-11-10

**done.** The three checks and the rollback step are in `deploy-production.yml`, and `tests/meta/deploy-pipeline.test.ts`
pins all five ACs against the workflow text (8 cases). The pipeline then ran itself: the commit carrying this story is the
first deploy to exercise the new steps, and the run reports `the built bundle calls gbw-api.gbw-demo.workers.dev` and
`the page serves /assets/index-*.js` in its own log.

What is **not** proven: the rollback step has never executed in anger. It is written to run only after a failed gate, and no
deploy has failed that way since it was added — a rehearsal needs a deliberately broken gate, which is a manual exercise
rather than something to leave in the workflow.
