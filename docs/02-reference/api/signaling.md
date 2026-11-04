# API — signaling and the peer wire protocol

Three surfaces, all versioned as `protocolVersion: 1`:

1. **Room socket** — client ↔ Durable Object over `wss://…/api/v1/rooms/{code}/ws`. Presence, team assignment, WebRTC
   exchange, host migration. Never carries gameplay frames.
2. **Control channel** — peer ↔ host, reliable and ordered. Inputs, emotes, quick phrases.
3. **State channel** — host → peers, unreliable and unordered. Snapshots only.

[ADR-0004](../../04-decisions/adr/ADR-0004-gameplay-topology-p2p.md) explains why the host relays instead of a full mesh.

## Envelope

Every message is JSON, one per frame: `{ "t": "<type>", ...fields }`. Unknown `t` on the room socket →
`error { code: "unsupported_message" }`; the socket stays open. Binary framing is a v2 concern — JSON at 10–20 Hz fits
the budget (`NFR-04`), and readability is worth more at this stage.

## Room socket — client → DO

| `t` | Fields | Rule |
|-----|--------|------|
| `auth` | `token`, `displayName?`, `avatarId?`, `accountId?`, `guestId?` | First frame, within 5 s, else the socket closes with `4401`. The token is the session token; `accountId` must match the token's `sub` when `kind = 'account'` |
| `signal` | `to` (playerId), `payload` (`{ sdp }` or `{ candidate }`) | Relayed verbatim to `to`; the DO never parses SDP. Max 8 KB per payload |
| `team_assign` | `assignments: [{ playerId, team }]` | Host only (`403 not-host`). Lobby only; must produce equal team sizes at `start_match` |
| `start_match` | `rulesetVersion` | Host only; all members `connected`; both teams non-empty and equal → `status: 'playing'` |
| `snapshot_push` | `seq`, `hostGeneration`, `payload` (snapshot object, ≤ 8 KB) | Host only; replaces `lastSnapshot` in DO storage; used for migration. `seq` must increase |
| `match_end` | `winnerTeam`, `stats: [{ slot, accountId, damageDealt, shotsFired, hits, forfeited }]` | Host only; DO validates shape, sets `status: 'ended'`, replies `match_recorded { matchId }` after the Worker call succeeds |
| `leave` | — | Removes the member; if it was the host, election follows |
| `ping` | `at` | Any time; 1/s expected, 10/s tolerated, above → `429 rate_limited` |

## Room socket — DO → client

