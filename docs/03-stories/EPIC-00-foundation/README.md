---
id: EPIC-00-foundation
code: FND
title: Repository, tooling and delivery pipeline
---

# EPIC-00 — Repository, tooling and delivery pipeline

Everything the other eight epics stand on: a pnpm workspace with the three source roots the architecture assumes
([architecture.md](../../01-overview/architecture.md#source-layout)), the worker and web skeletons, the CI pipeline,
and the two deployments (preview per pull request, production on `main`).

## Goal

A clean checkout builds, lints, typechecks and tests with exactly the commands written in `AGENTS.md` § PROJECT, a
pull request deploys a preview that two phones can open, and `main` deploys production the same way — before any
gameplay code exists.

## Stories

Generated from story frontmatter — run `node .agents/scripts/verify-docs.mjs --fix`; do not edit by hand.

<!-- cpt:epic-stories -->
| Id | Title | Priority | Size | Status | Depends on |
|---|---|---|---|---|---|
| [US-FND-001](US-FND-001-set-up-the-workspace.md) | Set up the pnpm workspace so the documented commands run | P0 | M | in-progress | — |
| [US-FND-002](US-FND-002-worker-skeleton-and-health.md) | Serve /health from the worker with the D1 binding and the error envelope | P0 | M | ready | US-FND-001 |
| [US-FND-003](US-FND-003-web-shell.md) | Render the app shell with routing, locale loading and an error boundary | P0 | M | ready | US-FND-001 |
| [US-FND-004](US-FND-004-deploy-preview-and-production.md) | Deploy a preview per pull request and production from main | P0 | M | ready | US-FND-002, US-FND-003 |
<!-- /cpt:epic-stories -->

## Out of scope

- Any player-visible feature; the skeletons expose only `/health` and an empty shell.
- Observability beyond a single structured log line, which is [US-OPS-001](../EPIC-08-ops/US-OPS-001-emit-structured-logs-and-rate-limits.md).
