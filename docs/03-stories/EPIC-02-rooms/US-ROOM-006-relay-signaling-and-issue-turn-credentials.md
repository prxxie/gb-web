---
id: US-ROOM-006
title: Relay peer signaling and issue TURN credentials
epic: EPIC-02-rooms
status: ready
priority: P0
size: M
depends_on: [US-ROOM-002]
open_questions: []
accepted_assumptions: []
refs: [02-reference/api/signaling.md, 02-reference/api/rooms.md, 01-overview/nonfunctional-requirements.md]
---

# US-ROOM-006 — Relay peer signaling and issue TURN credentials

## 1. Story

**As a** peer
**I want** the worker to pass my SDP offer to the host and hand me short-lived TURN credentials
**so that** a connection forms on mobile networks that block direct peer traffic.

## 2. Context

Signaling runs over the same WebSocket the roster uses (`OQ-06` answered as WebSocket); the worker relays opaque SDP
between named members and never inspects or stores it. TURN credentials come from Cloudflare's TURN service with a
one-hour TTL and are never cached or logged (`NFR-10`).

| Topic | Reference |
|-------|-----------|
| `signal` message and limits | [api/signaling.md](../../02-reference/api/signaling.md) |
| `GET /turn-credentials` | [api/rooms.md](../../02-reference/api/rooms.md#get-turn-credentials) |
| NFR-09, NFR-10 | [nonfunctional-requirements.md](../../01-overview/nonfunctional-requirements.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | Two members of one room | A sends `signal {to, payload}` with an SDP offer | B receives the payload byte-identical, and the DO stores nothing (`TC-ROOM-050`) |
| AC2 | A payload larger than 8 KB, or a `to` that is not a member | `signal` is sent | `error` with `code: "bad-signal"`, nothing is relayed (`TC-ROOM-125`) |
| AC3 | A member of the room | `GET /api/v1/turn-credentials` is called | `200` with two `urls` (`turn:` + `turns:`), a `username`, a `credential` and `ttlSeconds: 3600`; no credential appears in the response of any other endpoint (`TC-ROOM-051`) |
| AC4 | The client's storage after a match | It is inspected | No ICE credential, TURN username or token is in `localStorage`, `sessionStorage` or a cookie (`TC-ROOM-052`) |
| AC5 | Signaling for a room in `playing` | A new peer joins the socket | The peers exchange offers only after `match_started`, and the host answers each peer once |
| AC6 | A `signal` addressed to a member that left | It is sent | `error` `peer-not-found`; the sender is not disconnected |

## 4. Contract

`signal` (client → DO → one member): `{"t":"signal","to":"<playerId>","payload":{"type":"offer"|"answer"|"candidate","sdp"|"candidate":…}}`.
The `payload` is JSON ≤ 8 KB and is relayed with `to` rewritten to the sender's `playerId`.

`GET /api/v1/turn-credentials` (session token) → `200`:

| Field | Type | Notes |
|-------|------|-------|
| `urls` | string[] | `["turn:turn.cloudflare.com:3478?transport=udp","turns:turn.cloudflare.com:5349?transport=tcp"]` |
| `username` | string | `<expiryUnix>-<generated>` from Cloudflare's TURN key API |
| `credential` | string | Base64 HMAC — never logged |
| `ttlSeconds` | integer | `3600` |

## 5. Rules and edge cases

- The worker must not log the TURN credential, the username, the SDP or any candidate (`NFR-10`); its log line for this
  route records only `request_id`, `room_code` and `ttlSeconds`.
- Credentials are fetched per call from the TURN key API; no cache, no reuse across players.
- `iceServers` on the client is built from this response only; no hardcoded STUN server.
- A `signal` may not target the sender itself (`bad-signal`).
- Relay only happens between members of the same room; a `playerId` from another room is `peer-not-found`.

## 6. Implementation notes

- `apps/worker/src/routes/turn.ts` calls `https://rtc.live.cloudflare.com/v1/turn/keys/<id>/credentials/generate`
  with `TURN_KEY_API_TOKEN`, 5 s timeout, and maps a non-200 to `503` with `retryAfterSeconds: 30`.
- The client requests credentials once per match, on `match_started`, and rebuilds `RTCPeerConnection` if a new host is
  elected (the old peer connection dies with the old host).
- `payload` is relayed as-is after a size and shape check; the DO must not parse `sdp`.

## 7. Out of scope

- Creating the data channels themselves — [US-NET-001](../EPIC-04-netplay/US-NET-001-connect-peers-with-two-channels.md).
- Self-hosted TURN, or a metered fallback.

## 8. Test notes

`TC-ROOM-050`, `TC-ROOM-125`, `TC-ROOM-051`, `TC-ROOM-052`. The TURN route is tested against a stubbed fetch;
`tests/e2e/privacy.spec.ts` asserts AC4 after a full match.

## 9. Open questions

None. `OQ-06` (signaling transport) was answered as WebSocket to the DO.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**in-progress.** the `signal` relay and the TURN credential endpoint are implemented; relaying needs two live peers plus TURN credentials.
