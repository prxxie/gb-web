# API — contract guide

Backend-agnostic. The stack pack shows how to produce these shapes in its framework; this file decides what they are.

## 1. The four project decisions

Record these once in `docs/01-overview/conventions.md` and `docs/02-reference/api/README.md`. They are choices, not
defects — but an endpoint that deviates from the recorded choice is a defect.

| Decision | Options | Rule |
|----------|---------|------|
| JSON casing | `snake_case` or `camelCase` | One casing for response fields, request fields, **and** query parameter names. No per-endpoint translation layer. |
| Success envelope | bare resource, or `{ "data": … }` | Pick one. Bare resources are simpler; a wrapper leaves room for `meta` later. Whichever is chosen, `error` never appears inside a 2xx body. |
| Collection shape | `{ "items": [...] }`, or a bare array when the endpoint is bounded and unpaginated | A paginated collection carries its cursor/meta, so it always uses the object form. |
| Pagination style | cursor (default), offset for admin tables that need page jumps | A resource uses one style. Both are listed in § 5. |

A backend pack's example may predate this decision. When the two differ, this pack decides the shape and the backend
pack keeps the mechanics; fix the older example in the same change that touches it, and note the resolution in
`conventions.md`.

## 2. Resources and URLs

```
GET    /api/v1/orders                  list (paginated)
POST   /api/v1/orders                  create            → 201 + Location
GET    /api/v1/orders/{id}             read one
PUT    /api/v1/orders/{id}             full replace
PATCH  /api/v1/orders/{id}             partial update
DELETE /api/v1/orders/{id}             delete            → 204

GET    /api/v1/orders/{id}/items       ownership nesting, one level only
POST   /api/v1/orders/{id}/cancel      action that is not CRUD (verb allowed, sparingly)
GET    /api/v1/orders?status=paid      filtering via query parameters, never a path segment
```

- Plural, kebab-case (`/team-members`), lowercase. No verbs except a genuine action endpoint, no file-like suffixes.
- Nest at most one level, and only for a real ownership relation. `/users/{id}/orders/{oid}/items` is three levels of
  query in a path: use `/order-items?order_id=…`.
- The path holds only identifiers and resource names; everything else is a query parameter.
- Version is in the path from day one (`/api/v1`). Adding it later means every existing client breaks or every route
  gains an alias — § 7.
- Trailing slashes, case, and pluralization are not in the client's control: pick one form and never redirect between
  them.

## 3. Methods and status codes

| Method | Safe | Idempotent | Use for |
|--------|------|-----------|---------|
| `GET` | yes | yes | Read. Never mutates, never logs the caller in, never sends an email |
| `POST` | no | no (unless § 6) | Create, or a non-CRUD action |
| `PUT` | no | yes | Full replacement; omitted optional fields reset to default |
| `PATCH` | no | no | Partial update; only the fields present are touched |
| `DELETE` | no | yes | Delete. Second call returns 204 or 404 — documented, not random |

| Status | When |
|--------|------|
| `200` | Read, replace, partial update, action with a result |
| `201` | Created, with a `Location` header pointing at the new resource |
| `202` | Accepted for async processing, with a way to poll the result |
| `204` | Success with no body (delete, or a partial update that changes nothing worth returning) |
| `400` | Malformed syntax: unparsable JSON, wrong content type, an uncastable parameter |
| `401` | No credentials, or invalid/expired ones. Include `WWW-Authenticate` |
| `403` | Authenticated, not allowed. Do not use 403 to hide existence — that is 404 |
| `404` | The resource does not exist, **or** must not be revealed to this caller |
| `409` | The request conflicts with current state: duplicate unique value, illegal transition |
| `412` | `If-Match` failed (optimistic concurrency, § 4) |
| `422` | Syntactically valid but semantically invalid: field rules, business-rule violations |
| `429` | Rate limited, with `Retry-After` (§ 6) |
| `500` | Unexpected failure. Generic body, correlation id in the log, never the exception text |
| `503` | Temporary unavailability, with `Retry-After` |

- Never `200` with `{"success": false}`. The status line is the contract; clients branch on it.
- 400 vs 422 is the most common inconsistency: a schema problem detected before the handler is 400, a rule the domain
  enforces (with field details) is 422. Where the framework validates before the handler runs, that is 400 — unless the
  backend pack maps it deliberately (FastAPI reports request-validation failures as 422). Either is acceptable; what is
  not acceptable is an API where the same class of failure returns 400 on one route and 422 on another. State the
  choice in `docs/02-reference/api/README.md`.
- `GET` and `HEAD` are cacheable: a response that varies by caller sets `Cache-Control: private` or `no-store`.

## 4. Bodies

Success: the resource object (or the recorded envelope), with every documented field present. `null` means "known to
be absent"; an omitted key means "not part of this representation" — do not mix the two.

Error: **RFC 9457 problem details**, `Content-Type: application/problem+json`, one shape for every error path:

```json
{
  "type": "https://example.com/problems/validation",
  "title": "Request validation failed",
  "status": 422,
  "detail": "The request is invalid.",
  "instance": "/api/v1/orders",
  "request_id": "0f9c1e6a-3d5b-4a1e-9c1f-2b7f5d0a4c11",
  "errors": [
    { "field": "items", "code": "too_few", "detail": "at least one item is required" }
  ]
}
```

- `type` is a stable URI identifying the problem class (`about:blank` when there is no specific page); clients may
  branch on it. `title` is short and stable, `detail` is human-readable and may change. `status` repeats the HTTP code.
