# API reference

Base URL: `https://<worker-host>/api/v1` (production `https://gbw.<client-domain>/api/v1`). The SPA and the API share
an origin, so there is no CORS preflight in normal use; the preview environment allows exactly its Pages origin.

Contract conventions come from the `cpt-stack-api` pack; the ones this project fixes are in
[`01-overview/conventions.md`](../../01-overview/conventions.md#6-errors).

## Authentication

| Caller | Credential | Where it goes | Lifetime |
|--------|-----------|---------------|----------|
| Registered player | Clerk session JWT | `Authorization: Bearer <jwt>` | Clerk's token lifetime (refreshed by the client) |
| Any player, incl. guest | **Session token** minted by `POST /sessions` | `Authorization: Bearer <token>` | 60 min, renewed by calling `/sessions` again |
| WebSocket | Session token in the first `auth` message | message body, never the URL | same as the session token |

Why two tokens: the Durable Object must validate a connection without calling Clerk's JWKS on every join, and a guest has
no Clerk identity at all. The Worker verifies the caller (Clerk JWT or a guest challenge), then mints a short-lived
HMAC-signed session token; the DO verifies that token's signature and expiry locally ([ADR-0002](../../04-decisions/adr/ADR-0002-auth-clerk-jwt.md)).

Rules: a guest token grants room create/join, TURN and WS only — every `/me` and `/matches` call needs a Clerk JWT
(`401 unauthenticated` otherwise). Tokens are never placed in URLs, and never logged (`NFR-10`, `NFR-12`).

## Endpoint index

| Method | Path | Purpose | Auth | Success | Errors | File | Story |
|--------|------|---------|------|---------|--------|------|-------|
| POST | `/sessions` | Mint a session token (guest or registered) | optional Clerk JWT | 201 | 401, 422, 429 | [accounts.md](accounts.md#post-sessions) | US-AUTH-001 |
| GET | `/turn-credentials` | Short-lived TURN credentials | session token | 200 | 401, 429 | [rooms.md](rooms.md#get-turn-credentials) | US-ROOM-006 |
| POST | `/rooms` | Create a room | session token | 201 | 401, 422, 429 | [rooms.md](rooms.md#post-rooms) | US-ROOM-001 |
| GET | `/rooms/{code}` | Joinability preview | none | 200 | 404, 410 | [rooms.md](rooms.md#get-roomscode) | US-ROOM-001 |
| GET | `/rooms/{code}/ws` | WebSocket upgrade (signaling) | session token in first message | 101 | 401, 404, 409, 410, 429 | [signaling.md](signaling.md) | US-ROOM-002 |
| GET | `/me` | Own profile, rating, stats | Clerk JWT | 200 | 401 | [accounts.md](accounts.md#get-me) | US-AUTH-003 |
| PATCH | `/me` | Change display name or avatar | Clerk JWT | 200 | 401, 409, 422 | [accounts.md](accounts.md#patch-me) | US-AUTH-003 |
| DELETE | `/me` | Delete own account | Clerk JWT | 204 | 401, 409 | [accounts.md](accounts.md#delete-me) | US-AUTH-004 |
| GET | `/me/matches` | Own match history, newest first | Clerk JWT | 200 | 401 | [matches.md](matches.md#get-mematches) | US-RANK-003 |
| POST | `/matches` | Record a finished match | Clerk JWT | 201 | 401, 403, 409, 422 | [matches.md](matches.md#post-matches) | US-RANK-001 |
| GET | `/leaderboard` | Top players by rating | none | 200 | — | [matches.md](matches.md#get-leaderboard) | US-RANK-004 |
| GET | `/health` | Liveness + build id | none | 200 | — | — | US-FND-002 |

## Response conventions

| Concern | Rule |
|---------|------|
| Content type | `application/json; charset=utf-8`; errors `application/problem+json` |
| Success bodies | The resource itself, or `{ "items": [...], "next_cursor": "...", "has_more": true }` for a collection |
| Ids | UUIDv4 strings, server-minted; a client never proposes an id except `roomCode` in a path |
| Dates | ISO-8601 UTC with `Z` |
| Enums | The exact strings in the [glossary](../../01-overview/glossary.md#status-values-in-one-place) |
| Nullability | `null` = known to be absent; an omitted key = not part of this representation |
| Pagination | Cursor only, `limit` default 20 / max 100; an unparsable `cursor` → `400` |
| Idempotency | `POST /matches` accepts `Idempotency-Key`; a replay within 24 h returns the stored `201` body |
| Caching | `GET /leaderboard` → `Cache-Control: public, max-age=30`; everything else `no-store` |
| Versioning | The path carries `v1`. A breaking change means `v2` + a deprecation window of one release |
| Request tracing | Every response and problem body carries `request_id`; the log line uses the same id (`NFR-24`) |

## Error catalogue

`type` is the stable URI a client branches on. `title` is fixed per type; `detail` may change.

| `type` (suffix of `https://gbw.app/problems/`) | Status | When | Retryable |
|------------------------------------------------|--------|------|-----------|
| `validation` | 422 | A field failed its documented rule; `errors[]` names it | no |
| `bad-request` | 400 | Malformed JSON, unparsable cursor, wrong content type | no |
| `unauthenticated` | 401 | Missing/expired/invalid credential | after re-auth |
| `forbidden` | 403 | Authenticated but not allowed (not the host, not a participant) | no |
| `room-not-found` | 404 | Unknown `roomCode` | no |
| `room-full` | 409 | Joining a room at `maxPlayers` | no |
| `room-closed` | 410 | Room `ended`/`abandoned`/expired | no |
| `not-host` | 403 | A host-only action from a peer | no |
| `display-name-taken` | 409 | `display_name_key` collision | no |
| `match-already-recorded` | 409 | Same `roomCode` + `startedAt` submitted twice | no |
| `rate-limited` | 429 | `NFR-25` limit hit; `Retry-After` in seconds | yes |
| `unsupported-message` | 400 | WS message type unknown for the room state | no |
| `snapshot-too-large` | 422 | WS snapshot over 8 KB | no |
| `internal` | 500 | Unhandled; `detail` is generic, the cause is in the logs only | yes |

## Contract tests

`tests/worker/api-contract.test.ts` asserts, for every row of the endpoint index: the success status, the error status
for an unauthenticated call, the `application/problem+json` content type on every 4xx, and that no problem body contains a
stack trace or SQL (TC-FND-070). OpenAPI is not kept in v1 — this table is the contract, and `cpt-review` diffs a change
against it.
