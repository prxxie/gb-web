---
name: cpt-stack-api
description: HTTP API contract conventions for any backend — resource URLs, method and status-code semantics, the RFC 9457 error body, cursor and offset pagination, filter and sort allowlists, idempotency keys, rate-limit headers, versioning and deprecation, and keeping the OpenAPI file true. Cross-cutting, installs alongside any backend stack pack. Use when designing or reviewing an endpoint, status code, error body, collection response, breaking change, or the API reference docs.
status: unverified            # unverified | verified — see packs/README.md
---

# cpt-stack-api

Cross-cutting pack for the HTTP contract. It is backend-agnostic: the framework mechanics (routers, DTOs, filters,
serializers) belong to the stack pack (`cpt-stack-fastapi`, `cpt-stack-nestjs`); this pack decides **what the wire
looks like**. Project decisions in `docs/01-overview/conventions.md` override it.

## Scope and versions

Covers: resource naming and nesting, method and status-code semantics, the error body, success and collection shapes,
pagination, filtering/sorting/search, idempotency, rate limiting, versioning and deprecation, and the OpenAPI artifact.

**Written for:** HTTP semantics per RFC 9110 and problem details per RFC 9457 (2026-10) — both stable, so this pack has
no library version to track. **Not exercised end to end by CPT**: the rules below are review policy. Where a rule
depends on the framework (how an exception becomes a response, how a route prefix is set), the stack pack decides the
mechanism and this pack decides the shape.

## PROJECT values

What `cpt-docs` writes into `AGENTS.md` § PROJECT:

| Field | Value |
|-------|-------|
| Contract source | `docs/02-reference/api/` — one file per resource, plus `openapi.yaml` when the project keeps one |
| Spec lint | `npx @redocly/cli lint openapi.yaml` — one linter per project, recorded in `conventions.md` |
| Breaking diff | `npx @redocly/cli diff <old-spec> <new-spec>` if the installed CLI provides `diff` (check `--help`); otherwise the project's own spec diff |
| Test | The backend pack's request/e2e command; contract assertions are listed in [references/testing.md](references/testing.md) |
| Run locally | The backend pack's run command; base URL is `/api/v1` on that server |

No OpenAPI file yet is a valid state: the docs in `docs/02-reference/api/` are then the only contract, and this pack's
checklist applies to them.

## How this plugs into cpt-ship

1. **Plan** — the story's § 4 contract is an endpoint table, one row per route: method, path, auth, request fields with
   types and constraints, success status and body, error statuses with `code`, pagination style, and whether it is
   idempotent. If a row is missing, the story is not ready — raise an open question (`cpt-decide`) instead of choosing
   at implementation time.
2. **Test first** — request-level tests asserting status, body shape, and the error body for each documented failure
   ([references/testing.md](references/testing.md) § 2). The contract in the docs is the expected value, not the
   implementation's behaviour.
3. **Implement** — the stack pack's mechanics, in the order this pack's table fixes: route, request validation,
   handler, error mapping, response serialization.
4. **Verify** — the backend test command, plus the spec lint when an OpenAPI file exists, plus the breaking diff when a
   published field, path, or status changed.
5. **Docs** — `docs/02-reference/api/<resource>.md` and `openapi.yaml` in the same commit as the code. A route that
   exists only in code is a review finding.

## Review checklist (added to cpt-review)

- [ ] Path is `/api/v1/<plural-kebab-resource>`; no verb in the path except for an action that is genuinely not CRUD
      (`POST /orders/{id}/cancel`), and at most one level of nesting for ownership
      ([references/coding.md](references/coding.md) § 2).
- [ ] Method matches semantics: `GET` is safe and has no side effect, `PUT` is a full replace, `PATCH` is partial,
      `DELETE` is idempotent. No state change on `GET`.
- [ ] Status codes are semantic: 201 (+ `Location`) on create, 204 on delete-without-body, 400 malformed,
      422 semantically invalid, 401 unauthenticated, 403 authenticated-but-forbidden, 404 absent, 409 conflict,
      429 rate limited, 500 with no internal detail. No `200` carrying an error field.
- [ ] Every error response is the same RFC 9457 body, including framework 404/405, validation failures, and the
      unexpected 500 — one place produces it (§ 4).
- [ ] Error bodies carry no stack trace, SQL fragment, file path, secret, or upstream message; unexpected errors carry a
      correlation id that appears in the logs.
- [ ] Request bodies accept only documented fields; unknown fields are rejected, not ignored; server-owned fields
      (id, owner, timestamps, status) are not accepted on create/update.
- [ ] Every collection endpoint is paginated with a bound (`limit` with a maximum), has a total ordering including a
      unique tiebreaker, and documents its cursor/offset style (§ 5).
- [ ] Filter and sort parameters are validated against an allowlist of fields; a client-supplied field name never
      reaches the query builder unvalidated.
- [ ] Dates are ISO 8601 in UTC with `Z`; money is a decimal string or minor units plus a currency code, never a float
      (§ 4).
- [ ] A `POST` that creates a resource or charges for one is either idempotent under a client-supplied
      `Idempotency-Key` or the docs say it is not retry-safe (§ 6).
- [ ] Auth is stated per route in the docs (public, authenticated, role); resource-level authorization is checked in
      the handler layer of the backend pack, not implied by the guard.
- [ ] A breaking change (field removed or renamed, type or status changed, path changed, auth scheme changed) is either
      avoided or shipped as a new version with a deprecation note; additive changes are not versioned (§ 7).
- [ ] `docs/02-reference/api/` and `openapi.yaml` match the implementation; the spec lints clean.
- [ ] JSON casing is uniform across every endpoint, including query parameters, per conventions.md (§ 1).

## References

| File | Read when |
|------|-----------|
| [references/project-layout.md](references/project-layout.md) | Setting up the API docs (US-FND-001), adding a resource's doc page, adding or changing `openapi.yaml`, deciding the envelope and casing |
| [references/coding.md](references/coding.md) | Designing or implementing any route, status code, error body, collection response, filter, or version change |
| [references/testing.md](references/testing.md) | Writing request-level contract tests, the error-body matrix, pagination invariants, or a breaking-change check |
