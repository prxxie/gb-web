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
| `isPrivate` | boolean | no | `false` default; private rooms are omitted from the public directory and remain joinable by code |

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

## GET /rooms

Returns a bounded snapshot of public rooms for the main-menu browser. The list is deliberately not live: the client
loads it when the panel opens, when a filter changes or when the player refreshes, and never polls.

Auth: none. Cache: `Cache-Control: public, max-age=5`.

Query:

| Field | Type | Required | Rule |
|---|---|---|---|
| `status` | `waiting \| playing` | no | Omitted means all public rooms; `lobby` is projected as `waiting`; ended and abandoned rooms are absent |
| `limit` | integer | no | Default 20, minimum 1, maximum 50 |
| `cursor` | opaque string | no | Keyset cursor; an invalid or truncated value is `400 bad-request` |

The fixed order is `updated_at DESC, room_code ASC`. `updatedAt` is returned as ISO-8601 UTC. A row is visible only
when `is_private = 0` and `expires_at > now`.

Response `200`:

```json
{
  "rooms": [
    {
      "roomCode": "K7M2QX",
      "status": "waiting",
      "mode": "solo",
      "mapId": "map-01",
      "seated": 2,
      "maxPlayers": 4,
      "joinable": true,
      "updatedAt": "2026-11-14T09:15:00Z"
    }
  ],
  "nextCursor": null,
  "request_id": "uuid"
}
```

`joinable` is true only while the room is `waiting` and `seated < maxPlayers`. A `playing` room is view-only because v1
has no spectator or late-join flow. Selecting a waiting room enters `POST /rooms/{code}/join`; the Room DO is then the
authority and may refuse a stale row with `404`, `409` or `410`.

The response contains no host or player names, account ids, guest ids, player ids, IP addresses, tokens or socket data.

Errors: `400 bad-request` (invalid cursor), `422 validation` (unknown status or out-of-range limit).

The directory is written by the Room DO on create, join, leave, start and close. Heartbeat, chat and snapshot traffic
never writes it. A waiting row expires 10 minutes after its last directory lifecycle write (`updated_at + 10 min`);
a playing row expires at `matchStartedAt + 24 h`; a closed room deletes its row.

## POST /rooms/{code}/join

Seats a second player in an existing room. The roster lives in the Durable Object, so this is the only way into
someone else's room; the socket that follows authenticates with the returned `playerId`'s session.

Request: `{ displayName, mobileId, avatarId }` (all required — a seat needs a name to render in the roster).

Response `200`: `{ roomCode, playerId, wsUrl, maxPlayers }`.

Errors: `404 room-not-found` (unknown or swept code), `409 room-full`, `410 room-closed` (match already started),
`422 validation`, `401 unauthenticated`. A guest joins with its guest session (`OQ-05`) and is unranked.

The call is **idempotent for one session**: a seat is identified by the account or guest the token names, so a page
that mounts twice (React's StrictMode) or a lobby that reloads answers `200` with the seat it already owns instead of
taking a second one. A code nobody minted is `404 room-not-found`: the Durable Object is created before it is named, and the
first join is what names it.

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
The Worker returns Cloudflare's own `iceServers` entries: a browser needs `urls` + `username` + `credential` already
assembled as `RTCIceServer`, and re-shaping them on the Worker was duplication the client then had to undo. It always
prepends its own STUN entry (`apps/worker/src/routes/rooms.ts:202`) and appends whatever Cloudflare returns, so a
response that already contains `stun:` yields a duplicate entry the client must tolerate.

Response `200`:

| Field | Type | Meaning |
|-------|------|---------|
| `iceServers` | `RTCIceServer[]` | Always at least the STUN entry `stun:stun.cloudflare.com:3478`; `turn:`/`turns:` entries follow when a TURN key is configured |
| `ttlSeconds` | integer | `3600` (`NFR-10`) |
| `turn` | boolean | `false` when no `TURN_KEY_ID`/`TURN_KEY_API_TOKEN` is set: the response is then STUN-only and still `200`, so a one-machine session keeps working and only NAT traversal degrades |

Rules: never cached beyond the session, never persisted, never logged (`NFR-10`, `NFR-12`); the TURN secret is a Worker
secret, never in the bundle. Errors: `401 unauthenticated`, `429 rate-limited` (20/min per session).

## Ice servers (client-side, no endpoint)

The client builds `RTCConfiguration.iceServers` from exactly this response and rejects any `url` that is not
`stun:`/`turn:`/`turns:` — `ws://`, `http://` or a bare host is a configuration error (`NFR-09`, TC-ROOM-052).
Neither the TURN username nor the credential is ever logged, and `turn: false` is the one condition a client may
report to the player ("no relay available") instead of failing the connection outright.

## Oracle

| Contract | Checked by |
|----------|-----------|
| `POST /rooms` accepts only `2,4,6,8`; returns a code matching the alphabet | `apps/worker/tests/rooms.test.ts` (TC-ROOM-071) |
| Rate limits and `Retry-After` | `apps/worker/tests/rooms.test.ts` (TC-ROOM-072) |
| `GET /rooms/{code}` leaks no identity fields | `apps/worker/tests/rooms.test.ts` — schema whitelist assertion (TC-AUTH-075) |
| `GET /rooms` returns public waiting/playing rows only, in the fixed order, with no identity or socket fields | `apps/worker/tests/rooms.test.ts` (TC-ROOM-722, TC-ROOM-727) |
| `GET /rooms` page boundaries are stable and an invalid cursor is `400` | `apps/worker/tests/rooms.test.ts` (TC-ROOM-723) |
| Directory rows follow create/join/leave/start/close and expire without heartbeat writes | `apps/worker/tests/room-directory.test.ts` (TC-ROOM-724) |
| TURN credential TTL and absence from logs | `apps/worker/tests/turn.test.ts` (TC-ROOM-051) |
| SDP is relayed byte-identical and never stored | `apps/worker/tests/room-relay.test.ts` (TC-ROOM-050) |
