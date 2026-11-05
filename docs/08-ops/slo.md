# Service level objectives

Four SLOs, both production-facing and cost-facing. Every row names the `NFR-…` it operationalises and the exact query
that decides it. A row without a query is not an SLO.

Window: rolling **30 days** unless stated. Error budget = `1 − target` of the window's events.

## 1. Objectives

| # | SLI (exact query) | Target | Window | NFR | Error budget | If exhausted |
|---|-------------------|--------|--------|-----|--------------|--------------|
| SLO-1 | `sum(rate(workers_requests_total{status!~"5.."}[5m])) / sum(rate(workers_requests_total[5m]))` on the `gbw-api` script | 99.5 % | 30 d | NFR-26 | 0.5 % ≈ 3 h 39 m of full outage | Feature freeze except fixes; every 5xx gets a root cause before new work; announce in the client status note |
| SLO-2 | `histogram_quantile(0.95, sum(rate(workers_request_duration_ms_bucket{route=~"/api/v1/.*"}[5m])) by (le))` | ≤ 400 ms p95, ≤ 1 s p99 | 30 d | NFR-27 | 5 % of minutes breaching | Profile the slowest route; D1 query review first; if it is the leaderboard, raise its cache from 30 s to 60 s |
| SLO-3 | `count(room ended with winner) / count(room created)` from `match_record` vs `Room` creation logs, per week | ≥ 70 % | 7 d | NFR-07 | 30 % of rooms | Read the abandon reasons (`abandoned`, `disconnected`, `error`); fix the dominant one before any new feature |
| SLO-4 | `sum(rate(d1_rows_written_total[1d]))` against the 100 k/day allowance | ≤ 80 % of daily writes | 1 d | NFR-05 | 20 % headroom | Ranked play to "results pending"; batch writes; check for a `POST /matches` retry loop |

Host migration has a target of its own (`NFR-06`, ≤ 5 s) and is checked per release rather than as an SLI, because its
frequency is too low to compute a ratio in a 30-day window: TC-ROOM-049 measures it, the release record carries the number.

## 2. What counts as an event

| SLO | Numerator | Denominator | Excluded |
|-----|-----------|-------------|----------|
| SLO-1 | Requests answered without a 5xx | All `/api/v1/*` requests | WebSocket frames after upgrade (counted at upgrade only), 429s (a correct answer to abuse) |
| SLO-2 | Requests under the latency bound | All `/api/v1/*` requests | The WebSocket lifetime, `/health` probes |
| SLO-3 | Rooms whose `match_record.result` exists with a `winner_team` | Rooms that reached `playing` | Rooms abandoned in `lobby` (never started) |
| SLO-4 | Rows written per UTC day | 100 000 | Migrations and admin queries |

## 3. Error-budget policy

1. **Under 50 % consumed**: ship normally.
2. **50–100 %**: no risky change to the affected surface (auth, D1 schema, DO state) without a reviewer from the other
   discipline; new work continues elsewhere.
3. **Exhausted**: the affected surface takes only reliability fixes until the window rolls or the SLO is formally
   relaxed by the tech lead and the client (`cpt-decide`, with the reason recorded).
4. An SLO that has been met for 3 consecutive windows is a candidate to tighten; one that has been missed for 2 is a
   candidate to renegotiate — never silently ignored.

## 4. Measurement notes

- Source of truth is the Cloudflare dashboard (Workers metrics, D1 metrics). Free-tier analytics has short retention, so
  a daily cron writes the previous day's numbers into `docs/06-reports/slo-snapshots/YYYY-MM.md` (story in the `OPS` epic).
- Latency measured at the Worker excludes client network time; the client-side experience (touch → shot) is `NFR-02`
  and is measured by TC-OPS-180/TC-OPS-181 on real phones, not here.
- SLO-3 is a product objective, not an availability one: it fails when players give up, which no uptime chart shows.

## Oracle

| Contract | Checked by |
|----------|-----------|
| SLO-1/2 numbers match the dashboard for a sampled day | Monthly snapshot file cross-checked against the dashboard (manual, recorded in the snapshot) |
| SLO-3 denominator uses rooms that reached `playing` | `apps/worker/tests/metrics.test.ts` (TC-OPS-185) |
| SLO-4 numerator matches D1 billing counters within 5 % | Monthly snapshot note (manual) |
| Budget policy is followed when exhausted | Incident/postmortem record references this file's § 3 |
