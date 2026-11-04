---
id: EPIC-08-ops
code: OPS
title: Observability, load evidence and release
---

# EPIC-08 — Observability, load evidence and release

What makes the service operable: one structured log line per event with a `request_id`, the rate limits that protect
the free tier, the daily SLO snapshot that makes the error budget real, the load evidence behind the launch, and the
release that ships it.

## Goal

After M3 an engineer who did not write the code can answer "is it healthy, what broke, when did it break" from logs and
the SLO snapshot alone, and the release record carries evidence for every gate.

## Stories

Generated from story frontmatter — run `node .agents/scripts/verify-docs.mjs --fix`; do not edit by hand.

<!-- cpt:epic-stories -->
| Id | Title | Priority | Size | Status | Depends on |
|---|---|---|---|---|---|
| [US-OPS-001](US-OPS-001-emit-structured-logs-and-rate-limits.md) | Emit structured logs and enforce rate limits | P1 | S | ready | US-FND-002 |
| [US-OPS-002](US-OPS-002-publish-daily-slo-snapshots.md) | Publish a daily SLO snapshot and review the error budget | P2 | S | ready | US-OPS-001 |
| [US-OPS-003](US-OPS-003-load-test-fifty-rooms.md) | Prove the launch load with 50 concurrent rooms | P2 | M | ready | US-NET-002, US-ROOM-002 |
| [US-OPS-004](US-OPS-004-cut-the-release-and-go-live.md) | Cut the release and go live with evidence for every gate | P0 | M | ready | US-FND-004, US-OPS-002, US-OPS-003, US-PWA-001 |
<!-- /cpt:epic-stories -->

## Out of scope

- Third-party APM, tracing spans, on-call rotation tooling.
- A status page (the client's support channel is the escalation path).
