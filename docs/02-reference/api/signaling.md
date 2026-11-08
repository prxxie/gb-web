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
| `auth` | `token`, `mobileId?`, `displayName?`, `avatarId?` | First frame, within 5 s, else the socket closes with `4401`. The DO verifies `token` itself and binds the socket to the member whose `accountId`/`guestId` matches the token subject — identity never comes from the frame, and the bearer header cannot be used here because a browser cannot set one on a WebSocket. `mobileId` is a hint for the seat's first value: an id this build no longer ships is dropped by the room, not refused, so a cached client can still reconnect; a later pick travels in `loadout` (`US-ROOM-007` AC7) |
| `signal` | `to` (playerId), `payload` (`{ kind: 'offer' \| 'answer', sdp }` or `{ kind: 'candidate', candidate }`) | Relayed verbatim to `to`; the DO never parses SDP, so a client cannot forge `from`. `kind` is part of the payload because two `{ sdp }` frames are otherwise indistinguishable — an offer and an answer look the same. Max 8 KB per sdp, over that → `payload-too-large`. A `to` that is not connected → `error peer-not-connected`, not `unsupported-message`; signalling yourself → `bad-request` |
| `team_assign` | `assignments: [{ playerId, team }]` | Host only (`not-host` on a peer). Lobby only (`invalid-state`). One frame carries the whole roster so a half-applied assignment cannot occur. It enforces **capacity** only — no team may hold more than `maxPlayers / 2` (`bad-request`) — because the host must be able to seat the first player; **equality** is `start_match`'s rule |
| `start_match` | — (no fields) | Host only; every slot filled, both teams non-empty and equal → `status: 'playing'`. The DO stamps `rulesetVersion` from the deployed build: a client cannot choose the version a match is ranked under |
| `snapshot_push` | `snapshot` (packed `WireSnapshot`, ≤ 8 KB) | Host only; replaces `lastSnapshot` in DO storage and is relayed as `snapshot_state`. `snapshot.seq` must increase — a push at or below the stored `seq` is dropped silently, because a retransmit is not an error. `snapshot.hostGeneration` lets a peer discard a push from a superseded host |
| `match_end` | `winnerTeam`, `stats: [{ slot, damageDealt, shotsFired, hits, forfeited? }]` | Host only, `playing` only. The DO validates the shape, sets `status: 'ended'`, broadcasts `room_state`, then calls `POST /api/v1/matches` ([matches.md](matches.md), `US-RANK-001`) and broadcasts `match_recorded`. A failed write answers the host with `error internal` and leaves the room `ended`; the host may retry, and `409 match-already-recorded` on that retry is a success from the client's point of view |
| `chat` | `kind` (`quick_phrase` \| `emote`) and `id` — nothing else; a `text` key is refused (`bad-request`) | Any member, any status. Above **2/s** → `error rate-limited` and the socket closes `4429`; the DO keeps nothing of what was said |
| `leave` | — | Removes the member; if it was the host, the 20 s grace window runs out first and then election follows |
| `ping` | `at` (client clock, ms) | Any time; the client sends one every 15 s. `pong` echoes `at` and adds the server's `now`, so the client measures RTT without trusting either clock. Above 10/s → `rate-limited`. Three consecutive misses move the member to `grace` (`US-ROOM-002` AC6) |

## Room socket — DO → client