- Field-level failures go in `errors[]` with `field` (dot path), a machine `code`, and a `detail`; the top-level
  `detail` stays generic so the client can show a summary.
- `request_id` (or `trace_id`) is set by the same middleware/logging that writes the log line. It is how support
  connects a user report to a log entry, and it is the only internal identifier that may appear in a body.
- Validation on a batch or a nested object: `field` uses the dot path (`items[0].quantity`) so the client can map it to
  an input.
- Never include: exception class names, stack traces, SQL, file paths, upstream service messages, secrets, or the raw
  request body.
- Dates: ISO 8601 in UTC with `Z` (`2026-10-21T09:15:00Z`); dates without a time are `YYYY-MM-DD`.
- Numbers that are money: a decimal string (`"12.50"`) or integer minor units plus `currency`, never a JSON float.

Optimistic concurrency (when two users edit the same record): the resource exposes `ETag`; `PATCH`/`PUT` accept
`If-Match`; a mismatch returns `412` with a problem body telling the client to reload. Decide whether a resource needs
it in `conventions.md`; a lost-update bug on a shared record is the symptom of skipping it.

## 5. Collections and pagination

Cursor style, for anything that grows:

```
GET /api/v1/orders?limit=20&cursor=eyJpZCI6MTQzfQ
```
```json
{
  "items": [ … ],
  "next_cursor": "eyJpZCI6MTQzfQ",
  "has_more": true
}
```

Offset style, for admin tables where a user jumps to page 9:

```
GET /api/v1/orders?page=2&per_page=20
```
```json
{ "items": [ … ], "meta": { "page": 2, "per_page": 20, "total": 142 } }
```

- `limit`/`per_page` has a documented default and a maximum; a request above the maximum is clamped or rejected —
  documented, not silently ignored.
- Ordering is total: the documented sort plus a unique tiebreaker. Without it, pages repeat and drop rows (the
  SQL-level reason is in `cpt-stack-data`).
- The cursor is opaque to clients: base64 of the last row's sort key, never an offset in disguise, and never trusted —
  an unparsable cursor is a 400.
- `total` on offset paging is a `COUNT` over the filter; on a large table it is a scan. If the UI can live without an
  exact total, omit it rather than paying for it on every page.
- Empty result is `200` with `items: []` (never 404, never `null`).

## 6. Filtering, sorting, search, idempotency, rate limits

- Filters are query parameters named after the documented field, `?status=paid`. Multi-value is a repeated parameter or
  a comma list — one form, documented. Operators, if offered, use a fixed vocabulary (`?created_at[gte]=…`), not
  arbitrary expressions.
- Filtering, sorting, and field selection are validated against an **allowlist** per endpoint: an unknown field is
  `400`. A client-supplied field name that reaches the query builder is an injection and a denial-of-service vector.
- Sorting: `?sort=-created_at,name` (leading `-` is descending), limited to the allowlist.
- Search: `?q=` for a full-text query, documented as to which fields it covers.
- Idempotency for a `POST` that creates something a client may retry (a payment, an order): the client sends
  `Idempotency-Key`; the server stores the key with the response for a documented window and replays that response
  (including the original status) instead of creating a second resource. Document that other `POST`s are **not**
  retry-safe.
- Rate limits: document the limit per class of caller (anonymous, authenticated, service). Respond `429` with
  `Retry-After` seconds and the problem body `type` for rate limiting. Limit headers are the gateway's standard
  `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` fields if it emits them, otherwise the legacy
  `X-RateLimit-*` set — record which in `conventions.md` so clients parse one. Do not invent a header family the
  gateway does not send.

## 7. Versioning and deprecation

- The version lives in the path (`/api/v1`). At most two versions are served at once: current and previous.
- **Additive changes do not need a version**: a new optional response field, a new optional query parameter, a new
  endpoint, a new error `type`.
- **Breaking changes do**: removing or renaming a field, changing a type or format, changing a status code for an
  existing path, changing auth, tightening validation on an existing field, or changing pagination shape.
- Deprecating: announce with a date, add the `Deprecation` and `Sunset` response headers to the old version, keep it
  working until the sunset date, then return `410` with the problem body. The docs page for the resource carries the
  same dates.
- A breaking change to a field the UI reads needs a story: it is a contract change, so `cpt-change` records the impact
  on docs, stories, and clients before any code moves.

## 8. Anti-patterns

| Anti-pattern | Why it fails | Do instead |
|--------------|--------------|------------|
| `200` + `{"success": false}` | Clients and proxies cannot branch or cache correctly | Semantic status codes |
| Verb URLs (`/getOrders`, `/orders/create`) | Loses method semantics, breaks caching and tooling | `GET /orders`, `POST /orders` |
| `500` for a validation failure | Hides a client bug as a server incident, pages someone at night | `400`/`422` with field details |
| Two error shapes (one from the framework, one from the handler) | Clients need two parsers; the framework path leaks | One filter/interceptor produces every error |
| Returning the ORM entity | Leaks new columns and internal fields as the schema grows | Explicit response DTO per endpoint |
| Unbounded list endpoint | One request can exhaust memory and the pool | `limit` with a maximum, paginated |
| Client-chosen sort/filter field | Injection or a full scan per request | Allowlist per endpoint |
| Silent field renames in place | Every client breaks at once, silently | Add new, deprecate old, remove in the next version |
| `null` and a missing key used interchangeably | Clients cannot distinguish "unset" from "empty" | One meaning, documented |
| Float for money in JSON | Rounding errors in the client | Decimal string or minor units |
