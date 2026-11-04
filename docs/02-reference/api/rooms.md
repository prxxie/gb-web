# API — rooms and TURN

A room is created through the Worker (which reserves the code and names the Durable Object) and then joined over the
WebSocket described in [signaling.md](signaling.md). Room state itself lives in the DO ([room-state.md](../data/room-state.md)).

## POST /rooms

Creates a room and returns its code. The caller becomes the room's first member **when it opens the socket**, not here —
a created-but-unjoined room is swept after 10 minutes (`data/room-state.md`).

Auth: session token. Rate limit: `NFR-25` (10/min per IP, 30/h per account).

Request body:

| Field | Type | Required | Rule |
|-------|------|----------|------|
| `maxPlayers` | integer | yes | One of `2, 4, 6, 8` (even: two equal teams) |
| `isPrivate` | boolean | no | `false` default; private rooms are not listed anywhere, and v1 has no public list — the field exists for the future |

```json
{ "maxPlayers": 4 }
```

Response `201`:

| Field | Type | Meaning |
|-------|------|---------|
| `roomCode` | string | `^[A-HJ-NP-Z2-9]{6}$` |
| `playerId` | string | The host's own seat id inside this room — the client stores it and never invents one |
| `maxPlayers` | integer | Echo |
| `wsUrl` | string | Absolute `wss://` URL to open, including the room code |
| `expiresAt` | string | `createdAt + 10 min` if nobody joins |

Errors: `422 validation` (`maxPlayers` not in the set), `401 unauthenticated`, `429 rate-limited`.
Code exhaustion (all 32⁶ codes in use) is not a real scenario; on a collision the Worker retries 5 times, then `500`.

## POST /rooms/{code}/join

Seats a second player in an existing room. The roster lives in the Durable Object, so this is the only way into
someone else's room; the socket that follows authenticates with the returned `playerId`'s session.

Request: `{ displayName, mobileId, avatarId }` (all required — a seat needs a name to render in the roster).

Response `200`: `{ roomCode, playerId, wsUrl, maxPlayers }`.

Errors: `404 room-not-found` (unknown or swept code), `409 room-full`, `410 room-closed` (match already started),
`422 validation`, `401 unauthenticated`. A guest joins with its guest session (`OQ-05`) and is unranked.

## GET /rooms/{code}

Public joinability preview so the join screen can show a good error before opening a socket.

Response `200`:

| Field | Type | Meaning |
|-------|------|---------|
| `roomCode` | string | Echo |
| `status` | enum | `lobby` \| `playing` \| `ended` \| `abandoned` |
| `maxPlayers` | integer | Capacity |
| `playerCount` | integer | Current members |
| `joinable` | boolean | `status = 'lobby' && playerCount < maxPlayers` |
| `hostDisplayName` | string \| null | Host's public name, `null` before the host joins |
| `settings` | object | `{ maxPlayers, mode, mapId, isPrivate }` so the join screen can show what it is joining |
| `joined` | integer | Alias of `playerCount`, kept for the lobby HUD |

Errors: `404 room-not-found` (unknown or swept code), `410 room-closed` (ended/abandoned).
This response carries no account ids, no IPs and no guest ids.

## GET /turn-credentials

Mints short-lived TURN credentials for this session. Called right before the first peer connection is established.

Response `200`:

| Field | Type | Meaning |
|-------|------|---------|
| `urls` | string[] | `stun:`, `turn:` and `turns:` URLs, in that order |
| `username` | string | Ephemeral username (`<expiryEpoch>:<sessionId>`) |
| `credential` | string | HMAC of `username` with the TURN secret |
| `ttlSeconds` | integer | `3600` (`NFR-10`) |

Rules: never cached beyond the session, never persisted, never logged (`NFR-10`, `NFR-12`); the TURN secret is a Worker
secret, never in the bundle. Errors: `401 unauthenticated`, `429 rate-limited` (20/min per session).

## Ice servers (client-side, no endpoint)

The client builds `RTCConfiguration.iceServers` from exactly this response and rejects any `url` that is not
`stun:`/`turn:`/`turns:` — `ws://`, `http://` or a bare host is a configuration error (`NFR-09`, TC-ROOM-052).

## Oracle

| Contract | Checked by |
|----------|-----------|
| `POST /rooms` accepts only `2,4,6,8`; returns a code matching the alphabet | `tests/worker/rooms.test.ts` (TC-ROOM-071) |
| Rate limits and `Retry-After` | `tests/worker/rooms.test.ts` (TC-ROOM-072) |
| `GET /rooms/{code}` leaks no identity fields | `tests/worker/rooms.test.ts` — schema whitelist assertion (TC-AUTH-075) |
| TURN credential TTL and absence from logs | `tests/worker/turn.test.ts` (TC-ROOM-051) |
| Client rejects non-TLS ICE URLs | `tests/core/ice.test.ts` (TC-ROOM-050) |
