# API — testing the contract

Contract tests are request-level tests whose expected values come from `docs/02-reference/api/`, not from the
implementation. The backend pack supplies the harness (`cpt-stack-fastapi` or `cpt-stack-nestjs`, whichever is
installed — its `references/testing.md`); this file says what to assert.

## 1. Levels

| Level | What it proves | Where |
|-------|----------------|-------|
| Contract test (per endpoint) | Status, body shape, error body, headers for every documented path | The backend pack's request/e2e suite |
| Error matrix (per resource) | Every listed failure returns the documented status + problem `type` | Same suite, one file per resource |
| Pagination invariants | No row is skipped or repeated across pages; the bound is enforced | Same suite, or a property-style loop over a seeded set |
| Spec lint | The OpenAPI file is mechanically sound and references the problem schema | CI |
| Breaking diff | A published shape did not change unnoticed | CI, on the diff against the previous release tag |

A contract test that mocks the layer under test proves the mock. These tests use the real router, validation, and error
handler against a real (or realistically faked) database, exactly as the backend pack's request tests do.

## 2. Per endpoint, assert all of these

| Assertion | Why it matters |
|-----------|----------------|
| Success status is exactly the documented one | Clients branch on it; `201` vs `200` is a contract |
| `Location` on `201` points at the created resource and that URL returns it | The header is worthless if it 404s |
| Response body has exactly the documented keys — no extra internal field | Catches a leaked ORM field after a schema change |
| `null` vs missing key matches the docs | Clients cannot distinguish them otherwise |
| `Content-Type` is `application/json` (success) / `application/problem+json` (error) | Parsers and gateways rely on it |
| Dates parse as ISO 8601 UTC | A local-time string breaks every client in another zone |
| Money is a string or integer per the docs, never a float | A float asserts nothing about rounding |

An "exactly the documented keys" assertion is the cheapest defence against the response-DTO regression that leaks
`password_hash` after a column is added.

## 3. Error matrix

For each resource, one test per row of its endpoint table's `Errors` column:

| Case | Expect |
|------|--------|
| No credentials | `401` + `WWW-Authenticate` |
| Credentials for another user's resource | `403` or `404` per the docs, with the problem body — never a `500` |
| Unknown id / unknown route / wrong method | `404` / `404` / `405`, all through the same problem body, including the framework's own handlers |
| Malformed JSON, wrong content type | `400` |
| Unknown field in the body | `422` or `400` per the recorded boundary, and **no resource created** |
| Field rule violated | `422`, `errors[]` names the field path and a stable `code` |
| Duplicate unique value | `409` with the documented `type` |
| Illegal state transition | `409`, state unchanged afterwards |
| `If-Match` mismatch (where supported) | `412` |
| Forced unexpected failure | `500` with a generic `detail`, a `request_id`, and no exception text or stack |
| Rate limit exceeded (if testable) | `429` + `Retry-After` + problem `type` |

The `500` test is the one teams skip. It is also the one that catches a leaked stack trace in production.

## 4. Pagination invariants

Seed more rows than one page and assert:

1. Walking the cursor from the first page reaches every seeded row exactly once (collect ids into a set, compare).
2. Two rows with an identical sort key still appear once each — this is what the unique tiebreaker guarantees.
3. A request above the maximum `limit` is clamped or rejected as documented, never honoured.
4. An unparsable cursor is `400`, not `500` and not "start from the beginning".
5. Inserting a row mid-walk does not duplicate the row that was the cursor's neighbour (cursor stability).
6. The empty collection is `200` with `items: []`.

## 5. Filter and sort allowlists

| Case | Expect |
|------|--------|
| Documented filter field | Filtered result |
| Unknown filter field | `400` |
| SQL-ish payload in a sort parameter (`sort=id;DROP`) | `400` from the allowlist, never a query error |
| `limit=-1`, `limit=0`, `page=-3` | `400` or the documented clamp |
| Filter combination the docs do not allow | `400` with the reason, not a silently ignored parameter |

## 6. Spec and breaking-change checks in CI

```bash
npx @redocly/cli lint openapi.yaml                                   # mechanical rules
npx @redocly/cli diff "$PREV_SPEC" openapi.yaml                     # if the installed CLI has diff; else the team's spec diff
```

- The diff runs only when a spec change is present; treat a reported breaking change as a story-level decision, not a
  build failure to suppress.
- When the project has no OpenAPI file, the same review is manual: diff `docs/02-reference/api/` against the previous
  release and apply the breaking-change list in [coding.md](coding.md) § 7.

## 7. Idempotency

Where a `POST` supports `Idempotency-Key`:

1. Same key sent twice → one resource exists, both responses are byte-identical, the second carries the replay marker
   the docs name.
2. A different key → a second resource.
3. The same key with a different body → documented behaviour (usually `409`), asserted.

## 8. Documented examples must run

Every request/response pair in `docs/02-reference/api/<resource>.md` is a candidate test payload. Copying them into the
contract test keeps the docs honest: an example that no longer matches the schema fails the suite instead of misleading
an integrator.

A story that adds or changes an endpoint is not done until its contract tests pass **and** its docs examples still
match — verified by running the suite, not by reading the diff.
