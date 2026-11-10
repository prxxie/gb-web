---
id: US-OPS-003
title: Prove the launch load with 50 concurrent rooms
epic: EPIC-08-ops
status: ready
priority: P2
size: M
depends_on: [US-NET-002, US-ROOM-002]
open_questions: []
accepted_assumptions: [OQ-33]
refs: [01-overview/nonfunctional-requirements.md, 08-ops/runbook.md, 08-ops/slo.md]
---

# US-OPS-003 — Prove the launch load with 50 concurrent rooms

## 1. Story

**As the** tech lead
**I want** a reproducible load test of 50 rooms and ~400 players
**so that** the free-tier ceilings are a measurement, not a hope.

## 2. Context

The launch target is 50 concurrent rooms (~400 players, `OQ-33`). The free-tier limits are the real constraint: 100k
Worker requests/day, D1 100k writes/day, one TURN gigabyte. A headless script drives rooms and sockets without WebRTC
media, which is enough to measure the server side and the DO alarms.

| Topic | Reference |
|-------|-----------|
| NFR-05 quotas, NFR-26/27 latency | [nonfunctional-requirements.md](../../01-overview/nonfunctional-requirements.md) |
| SLO-1…SLO-4 | [slo.md](../../08-ops/slo.md) |
| Failure modes at load | [runbook.md](../../08-ops/runbook.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | The load script | It runs against the preview worker with 50 rooms | All 50 rooms are created and each holds 8 authenticated sockets (`TC-OPS-185`) |
| AC2 | 400 sockets | The run continues for 10 minutes | No socket is closed by the server except deliberate ones, and p95 request duration stays under 400 ms |
| AC3 | The run | It finishes | The report states request count, error rate, D1 writes, DO durations and peak CPU time per request |
| AC4 | A request exceeding the free-tier CPU budget (10 ms) | It occurs | It appears in the report with its route, so it can be fixed before launch |
| AC5 | The same script | It is run three times | The numbers vary by less than 15 %, so the result is repeatable |
| AC6 | The report | It is written | It lands in the release record as evidence for the M3 gate ([US-OPS-004](US-OPS-004-cut-the-release-and-go-live.md)) |

## 4. Contract

`scripts/loadtest.mjs` (Node 24): `--rooms 50 --players 8 --minutes 10 --base-url <preview> --token <seed token>`.

Per room: create → 7 joins → `team_assign` → `start_match` → 20 simulated input turns → `match_end`. Output: a JSON
summary plus a markdown table. Metrics: HTTP count/status histogram, p50/p95/p99 duration, DO request count, D1 rows
written, distinct `request_id` count, sockets opened/closed, close-code histogram.

## 5. Rules and edge cases

- Run only against a preview environment, never production (`deployment.md`).
- The script must respect the documented rate limits, or bypass them with a test-only header that is disabled in
  production builds.
- WebRTC data channels are not exercised: the DO relay and snapshot pushes are simulated with `snapshot_push` messages of
  the real size; peer-to-peer behaviour is measured on real phones (`TC-OPS-180`–`184`).
- Cleanup: rooms are closed at the end so the D1 write count excludes idle alarms.
- The result must be compared against the free-tier daily limits and the per-match D1 write count (~25).

## 6. Implementation notes

- `ws` + `undici` client, no browser; run against the preview deployment for realistic latency.
- The 50-room run uses a stub `match_end`; the real `POST /matches` write is measured separately in a 100-match burst.

## 7. Out of scope

- Browser rendering under load, TURN bandwidth measurement, DDoS testing.

## 8. Test notes

`TC-OPS-185` (the run and its report). Manual/release-time case; not part of the PR CI matrix.

## 9. Open questions

- **OQ-33** (accepted assumption) — 50 rooms / 400 players is the launch load; if the client expects more, rerun with the
  new number and update `NFR-05` and `slo.md`.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**in-progress.** `scripts/loadtest.mjs` is written; the fifty-room run needs a deployed environment and a TURN key.

## Delivery status — 2026-11-10

**in-progress, and the earlier note was wrong.** This story recorded `scripts/loadtest.mjs` as written; that file has never
existed in the tree. What exists now is `scripts/load-test-rooms.mjs`, and it has been run:

- **Run A** — 50 rooms, two seats, 25 in flight, local `wrangler dev`: **50/50 rooms ready, 0 % error, p50 1 615 ms,
  p95 1 766 ms**.
- **Run B** — the same shape after the harness began holding both seats' sockets: **50/50 ready, 0 % error, p95 9 508 ms**.

Two runs of one shape disagreeing by 5× is the finding: the local dev worker's own variance is far outside AC5's 15 %, so
the repeatability clause cannot be measured here at all. The report in `docs/06-reports/load/2026-11-10-rooms.md` carries the
per-AC state; in short, AC1 is **partial** (two seats, not eight), and AC2–AC6 are **not proven** — a ten-minute 400-socket
soak, the D1/DO/CPU numbers (they need `CF_ANALYTICS_TOKEN`), a preview-worker target and a release record all sit outside
what this repository can currently produce.

## Delivery status — 2026-11-10 (second entry, against the deployed worker)

The script now runs from a GitHub runner against `https://gbw-api.gbw-demo.workers.dev` (`.github/workflows/load-test.yml`),
which is the first time it has measured anything real. What it found, in order:

1. **A client-supplied `cf-connecting-ip` is rejected by Cloudflare's edge** with its own `403` and an HTML body, so the first
   run reported 0/50 rooms "ready" against a worker that was healthy. The header is now `--local`-only.
2. **Rate limits, not capacity, dominated the first two runs.** `NFR-25` allows 10 room creates and 30 sessions per minute per
   address; mints and creates are now paced inside those limits, and the latency clock starts after the pacing so the wait is
   not reported as room latency. Two intermediate runs reported p50 10 s and p50 −207 s for the same reason, in opposite
   directions — both were measurement bugs, both are fixed.
3. **The best run: 50/50 rooms ready, 0 % error** — and then the Durable Objects **free tier** ran out:
   `Exceeded allowed volume of requests in Durable Objects free tier`. After that every `/rooms` call answered `500`, at three
   rooms as surely as at fifty. That is a plan limit, and it means:

| AC | State after this work |
|---|---|
| AC1 — 50 rooms, 8 authenticated sockets each | **Partial**: 50 rooms with two seats, verified by socket. Eight seats need 400 session mints at 30/min ≈ 13 minutes of pacing and a paid plan's DO budget. |
| AC2 — 400 sockets for ten minutes, p95 < 400 ms | **Blocked by plan**: the free tier's DO request allowance is spent by the run itself. |
| AC3/AC4 — D1 writes, DO durations, peak CPU per request | **Not proven**: those numbers come from the analytics API and need a paid plan's retention. |
| AC5 — three runs within 15 % | **Not proven**: the runs that completed disagree by far more than 15 %, and two of them were measuring their own pacing. |
| AC6 — the report lands in the release record | **Not proven**: no release record yet (`US-OPS-004`). |

The script and its report are real and repeatable; the *load* is what the free tier cannot carry. Upgrading to Workers Paid
($5/month) is the unblock, and it is a decision for the owner rather than a code change.
