---
id: US-OPS-002
title: Publish a daily SLO snapshot and review the error budget
epic: EPIC-08-ops
status: ready
priority: P2
size: S
depends_on: [US-OPS-001]
open_questions: []
accepted_assumptions: [OQ-34]
refs: [08-ops/slo.md, 08-ops/runbook.md, 01-overview/nonfunctional-requirements.md]
---

# US-OPS-002 — Publish a daily SLO snapshot and review the error budget

## 1. Story

**As the** tech lead
**I want** the four SLIs recorded every day
**so that** the error-budget policy in `slo.md` is a decision with numbers behind it, not an opinion.

## 2. Context

`slo.md` defines SLO-1…SLO-4 with exact queries and an exhaustion policy; this story makes the recording automatic into
`docs/06-reports/slo-snapshots/YYYY-MM-DD.md` and flags a breach in the weekly report.

| Topic | Reference |
|-------|-----------|
| SLI queries and error budget | [slo.md](../../08-ops/slo.md) |
| What to do when a budget is exhausted | [slo.md § policy](../../08-ops/slo.md) |
| Runbook metrics | [runbook.md](../../08-ops/runbook.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | The daily job | It runs at 00:10 UTC | It writes `docs/06-reports/slo-snapshots/<date>.md` with the four SLI values, each window and the remaining budget (`TC-OPS-901`) |
| AC2 | SLO-1 below 99.5 % for the day | The snapshot is written | The file carries `BREACH` beside that SLI and the job exits non-zero so CI surfaces it |
| AC3 | A missing metric in the source | The job runs | The SLI row reads `no data` and is counted as a breach, never silently skipped |
| AC4 | The snapshot file | It is compared with `slo.md` | Every SLI in `slo.md` has a row, and every row names its `NFR-nn` |
| AC5 | Two months of snapshots | The weekly report is generated | The weekly report's quality section cites the latest snapshot and the number of breach days |
| AC6 | The job itself fails (auth, quota) | It runs | It opens a failed CI run with the error text and does not write a partial file |

## 4. Contract

Script `scripts/slo-snapshot.mjs` (Node 24), run by `.github/workflows/slo-snapshot.yml` on `schedule` and on demand.
Inputs: Cloudflare Analytics API token (secret `CF_ANALYTICS_TOKEN`), account id, zone/worker name.
Output file format:

```markdown
# SLO snapshot — 2026-12-01

| SLI | Value | Target | Window | Budget left | Verdict | NFR |
|-----|-------|--------|--------|-------------|---------|-----|
| availability | 99.72 % | 99.5 % | 24 h | 56 % | ok | NFR-26 |
```

## 5. Rules and edge cases

- The snapshot records the API latency SLI (p95 ≤ 400 ms, p99 ≤ 1 s) as one of its four rows (`NFR-27`).
- The snapshot commits to `main` on a `chore(slo)` commit; a merge conflict is impossible because the file name is a date.
- No personal data is read: only aggregate counts.
- The job is idempotent for a given day (rerun overwrites the same file).
- A breach does not page anyone at night; it is reviewed in the next working day's stand-up, per the `slo.md` policy.
- The file must render in the weekly report without transformation.

## 6. Implementation notes

- Reuses the GraphQL Analytics query strings documented in `slo.md`; keep them in the script, not in prose only.
- Dry-run mode writes to stdout for local debugging with `--dry-run`.
- `docs/06-reports/README.md` gains the snapshot column when this story ships.

## 7. Out of scope

- Alerting, paging, dashboarding.
- Automatic incident creation from a breach.

## 8. Test notes

`TC-OPS-901` (snapshot content and breach flag), plus a fixture test that runs the renderer against a canned API
response.

## 9. Open questions

- **OQ-34** (accepted assumption) — SLO targets, RPO/RTO and the backup drill remain as recorded; this story records
  whatever `slo.md` states and must be re-checked if the client changes the targets.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**in-progress.** `scripts/slo-snapshot.mjs` is written; it needs a deployed Worker and D1 to query.
