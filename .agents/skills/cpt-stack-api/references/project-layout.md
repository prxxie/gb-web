# API — where the contract lives

The contract is an artifact in the repo, not a habit. This file says where it lives and what shape it takes.

## 1. Files

```
<repo>/
├─ openapi.yaml                committed machine contract (split into openapi/ when it grows)
├─ redocly.yaml                lint ruleset for the spec
└─ docs/02-reference/api/
   ├─ README.md               the four project decisions (§ 4) + auth scheme + base URL
   ├─ orders.md               one page per resource
   ├─ order-items.md
   └─ errors.md               the problem `type` catalogue (every code the API can return)
```

- `cpt-docs` creates `README.md` and `errors.md` at the standard tier and above, and one page per resource the brief
  names. A resource added later gets its page in the same story that adds the route (`cpt-ship` § 5).
- The spec is committed. It is never published from a running dev server: a spec generated at request time documents
  whatever the code happens to do, including the endpoints nobody reviewed.

## 2. One page per resource

Fixed structure, so a reviewer can diff two resources against each other:

```markdown
# Orders

Owner: orders module · Auth: bearer, owner-scoped · Pagination: cursor

## Endpoints

| Method | Path | Auth | Success | Errors |
|--------|------|------|---------|--------|
| GET | /api/v1/orders | bearer | 200 `OrderList` | 401, 422 |
| POST | /api/v1/orders | bearer | 201 `Order` + Location | 401, 409, 422 |
| GET | /api/v1/orders/{id} | bearer, owner | 200 `Order` | 401, 403, 404 |
| PATCH | /api/v1/orders/{id} | bearer, owner | 200 `Order` | 401, 403, 404, 409, 412, 422 |
| DELETE | /api/v1/orders/{id} | bearer, owner | 204 | 401, 403, 404, 409 |

## Fields

| Field | Type | Nullable | Writable on create | Writable on update | Notes |
|-------|------|----------|--------------------|--------------------|-------|
| id | string (uuid) | no | — | — | |
| status | enum `pending·paid·shipped` | no | no | no | transitions in § Rules |
| total_amount | string (decimal) | no | yes | no | returned with `currency` |
| created_at | string (ISO 8601, UTC) | no | — | — | |

## Rules
Business rules the endpoint enforces, with the error `type` and `code` each violation returns.

## Filters and sort
Allowed `filter` fields, default sort, maximum `limit`.

## Examples
One request, one success response, one error response — real bodies, not sketches.
```

Rules:

- Field names in this page are the wire names, in the project's casing. They must match `docs/02-reference/data/` for the
  stored model, with any mapping documented explicitly.
- Every error listed in the endpoints table appears in `errors.md` with its `type`, `title`, and when it is returned.
- An endpoint without a row in this page does not exist, even if it responds.

## 3. openapi.yaml

- One file while the API is small; split into `openapi/paths/`, `openapi/components/schemas/` with `$ref` when it passes
  a few hundred lines. The entry file keeps `info`, `servers`, and `security`.
- When the framework generates the spec (FastAPI does), the generated document is exported to the repo by a script the
  project owns, and reviewed like any other code. A generated spec still needs the review checklist: generation
  guarantees it matches the code, not that the contract is right.
- The lint ruleset enforces the mechanical rules of this pack: operation ids, response codes for every operation, a
  problem schema referenced by every 4xx/5xx, and no inline schemas.
- `servers` lists environments by name; no absolute dev host in the committed file.

## 4. The decisions block

`docs/02-reference/api/README.md` opens with the four decisions from [coding.md](coding.md) § 1 and the auth scheme:

```markdown
| Decision | Choice |
|----------|--------|
| JSON casing | snake_case |
| Success envelope | bare resource (no `data` wrapper) |
| Collection shape | `{ items, next_cursor, has_more }`; bare array only for bounded, unpaginated lists |
| Pagination | cursor default; offset for the admin tables listed in conventions.md |
| Auth | Bearer JWT (issuer: …); resource ownership checked in the service layer |
| Rate-limit headers | The gateway's standard `RateLimit-*` fields if it emits them, otherwise legacy `X-RateLimit-*` |
```

`conventions.md` links here rather than repeating it. A change to this block is an API change and goes through
`cpt-change`.

## 5. Ownership boundary

| Owns | Pack |
|------|------|
| URL shape, status codes, error body, collection and pagination shape, versioning, deprecation | This pack |
| Producing those shapes: exceptions, filters, serializers, route prefixes, validation | The stack pack (`cpt-stack-fastapi`, `cpt-stack-nestjs`) |
| Column types, indexes, and migration policy behind an endpoint | `cpt-stack-data` |
| Casing, envelope, pagination style, auth scheme, rate-limit header family | `docs/02-reference/api/README.md` + `conventions.md` |

Precedence: `conventions.md` (the project) → this pack (the wire) → the stack pack (the mechanism). When the stack pack
and this pack disagree about a shape, this pack wins and the stack pack's example is corrected in the same change.

## 6. Setup (US-FND-001)

1. Write `docs/02-reference/api/README.md` with the decisions block and the base URL.
2. Create `openapi.yaml` with `info`, one `servers` entry per environment, and the security scheme.
3. Add the lint ruleset and one CI job that runs it, plus the breaking-diff job for changes to an already-published
   version.
4. Add `errors.md` with the problem `type` catalogue — start with the generic ones this pack names (validation,
   unauthorized, forbidden, not found, conflict, rate limited, internal).
5. Document every resource the brief names with the page template in § 2. Each page gets its endpoint rows filled in as
   stories implement them, never left as "TBD" past the story that adds the route.
