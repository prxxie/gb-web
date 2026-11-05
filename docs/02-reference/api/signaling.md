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
| `auth` | `token`, `mobileId?`, `displayName?`, `avatarId?` | First frame, within 5 s, else the socket closes with `4401`. The DO verifies `token` itself and binds the socket to the member whose `accountId`/`guestId` matches the token subject — identity never comes from the frame, and the bearer header cannot be used here because a browser cannot set one on a WebSocket |
| `signal` | `to` (playerId), `payload` (`{ sdp }` or `{ candidate }`) | Relayed verbatim to `to`; the DO never parses SDP, so a client cannot forge `from`. Max 8 KB per payload. A `to` that is not connected → `error peer-not-connected`, not `unsupported-message` |
| `team_assign` | `assignments: [{ playerId, team }]` | Host only (`not-host` on a peer). Lobby only (`invalid-state`). One frame carries the whole roster so a half-applied assignment cannot occur; it must leave both teams non-empty and equal in size, which `start_match` re-checks |
| `start_match` | — (no fields) | Host only; every slot filled, both teams non-empty and equal → `status: 'playing'`. The DO stamps `rulesetVersion` from the deployed build: a client cannot choose the version a match is ranked under |
| `snapshot_push` | `snapshot` (a `Snapshot`, ≤ 8 KB) | Host only; replaces `lastSnapshot` in DO storage and is relayed as `snapshot_state`. `snapshot.seq` must increase — a push at or below the stored `seq` is dropped silently, because a retransmit is not an error. `snapshot.hostGeneration` lets a peer discard a push from a superseded host |
| `match_end` | `winnerTeam`, `stats: [{ slot, accountId, damageDealt, shotsFired, hits, forfeited }]` | Host only, `playing` only. The DO validates the shape, sets `status: 'ended'`, broadcasts `room_state`, then calls `POST /api/v1/matches` ([matches.md](matches.md), `US-RANK-001`) and broadcasts `match_recorded`. A failed write answers the host with `error internal` and leaves the room `ended`; the host may retry, and `409 match-already-recorded` on that retry is a success from the client's point of view |
| `leave` | — | Removes the member; if it was the host, election follows |
| `ping` | `at` (client clock, ms) | Any time; the client sends one every 15 s. `pong` echoes `at` and adds the server's `now`, so the client measures RTT without trusting either clock. Above 10/s → `rate-limited`. Three consecutive misses move the member to `grace` (`US-ROOM-002` AC6) |

## Room socket — DO → client

