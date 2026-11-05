---
id: US-FND-002
title: Serve /health from the worker with the D1 binding and the error envelope
epic: EPIC-00-foundation
status: ready
priority: P0
size: M
depends_on: [US-FND-001]
open_questions: []
accepted_assumptions: []
refs: [02-reference/api/README.md, 02-reference/data/README.md, 04-decisions/adr/ADR-0003-data-d1.md]
---

# US-FND-002 — Serve /health from the worker with the D1 binding and the error envelope

## 1. Story

**As a** developer or an on-call engineer
**I want** one worker process that answers `/api/v1/health`, owns the D1 binding and returns every failure in the
documented problem format
**so that** later stories add routes instead of inventing infrastructure, and monitoring has something to call.

## 2. Context

The worker is both the HTTP API and the host of the `Room` Durable Object class ([ADR-0001](../../04-decisions/adr/ADR-0001-stack-phaser-react-cloudflare.md)).
This story creates that single entry point, the migration runner and the one error shape every endpoint reuses.

| Topic | Reference |
|-------|-----------|
| Response and error conventions | [api/README.md](../../02-reference/api/README.md#response-conventions) |
| D1 ownership and migrations | [data/README.md](../../02-reference/data/README.md) |
| Storage decision | [ADR-0003](../../04-decisions/adr/ADR-0003-data-d1.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A fresh worker | `GET /api/v1/health` | `200` with `{"status":"ok","version":"<build sha>"}` and no other keys (`TC-FND-001`) |
| AC2 | A route that throws an `AppError(422, "validation_failed", detail)` | The route is called | The response is `application/problem+json` with `type`, `title`, `status`, `detail`, `instance`, `request_id` and the detail under `errors[]` when the detail is a field map |
| AC3 | A route that throws an unexpected `Error` | The route is called | `500` with `type` ending `/internal`, no stack trace, no SQL, and the same `request_id` that appears in the log line |
| AC4 | An empty local D1 | `wrangler d1 migrations apply GBW_DB --local` runs | It exits 0 and creates the schema `data/README.md` documents, with `_migrations` recorded and the result equal to the documented schema (`TC-FND-100`) |
| AC5 | The `WorkerEntrypoint` and the `Room` class | `pnpm dev:worker` starts | The Durable Object namespace `ROOMS` is bound, and a request to a non-existent room class route returns `404` without a crash |
| AC6 | Every endpoint of the service | `openapi.yaml` is linted | `npx @redocly/cli lint openapi.yaml` reports no errors; `/health` is described in it (`TC-FND-070`) |

## 4. Contract

`GET /api/v1/health` → `200 application/json`

| Field | Type | Notes |
|-------|------|-------|
| `status` | `"ok"` | Literal; the only value in v1 |
| `version` | string | Cloudflare `CF_VERSION_METADATA.id` short sha, or `dev` under `wrangler dev` |

Problem body (`application/problem+json`): as documented in [api/README.md](../../02-reference/api/README.md#response-conventions);
`request_id` is a UUIDv4 minted per request and echoed in the `x-request-id` response header.

`apps/worker/src/index.ts` exports:

```ts
export default { fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> }
export { Room } from "./room";
```

`wrangler.jsonc` bindings: `d1_databases[0]` = `GBW_DB`, `durable_objects.bindings[0]` = `ROOMS` (class `Room`),
`version_metadata` binding enabled, `compatibility_date` fixed to the date of the release that pins it.

## 5. Rules and edge cases

- `/health` must not touch D1, the DO or Clerk — it answers even when every dependency is down, otherwise the
  availability SLO measures the wrong thing.
- `request_id` must be present on success too, not only on errors.
- Migrations are forward-only and numbered `NNNN_<slug>.sql`; a rollback is a new migration, never an edit of an
  applied one.
- The worker never returns a Cloudflare-generated error page for `/api/v1/*`: `fetch` is wrapped so an unhandled throw
  becomes AC3's shape.
- No secret may be echoed into `detail` or `errors[]`.

## 6. Implementation notes

- `AppError` in `apps/worker/src/errors.ts`; `toProblem(error, requestId)` renders it; the router catches once at the top.
- `openapi.yaml` lives in `apps/worker/openapi.yaml` and is copied into `docs/02-reference/api/` only if the two ever
  diverge — v1 keeps one file: `docs/02-reference/api/openapi.yaml` is the contract source.
- `wrangler dev` needs `--persist-to .wrangler/state` so migrations survive a restart.

## 7. Out of scope

- Authentication and authorization (AUTH epic), rooms, signaling, match recording.
- Structured logging beyond the single line required for AC3 — [US-OPS-001](../EPIC-08-ops/US-OPS-001-emit-structured-logs-and-rate-limits.md).

## 8. Test notes

`TC-FND-001`, `TC-FND-070` (contract fixtures against `openapi.yaml`) and `TC-FND-100`
(`apps/worker/tests/migrations.test.ts`, miniflare D1). Red first: the health test fails against the empty worker.

## 9. Open questions

None.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**done.** `GET /api/v1/health` plus the shared problem body, request id, structured log line and rate limiter are implemented and covered by `apps/worker/tests/lib.test.ts`
