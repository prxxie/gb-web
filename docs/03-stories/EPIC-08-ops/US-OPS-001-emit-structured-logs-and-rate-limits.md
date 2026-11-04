---
id: US-OPS-001
title: Emit structured logs and enforce rate limits
epic: EPIC-08-ops
status: ready
priority: P1
size: S
depends_on: [US-FND-002]
open_questions: []
accepted_assumptions: []
refs: [08-ops/runbook.md, 01-overview/nonfunctional-requirements.md, 02-reference/api/README.md]
---

# US-OPS-001 — Emit structured logs and enforce rate limits

## 1. Story

**As an** on-call engineer
**I want** one JSON log line per request and per rejected message, with no personal data
**so that** the runbook's symptom strings actually exist in the dashboard and a spike is explainable.

## 2. Context

`NFR-24` fixes the log shape and the three-day retention of `wrangler tail`; `NFR-25` fixes the rate limits. Both are
cross-cutting, so they are implemented once in middleware rather than per route.

| Topic | Reference |
|-------|-----------|
| Log fields, symptoms, escalation | [runbook.md](../../08-ops/runbook.md) |
| NFR-24, NFR-25 | [nonfunctional-requirements.md](../../01-overview/nonfunctional-requirements.md) |
| Error body and `request_id` | [api/README.md](../../02-reference/api/README.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | Any API request | It completes | Exactly one JSON log line with `request_id`, `route`, `status`, `duration_ms`, `cf_ray`, and `room_code` when a room is involved (`TC-OPS-118`) |
| AC2 | Any log line, at any level | It is inspected | It contains no email, display name, session token, TURN credential, SDP or cookie (`TC-OPS-173`) |
| AC3 | A request rate-limited at the IP limit | It is rejected | `429` with `retryAfterSeconds`, one log line with `status: 429` and `limit: "ip_rooms"` |
| AC4 | A DO message rejected by validation | It is rejected | One log line with `code`, `player_id` and no payload content |
| AC5 | A burst of 200 requests from one IP to `/sessions` | They are sent | At most 60 succeed per minute; the rest get `429`, and the limiter itself does not error |
| AC6 | An unhandled exception | It occurs | One log line at `level: "error"` with the error name and message, stack only in the local environment |

## 4. Contract

Log line (one `console.log(JSON.stringify(...))`, Cloudflare Logs picks it up):

| Field | Type | Notes |
|-------|------|-------|
| `level` | `"info" \| "warn" \| "error"` | — |
| `request_id` | string | UUIDv4, same as `x-request-id` |
| `route` | string | Method + route template, e.g. `POST /api/v1/rooms` |
| `status` | integer | HTTP status or DO rejection mapped to one |
| `duration_ms` | integer | — |
| `cf_ray` | string | From the request |
| `room_code` | string? | When applicable |
| `player_id` | string? | Internal id only, never a Clerk `sub` |
| `code` | string? | Rejection code |

Rate limits (from `NFR-25`): `/sessions` 60/min per IP; `POST /rooms` 10/min per IP and 30/h per account;
`/leaderboard` 120/min per IP; `signal` 20/s per member; `chat` 2/s per member.

## 5. Rules and edge cases

- The logger is the only place that writes to stdout; routes return values, they do not `console.log`.
- A log line is emitted on the error path too — a 500 without a line is a bug.
- Rate-limit counters are per-IP and per-account separately; one being under the limit does not exempt the other.
- The limiter must fail open on its own storage error (a broken counter must not take the API down) and log that it did.
- `duration_ms` measures handler time, not socket lifetime.

## 6. Implementation notes

- `apps/worker/src/log.ts` (`logRequest`, `logRejection`), middleware in `index.ts`; `apps/worker/src/ratelimit.ts`
  with a `RateLimit` DO class (one instance per IP or account key).
- Tests assert the shape with `vi.spyOn(console, "log")` and the absence of a PII list.

## 7. Out of scope

- Dashboards and alerts (Cloudflare's built-in; the runbook names them).
- Log shipping to a third party.

## 8. Test notes

`TC-OPS-118` (line per request), `TC-OPS-173` (no PII), plus `tests/worker/ratelimit.test.ts` for the thresholds and the
fail-open path.

## 9. Open questions

None.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**done.** the JSON log line, per-IP and per-account limiter and the `request_id` echo are implemented and covered by `apps/worker/tests/lib.test.ts`