| `t` | Fields | Meaning |
|-----|--------|---------|
| `room_state` | `RoomState` (as in [room-state.md](../data/room-state.md), without sockets), `you: { playerId, slot }` | Sent after successful `auth` and on every membership/team/host change |
| `peer_joined` | `playerId`, `slot`, `room` | Fast path for the lobby UI (also reflected in the next `room_state`) |
| `peer_left` | `playerId`, `reason`: `'left' \| 'grace' \| 'disconnected'` | Mirrors `connectionState`; the roster change itself arrives in the `room_state` that follows, so this frame stays small and carries no room |
| `snapshot_state` | `snapshot` (a `Snapshot`) | The one relay name: host → peers during play, and the replay a returning or promoted client receives. Discard a snapshot whose `hostGeneration` is below the current one |
| `signal` | `from` (playerId), `payload` | Relay of a peer's `signal` |
| `match_started` | `startedAt`, `seed`, `hostPlayerId`, `hostGeneration`, `rulesetVersion`, `assignments[]` (`{ playerId, slot, team, mobileId, accountId }`), `room` | Both peers and host switch to the match scene on this; `seed` makes weather and spawns reproducible on every client |
| `host_changed` | `hostPlayerId`, `hostGeneration`, `lastSnapshot`, `room` | Migration event; peers discard snapshots with a lower `hostGeneration` and resync from `room`. The graced member is not named here — `peer_left.reason` already told everyone who is in grace |
| `match_recorded` | `matchId`, `winnerTeam`, `ranked`, `ratings[]`, `players[]` | Broadcast to every member after the write succeeds, so the results screen can show the winner and the deltas without another request. `ranked` is false and `ratings` empty for a guest, an offline room, or a ruleset mismatch (`US-RANK-003`); `winnerTeam` is echoed from the host's `match_end` so a peer that missed the final snapshot still renders the result |
| `pong` | `at` (echo), `now` (server ms) | RTT display; `now - at` includes the round trip, so the client halves it |
| `error` | `code`, `detail` | Codes follow the [error catalogue](README.md#error-catalogue). The socket carries no `type` URI and no `requestId`: a WS frame has no problem document, and the request id lives in the Worker log line for the same frame |

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
| Message names and field sets (both directions) | no single owner yet: the frame types live in `apps/web/src/net/signaling.ts` (union types, no runtime check) and the DO accepts them loosely. `packages/core/src/protocol.ts` — a runtime parser shared by client and DO — does not exist; creating it and testing it in `packages/core/tests/protocol.test.ts` (TC-ROOM-126) is part of closing this contract |
| `auth` timeout, close codes, `accountId`/token mismatch | `apps/worker/tests/room-auth.test.ts` (TC-ROOM-121) |
| Relay isolation (`signal` reaches only `to`) | `apps/worker/tests/room-relay.test.ts` (TC-ROOM-050) |
| Host-only enforcement on `team_assign`, `start_match`, `snapshot_push`, `match_end` | `apps/worker/tests/room-host.test.ts` (TC-NET-044) |
| Election order, grace window, `hostGeneration` monotonicity | `apps/worker/tests/room-election.test.ts` (TC-ROOM-048) |
| Snapshot encoding ≤ 800 B at 8 players | `packages/core/tests/snapshot.test.ts` (TC-CORE-041) |
| Input rejection rules (wrong turn, duplicate, out of range) | `packages/core/tests/input.test.ts` (TC-CORE-045) |

Every oracle in this table is a file that must exist; § [Contract status](#contract-status-2026-11-05) says which
of them are written today.

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

## Contract status (2026-11-05)

This table is the agreement between this document and the code: `live` means the two agree today, `drift` names the
one change that makes them agree, and `planned` is work no story has claimed yet. The verification that produced it is
[`06-reports/status-2026-11-05-verification-pass.md`](../../06-reports/status-2026-11-05-verification-pass.md).

A row flips to `live` in the same commit that changes the code, and the oracle column is what a reviewer runs to
believe it.

| Message | Status | Code site today | Change required | Oracle |
|---------|--------|-----------------|-----------------|--------|
| `auth` (5 s, then `4401`) | live | `apps/worker/src/room-do.ts:318-343` | — | `apps/worker/tests/room-auth.test.ts` (not written) |
| `signal` relay | live | `apps/worker/src/room-do.ts:215-223` | answer `error peer-not-connected` instead of `unsupported-message` for an offline `to` | `apps/worker/tests/room-relay.test.ts` (not written) |
| `team_assign` (batched) | drift | `apps/worker/src/room-do.ts:225-240` | reject with `invalid-state` when `status != 'lobby'` and `teams-not-balanced` when the new roster would be unbalanced; the web client still sends the per-member shape `{t, playerId, team}` (`apps/web/src/net/signaling.ts:11`, sent from `apps/web/src/routes/LobbyPage.tsx:130`) while the DO reads `assignments`, so today every assignment silently no-ops | `apps/worker/tests/room-host.test.ts` (not written) |
| `start_match` | drift | `apps/worker/src/room-do.ts:242-268` | map `StartRejection` to the catalogue names (`invalid-state`, `room-not-full`, `not-enough-players`, `teams-not-balanced`) instead of leaking core-internal names | `apps/worker/tests/room-host.test.ts` (not written) |
| `start_match` (duplicate HTTP path) | dead | `apps/worker/src/room-do.ts:161-177` (`action=start`) | delete: it bypasses the socket guards and stamps `rulesetVersion: room.settings.mode`, which would rank a match under the wrong ruleset; it is also the only producer of `turnOrder`, so `StartOutcome.turnOrder` (`packages/core/src/room.ts:203`) goes with it |
| `snapshot_push` → `snapshot_state` | drift | `apps/worker/src/room-do.ts:269-287` | rename the peer relay frame from `snapshot` to `snapshot_state`, the same name the rejoin replay uses | `apps/worker/tests/room-relay.test.ts` (not written) |
| `host_changed` + election | drift | `apps/worker/src/room-do.ts:404-433` | the DO sends `room` too, which is what `apps/web/src/net/signaling.ts:28` is missing | `apps/worker/tests/room-election.test.ts` (not written) |
| `match_end` → `match_recorded` | drift | `apps/worker/src/room-do.ts:288-296` | read `winnerTeam`, call `POST /api/v1/matches`, broadcast `room_state` + `match_recorded`; delete the undocumented `match_ended` frame | `apps/worker/tests/matches.test.ts` (not written) |
| `peer_left.reason` | drift | `apps/worker/src/room-do.ts:130,303,384` | add `reason`, drop the extra `room` | `apps/worker/tests/room-election.test.ts` (not written) |
| `ping` / `pong` | drift | `apps/worker/src/room-do.ts:306-308` | echo the client's `at` and add `now`; count three misses into `grace` | `apps/worker/tests/room.test.ts` (not written) |
| `move`, `item`, `room_settings`, `loadout` (§ 9) | planned | absent | implement the four client frames and their host-only / lobby-only guards | `apps/worker/tests/room-settings.test.ts` (not written) |
| Snapshot payload additions (§ 9) | planned | `packages/core/src/snapshot.ts` has `seq`, `hostGeneration` only | add `queue`, `delays`, per-player `shield`/`energy`/`weaponSlot`/`items`/`bonus`, optional `modeState` and `terrain`, under the 800 B budget | `packages/core/tests/snapshot.test.ts` (TC-CORE-041) |

Client-side counterpart: `apps/web/src/net/signaling.ts` declares `room_settings` (§ 9) but never sends it, and its
`ClientMessage` lacks `move`, `item` and `loadout`; each is added in the story that owns the feature, not before.