| `t` | Fields | Meaning |
|-----|--------|---------|
| `room_state` | `RoomState` (as in [room-state.md](../data/room-state.md), without sockets), `you: { playerId, slot }` | Sent after successful `auth` and on every membership/team/host change |
| `peer_joined` | `playerId`, `slot`, `displayName`, `avatarId` | Fast path for the lobby UI (also reflected in the next `room_state`) |
| `peer_left` | `playerId`, `reason`: `'left' \| 'grace' \| 'disconnected'` | Mirrors `connectionState` |
| `signal` | `from` (playerId), `payload` | Relay of a peer's `signal` |
| `match_started` | `startedAt`, `hostPlayerId`, `hostGeneration`, `rulesetVersion`, `assignments[]` | Both peers and host switch to the match scene on this |
| `host_changed` | `hostPlayerId`, `hostGeneration`, `lastSnapshot: { seq, payload } \| null`, `gracedPlayerId` | Migration event; peers discard snapshots with a lower `hostGeneration` |
| `match_recorded` | `matchId`, `ranked`, `ratings[]` | Host's confirmation; broadcast to members so the results screen can show deltas |
| `pong` | `at` | Echoes the client's `at` + server `now` for RTT display |
| `error` | `code`, `type`, `detail`, `requestId` | Codes follow the [error catalogue](README.md#error-catalogue); `type` is the same URI suffix |

Close codes: `4401` unauthenticated, `4404` room not found, `4409` room full, `4410` room closed, `4429` rate limited.

## Host election

On the host's socket closing: mark it `grace`, start the 20 s grace alarm, and immediately elect the **longest-connected
connected peer** (`joinedAt` ascending, `slot` ascending as tie-break). Increment `hostGeneration`, broadcast
`host_changed` with the stored `lastSnapshot`, and promote that member to `role: 'host'`. Election is skipped when no
peer is `connected` (room → `abandoned`) or when the room is in `lobby` (the room simply waits for a new host to join
and claim by `POST /rooms`-less path: the earliest joiner becomes host automatically).

If the graced player returns within 20 s it re-joins with the same `accountId`/`guestId`, keeps its slot, and is a peer
(`NFR-07`).

## Snapshot payload (`state` channel)

| Field | Type | Meaning |
|-------|------|---------|
| `seq` | integer | Monotonic per host generation |
| `turn` | `{ activeSlot, number, round, deadlineAt }` | Whose turn, which round, and when it ends (`turnDurationMs` = 20 s) |
| `players` | `[{ slot, hp, x, y, facing, eliminated }]` | Positions quantised to 0.1 world units, HP 0–100 |
| `projectiles` | `[{ id, x, y, vx, vy }]` | Normally **empty**: a shot resolves at fire time (`US-CORE-001`), so the snapshot carries the result, not a shell in flight; the array exists for the cluster/mine classes that outlive a tick |
| `weather` | `{ wind: { magnitude, directionDeg, sector }, rolledAtRound }` | The round's weather; constant until `turn.round` changes |

Quantisation keeps an 8-player snapshot at ~300–600 B, under the 800 B budget (`NFR-04`, TC-CORE-041).

## Control channel messages

| `t` | Fields | Meaning |
|-----|--------|---------|
| `input` | `turnNumber`, `slot`, `kind` (`fire` \| `skip`), `angle`, `force` | ~24 B. Host rejects an input whose `turnNumber`/`slot` is not current, or a second input in the same turn |
| `chat` | `kind` (`quick_phrase` \| `emote`), `id` | Preset ids only; host rate-limits to 1 per 2 s per player and drops excess silently |
| `turn_end` | `turnNumber`, `nextSlot` | Host → peers; keeps the HUD in step even if a snapshot is lost |

Aliasing: the host applies all inputs for a turn at the last-received moment (no rollback netcode in v1); peers predict
their own projectile locally and reconcile to the next snapshot.

## Budgets

| Path | Rate | Max size | Note |
|------|------|----------|------|
| `signal` | bursty, ≤ 20 frames per connection | 8 KB | ICE candidates are small; SDP can be ~2–4 KB |
| `snapshot_push` | ≤ 20/s | 8 KB | Only the latest is stored |
| `state` (per peer) | 10–20/s | 800 B | Host → each peer |
| `control` | ≤ 5/s | 256 B | Input + chat |
| Host uplink at 8 players | 15 Hz | — | ≈ 31 KB/s (7 peers × ~300 B), `OQ-24` |

## Oracle

| Contract | Checked by |
|----------|-----------|
| Message names and field sets (both directions) | `packages/core/src/protocol.ts` schemas + `tests/core/protocol.test.ts` (TC-ROOM-126) |
| `auth` timeout, close codes, `accountId`/token mismatch | `tests/worker/room-auth.test.ts` (TC-ROOM-121) |
| Relay isolation (`signal` reaches only `to`) | `tests/worker/room-relay.test.ts` (TC-ROOM-050) |
| Host-only enforcement on `team_assign`, `start_match`, `snapshot_push`, `match_end` | `tests/worker/room-host.test.ts` (TC-NET-044) |
| Election order, grace window, `hostGeneration` monotonicity | `tests/worker/room-election.test.ts` (TC-ROOM-048) |
| Snapshot encoding ≤ 800 B at 8 players | `tests/core/snapshot.test.ts` (TC-CORE-041) |
| Input rejection rules (wrong turn, duplicate, out of range) | `tests/core/input.test.ts` (TC-CORE-045) |

## 9. GunBound rule-set extensions

Added by `CR-2026-11-04-gb-gameplay-fidelity` (`OQ-36`, package B). They extend the envelope in § 3; `protocolVersion`
stays `1` because no deployed client exists yet.

### Client → DO additions

| Message | Payload | Sender | Notes | Oracle |
|---|---|---|---|---|
| `move` | `{ t:'move', direction:0\|1, run:boolean }` | active player | server-side clamp against energy/incline is not possible (no physics on the Worker) — the host validates | `TC-CORE-904` |
| `item` | `{ t:'item', id:string }` | active player | host validates ownership before applying | `TC-CORE-906` |
| `room_settings` | `{ t:'room_settings', mode:ModeId, mapId:string }` | host only | rejected for members (`TC-NET-067`) | `TC-ROOM-151` |
| `loadout` | `{ t:'loadout', items:Array<{id:string,qty:number}> }` | any member, lobby only | total quantity ≤ 11 | `TC-MATCH-006` |

`input` (`fire`) gains `weaponSlot: 0 | 1 | 2`; `skip`, `emote` and `quick_phrase` are unchanged.

### Snapshot additions

`turn` gains `queue: number[]` and `delays: number[]`; each `players[]` entry gains `shield`, `energy`, `weaponSlot`,
`items: Array<{id:string,qty:number}>` and `bonus`; a new optional `modeState` carries `jewels[]`, `score` or
`activeTeam`; a new optional `terrain` carries the RLE delta of carved ground. The budget stays **≤800 B at eight
players** (`NFR-04`), asserted by `TC-CORE-041`.
