---
id: US-AUTH-001
title: Continue as a guest without creating an account
epic: EPIC-01-accounts
status: ready
priority: P0
size: S
depends_on: [US-FND-002]
open_questions: []
accepted_assumptions: []
refs: [02-reference/api/accounts.md, 01-overview/roles-and-permissions.md, 02-reference/screens/main.md]
---

# US-AUTH-001 — Continue as a guest without creating an account

## 1. Story

**As a** visitor who just wants to play
**I want** a session token without signing in
**so that** I can create or join a room, play and leave without giving any personal data.

## 2. Context

Every room, WebSocket and TURN credential needs a `subject`; a guest subject is the cheapest one, and guests are
unranked by decision (`OQ-05`). The screen side is the main menu's guest path; the API side is `POST /sessions` without
a Clerk token.

| Topic | Reference |
|-------|-----------|
| `POST /sessions` contract | [api/accounts.md](../../02-reference/api/accounts.md#post-sessions) |
| Guest role and what it may not do | [roles-and-permissions.md](../../01-overview/roles-and-permissions.md) |
| Main menu entry points | [screens/main.md](../../02-reference/screens/main.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | No Clerk token | `POST /api/v1/sessions` with `{"kind":"guest"}` | `201` with a `sessionToken`, `expiresAt` 60 minutes ahead, `subject.kind = "guest"` and a `guestId`, and `wsUrl` pointing at the room socket base (`TC-AUTH-074`) |
| AC2 | A guest session token | It is used on a request 61 minutes later | `401` with `type` ending `/unauthenticated`, and the client refreshes at 55 minutes instead of failing mid-match (`TC-AUTH-057`) |
| AC3 | A guest session token | `GET /me`, `start_match` or `team_assign` is attempted | `401` or `403`, the room state is unchanged (`TC-AUTH-065`) |
| AC4 | The main menu, signed out | Play / Create room / Join is tapped | No sign-in prompt appears and the room flow proceeds as a guest (`TC-AUTH-135`) |
| AC5 | Any response body for a guest | It is inspected | It contains no email, no `accountId` and no Clerk identifier |
| AC6 | The browser's storage after a guest session | It is inspected | The session token is in memory or `sessionStorage` only, never `localStorage` — it dies with the tab |

## 4. Contract

`POST /api/v1/sessions` request: `{"kind": "guest"}` (the `kind` field is required when no bearer token is present).
Response `201`:

| Field | Type | Notes |
|-------|------|-------|
| `sessionToken` | string | Opaque, HMAC-signed, 60 min |
| `expiresAt` | string | ISO-8601 UTC |
| `subject` | object | `{kind: "guest", guestId: "<uuid>"}` |
| `wsUrl` | string | `wss://<host>/api/v1/rooms/` base; the client appends the code |

`sessionToken` claims: `sub` (guestId), `kind: "guest"`, `iat`, `exp`, `jti`. It is presented as
`Authorization: Bearer <token>` for REST and in the first WebSocket message, never in a URL.

## 5. Rules and edge cases

- A guest identity lives only as long as the token plus the room's `lastSnapshot`; nothing is written to D1.
- Rate limits apply per IP, not per guest: 10 rooms/minute (`TC-ROOM-072`).
- Reconnecting as a guest inside the grace window uses the same `guestId` from the in-memory token; after a reload
  with a lost token the player rejoins as a new member if a slot is free, otherwise sees the room-full error.
- Clerk being down must not affect guests: `/sessions` with `kind: guest` never calls Clerk.

## 6. Implementation notes

- `apps/worker/src/routes/sessions.ts`; token signing with `SESSION_TOKEN_SECRET` (Web Crypto HMAC-SHA256, base64url).
- `jti` goes in a short-lived KV-free denylist only on delete/logout — v1 has no logout for guests, so no store exists.
- The web client keeps the token in a module-scoped variable plus `sessionStorage` under `gbw.session` for a tab reload.

## 7. Out of scope

- Sign-in ([US-AUTH-002](US-AUTH-002-sign-in-with-clerk.md)), profile editing, deletion.
- Persisting a guest's stats anywhere.

## 8. Test notes

`TC-AUTH-074`, `TC-AUTH-057`, `TC-AUTH-065`, `TC-AUTH-135`. Worker tests use miniflare with a fake `SESSION_TOKEN_SECRET`;
the expiry test moves the clock with `vi.setSystemTime`. Red first: `tests/worker/sessions.test.ts::guest_session_shape`.

## 9. Open questions

None. Guest anonymity and the unranked consequence were decided (`OQ-05`).

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**done.** `POST /sessions`, the HMAC token, `sessionStorage` persistence and the guest profile path are implemented; mint/verify/forgery/expiry are covered by `apps/worker/tests/lib.test.ts`