| `t` | Fields | Meaning |
|-----|--------|---------|
| `room_state` | `RoomState` (as in [room-state.md](../data/room-state.md), without sockets), `you: { playerId, slot }` | Sent after successful `auth` and on every membership/team/host change |
| `peer_joined` | `playerId`, `slot`, `room` | Fast path for the lobby UI (also reflected in the next `room_state`) |
| `peer_left` | `playerId`, `reason`: `'left' \| 'grace' \| 'disconnected'` | Mirrors `connectionState`; the roster change itself arrives in the `room_state` that follows, so this frame stays small and carries no room |
| `room_closed` | `reason`: `'expired' \| 'empty' \| 'closed'` | Last frame before the socket closes `4410`: the 24 h cap, an empty lobby's 60 s, or an abandonment sweep. Nothing follows it |
| `snapshot_state` | `snapshot` (packed `WireSnapshot`) | The one relay name: host → peers during play, and the replay a returning or promoted client receives. Discard a snapshot whose `hostGeneration` is below the current one |
| `signal` | `from` (playerId), `payload` | Relay of a peer's `signal` |
| `match_started` | `startedAt`, `seed`, `hostPlayerId`, `hostGeneration`, `rulesetVersion`, `assignments[]` (`{ playerId, slot, team, mobileId, accountId, loadout }`), `room` | Both peers and host switch to the match scene on this; `seed` makes weather and spawns reproducible on every client |
| `host_changed` | `hostPlayerId`, `hostGeneration`, `lastSnapshot`, `room` | Migration event; peers discard snapshots with a lower `hostGeneration` and resync from `room`. The promoted client adopts `lastSnapshot` (or restarts at `seq` 1 when it is `null`), takes the generation from this frame, and publishes once at `lastSnapshot.seq + 1` so the peers accept it (`US-NET-003` AC1/AC2). The graced member is not named here — `peer_left.reason` already told everyone who is in grace |
| `match_recorded` | `matchId`, `winnerTeam`, `ranked`, `rankedReason`, `ratings[]`, `players[]` | Broadcast to every member after the write succeeds, so the results screen can show the winner and the deltas without another request. `ranked` is false and `ratings` empty for a guest, an offline room, or a ruleset mismatch (`US-RANK-003`); `rankedReason` is the record's own answer (`guest` \| `abandoned` \| `ruleset_mismatch`) and `null` when nothing recorded it — the client must not derive it, since a client can never see its own ruleset drift; `winnerTeam` is echoed from the host's `match_end` so a peer that missed the final snapshot still renders the result |
| `pong` | `at` (echo), `now` (server ms) | RTT display; `now - at` includes the round trip, so the client halves it |
| `error` | `code`, `detail` | Codes follow the [error catalogue](README.md#error-catalogue). The socket carries no `type` URI and no `requestId`: a WS frame has no problem document. Every refusal also writes one structured log line — `request_id` (minted per refused frame), `room_code`, `code`, the authenticated `player_id`, the equivalent HTTP `status` — and never the payload or `detail`, which quotes field names from it (`NFR-24`, `US-NET-004` AC6) |

Close codes: `4401` unauthenticated, `4404` room not found, `4409` room full, `4410` room closed, `4429` rate limited,
`4408` heartbeat lost (three unanswered `ping`s — the client closes, the room then sees the socket close).

## Host election

On the host's socket closing: mark its seat `grace` (the 20 s window `US-ROOM-004` gives a phone that dropped), and
**promote at once** — authority over physics cannot wait 20 s (`US-ROOM-005` AC1, `NFR-06`). The promoted member is the
oldest `connected` peer still holding a socket (`joinedAt` ascending, `slot` ascending as tie-break); a peer that is
only `grace` is never promoted. Increment `hostGeneration`, broadcast `host_changed` with the stored `lastSnapshot`, and
give that member `role: 'host'`.

The promotion is then **verified**: five seconds later an alarm checks that the new host is actually live. If it is not,
the next candidate is tried exactly once; if that fails too, the room is `abandoned` (`US-ROOM-005` AC3, `TC-ROOM-169`).
A lobby is never abandoned this way — it simply waits for a member to be promoted by the same rule.

If the graced player returns within 20 s it re-joins with the same `accountId`/`guestId`, keeps its slot, and is a peer
(`NFR-07`): the seat was held, the role was not.

## Snapshot payload (`state` channel)

The wire carries the **packed** form (`WireSnapshot`, `packages/core/src/snapshot.ts`), not the object the game code
reads: keys are one or two characters because this travels ten times a second over an unreliable channel, and `packs`
means the players are one number array each.

| Field | Type | Meaning |
|-------|------|---------|
| `s` | integer | `seq`, monotonic per host generation |
| `g` | integer | `hostGeneration` |
| `t` | `[number, activeSlot, deadlineAt, round]` | Whose turn, which round, and when it ends (`turnDurationMs` = 20 s) |
| `w` | `[magnitude, sector]` | Wind; the direction in degrees is `sector × 30` |
| `p` | `[[slot, hp, shield, energy, x, y, facing, delay, eliminated, weaponSlot]]` | One row per seat, in slot order. Positions quantised to 0.1 world units, HP 0–maxHp, `eliminated` as `0`/`1` |
| `j` | `[x, y, carriedBy]…` | Jewels, flat; `carriedBy` is `-1` when nobody carries it |
| `sc` | `[scoreA, scoreB]` | Team scores |
| `st` | `"playing" \| "ended"` | Match status |
| `m` | RLE string, optional | The terrain mask — **only** on the frame that follows a carve |
| `wt` | `"A" \| "B" \| null` | Winner, or null |
| `v` | string, optional | `rulesetVersion` |
| `at` | `"A" \| "B"`, optional | Which team is acting; omitted when it is `A` |

Both directions use this form: `snapshot_push` (host → DO) and `snapshot_state` (DO → peers, and the rejoin replay).
A client that reads one unpacks it with `unpackSnapshot`/`readSnapshot` (`apps/web/src/net/input.ts`); the DO expands
before it stores, so `lastSnapshot` and the leaderboard replay are ordinary objects.

Packing and quantisation keep an 8-player snapshot at **380 B measured** (2026-11-07, `TC-NET-905`), well under the
800 B budget (`NFR-04`, TC-CORE-041). The named-field form weighed 1 319 B and never shipped on this path.

**The mask is the exception, and it is one frame per carve, not a channel.** A snapshot that carries `m` is
sent once by the host after a shot that carved the ground (`US-CORE-006` AC4) so every peer resolves the next hit
against the same surface; it measures 2 256 B on `map-01` and 5 537 B on `map-06` (1 001 samples at
`terrainStep 2`), inside the 8 KB per-frame cap and outside the 800 B state budget, which describes the
10–20 Hz stream. `TC-CORE-041` asserts both halves: no mask by default, and a masked snapshot under the cap.

## Control channel messages

| `t` | Fields | Meaning |
|-----|--------|---------|
| `input` | `turnNumber`, `slot`, `kind` (`fire` \| `skip`), `angle`, `force`, `weaponSlot` (`0`\|`1`\|`2`, fire only) | ~24 B. Host rejects an input whose `turnNumber`/`slot` is not current, or a second input in the same turn. `slot` is attributed by the host from the sender's member, not trusted from the frame |
| `chat` | `from`, `kind` (`quick_phrase` \| `emote`), `id` | The room socket's `chat`, relayed to every other member as the id it arrived with — the receiver translates it in its own locale (`US-MATCH-004` AC5). The budget in § Budgets is what limits it — the room does not queue, store or reorder |
| `turn_end` | `turnNumber`, `nextSlot` | Host → peers; keeps the HUD in step even if a snapshot is lost |

Aliasing: the host applies all inputs for a turn at the last-received moment (no rollback netcode in v1); peers predict
their own projectile locally and reconcile to the next snapshot.

## Budgets

| Path | Rate | Max size | Note |
|------|------|----------|------|
| `signal` | ≤ 20/s per socket | 8 KB | ICE candidates are small; SDP can be ~2–4 KB |
| `ping` | ≤ 10/s per socket | 64 B | Above it the socket is closed `4429` |
| `chat` | ≤ 2/s per socket | 256 B | Above it the socket is closed `4429` |
| `control` (`loadout`, `room_settings`, `team_assign`) | ≤ 20/s per socket | 1 KB | Each one persists and broadcasts the room, so they share one bucket. The budget sits far above a hand (one frame per tap), because crossing any budget closes the socket with `4429` — which a client reads as fatal, so a normal tap sequence must never reach it |
| `snapshot_push` | ≤ 20/s | 8 KB | Only the latest is stored |
| `state` (per peer) | 10–20/s | 800 B | Host → each peer; a mask-bearing snapshot (one per carve) is capped at 8 KB |
| Host uplink at 8 players | 15 Hz | — | ≈ 31 KB/s (7 peers × ~300 B), `OQ-24` |

## Oracle

| Contract | Checked by |
|----------|-----------|
| Message names and field sets (both directions) | `packages/core/src/protocol.ts` — one runtime parser shared by the client and the DO; `packages/core/tests/protocol.test.ts` (TC-ROOM-126, 13 cases) |
| `auth` timeout, close codes, `accountId`/token mismatch | `apps/worker/tests/room-auth.test.ts` (TC-ROOM-121) |
| Relay isolation (`signal` reaches only `to`) | `apps/worker/tests/room-relay.test.ts` (TC-ROOM-050) |
| Host-only enforcement on `team_assign`, `start_match`, `snapshot_push`, `match_end` | `apps/worker/tests/room-host.test.ts` (TC-NET-044) |
| Election order, grace window, `hostGeneration` monotonicity | `apps/worker/tests/room-election.test.ts` (TC-ROOM-048) |
| Snapshot encoding ≤ 800 B at 8 players, no mask by default, mask-bearing frame ≤ 8 KB | `packages/core/tests/snapshot.test.ts` (TC-CORE-041) |
| Input rejection rules (wrong turn, duplicate, out of range) | `packages/core/tests/turn-queue.test.ts` (TC-CORE-045), `packages/core/tests/protocol.test.ts` (frame shape) |

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
| `room_settings` | `{ t:'room_settings', mode:ModeId, mapId:string, maxPlayers?, isPrivate? }` | host only; lobby only; `maxPlayers` may not drop below the members already seated (`invalid-state`) | rejected for members (`TC-NET-067`) | `TC-ROOM-151` |
| `loadout` | `{ t:'loadout', items?:Array<{id:string,qty:number}>, mobileId?:string }` | any member, lobby only | each half is written only when present — omitting `items` keeps the item list, omitting `mobileId` keeps the mobile — and a frame carrying neither is `bad-request`; total quantity ≤ 11; `mobileId` must be a shipped mobile (`mbl-01`…`mbl-20`), duplicates across members allowed | `TC-MATCH-006`, `TC-ROOM-708` |

`input` (`fire`) gains `weaponSlot: 0 | 1 | 2`; `skip`, `emote` and `quick_phrase` are unchanged.

### Snapshot additions

`turn` gains `queue: number[]` and `delays: number[]`; each `players[]` entry gains `shield`, `energy` and `weaponSlot`
(the slot that seat last fired with — the host tracks it from accepted `input` frames, it is not a property of the
player); `sc` carries the two team scores, `j` the jewel triples (`x, y, carriedBy`) and `at` the tag flag (omitted
while it is A); `v` carries `rulesetVersion`, so a peer can refuse to rank a match it did not play under; a new
optional `terrain` carries the RLE mask after a carve. `applySnapshot` restores all of it — scores, jewels, the tag
flag and the version — so a peer's result screen and jewel HUD match the host's (`TC-CORE-042`). The state budget
stays **≤800 B at eight players** (`NFR-04`) and a mask-bearing snapshot stays under the **8 KB** frame cap; both
halves are asserted by `TC-CORE-041`.

## Contract status (2026-11-05)

This table is the agreement between this document and the code: `live` means the two agree today, `drift` names the
one change that makes them agree, and `planned` is work no story has claimed yet. The verification that produced it is
[`06-reports/status-2026-11-05-verification-pass.md`](../../06-reports/status-2026-11-05-verification-pass.md).

A row flips to `live` in the same commit that changes the code, and the oracle column is what a reviewer runs to
believe it.

| Message | Status | Code site today | Change required | Oracle |
|---------|--------|-----------------|-----------------|--------|
| `auth` (5 s, then `4401`) | live | `apps/worker/src/room-do.ts:318-343` | — | `apps/worker/tests/room-auth.test.ts` |
| `signal` relay | live | `apps/worker/src/room-do.ts` `relaySignal` | — an offline `to` is `peer-not-connected` and a self-signal is `bad-request` | `apps/worker/tests/room-relay.test.ts` |
| `team_assign` (batched) | live | `apps/worker/src/room-do.ts` `assignTeams` | — the lobby sends the whole roster (`apps/web/src/routes/LobbyPage.tsx`) and `parseClientFrame` refuses the old per-member shape | `apps/worker/tests/room-host.test.ts` |
| `start_match` | live | `apps/worker/src/room-do.ts` `startMatch` + `START_REJECTIONS` | — core refusals map to `invalid-state` / `room-not-full` / `not-enough-players` / `teams-not-balanced` | `apps/worker/tests/room-host.test.ts` |
| `start_match` (duplicate HTTP path) | deleted | was `apps/worker/src/room-do.ts` (`action=start`); `action=settings` went with it | both bypassed the socket guards, and the start path stamped `rulesetVersion: room.settings.mode`. `StartOutcome.turnOrder` (`packages/core/src/room.ts:203`) is now unused | `apps/worker/tests/room-host.test.ts` |
| `snapshot_push` → `snapshot_state` | live | `apps/worker/src/room-do.ts` `pushSnapshot` | — relay and rejoin replay share one name; a stale `seq` is dropped silently | `apps/worker/tests/room-relay.test.ts` |
| `host_changed` + election | live | `apps/worker/src/room-do.ts` `electIfHostGone` / `announceHostChange` | — one election path, `hostGeneration` bumped once per change | `apps/worker/tests/room-election.test.ts` |
| `match_end` → `match_recorded` | live | `apps/worker/src/room-do.ts` `endMatch` / `recordMatch` | — the DO posts to the Worker with the host's own token, a guest room broadcasts `ranked: false`, and `409` counts as success | `apps/worker/tests/matches.test.ts` |
| `peer_left.reason` | live | `apps/worker/src/room-do.ts` (`left` on `leave`, `grace` on close and heartbeat timeout) | — the roster change arrives in the following `room_state` | `apps/worker/tests/room-election.test.ts` |
| `ping` / `pong` | live | `apps/worker/src/room-do.ts` (`ping` case + `sweepSilentSockets`) | — `pong` echoes `at` and adds `now`; 45 s of silence moves the member to `grace` | `apps/worker/tests/room.test.ts` |
| `move`, `item`, `room_settings`, `loadout` (§ 9) | live | `apps/worker/src/room-do.ts` (`applySettings`, `setLoadout`, `relayInput`) | — `move`/`item` are relayed to the host, which validates them; the DO only refuses a non-playing room and a missing host socket | `apps/worker/tests/room-settings.test.ts` |
| Snapshot payload additions (§ 9) | live, except `queue`/`delays`/`items`/`bonus`/`modeState` | `packages/core/src/snapshot.ts` carries `seq`, `hostGeneration`, per-player `shield`/`energy`/`weaponSlot` and the optional `terrain` mask | add `turn.queue`, `turn.delays`, per-player `items`/`bonus` and optional `modeState`, under the 800 B state budget; the mask rides only a carve frame, under the 8 KB cap | `packages/core/tests/snapshot.test.ts` (TC-CORE-041) |

Client-side counterpart: `apps/web/src/net/signaling.ts` no longer declares its own frame types — it re-exports
`ClientFrame`/`ServerFrame` from `protocol.ts`, so a rename on one side cannot leave the other behind. The DO parses
`room_settings`, `loadout`, `move` and `item`; the components that send them belong to `US-MATCH-005`.
