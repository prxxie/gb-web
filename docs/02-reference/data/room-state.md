# Data — room state (Durable Object)

Room state is **ephemeral**: it lives in the `Room` Durable Object (`env.ROOM.idFromName(roomCode)`) and is deleted when
the room ends. It is never written to D1 — only the finished `match_record` is ([ADR-0003](../../04-decisions/adr/ADR-0003-data-d1.md)).

## `RoomState`

| Field | Type | Description |
|-------|------|-------------|
| `roomCode` | `string` | 6 chars, `^[A-HJ-NP-Z2-9]{6}$`; frozen at creation |
| `status` | `'lobby' \| 'playing' \| 'ended' \| 'abandoned'` | Lifecycle in `workflow-state-machine.md` |
| `hostPlayerId` | `string \| null` | Current host; `null` only between a loss and the election |
| `hostGeneration` | `number` | Increments on every migration; peers reject snapshots from an older generation |
| `maxPlayers` | `2 \| 4 \| 6 \| 8` | Chosen by the host at creation; even numbers only |
| `teamSizeLimit` | `number` | `maxPlayers / 2`; the host may leave slots empty but teams must be equal at start |
| `members` | `Member[]` | Ordered by `slot`, 0-based, length ≤ `maxPlayers` |
| `createdAt` | `number` (epoch ms) | Creation time |
| `lastActivityAt` | `number` | Updated on any message; drives the idle sweep |
| `matchStartedAt` | `number \| null` | Set on `match_started` |
| `lastSnapshot` | `{ seq, hostGeneration, payload } \| null` | Latest snapshot the host pushed, for migration; ≤ 8 KB, replaced not appended |
| `sweepAlarmAt` | `number \| null` | Alarm for the idle/grace timeouts |

## `Member`

| Field | Type | Description |
|-------|------|-------------|
| `playerId` | `string` | Per-connection uuid minted on `join` |
| `accountId` | `string \| null` | Registered account, `null` for a guest |
| `guestId` | `string \| null` | Client-side guest id, `null` for a registered player |
| `displayName` | `string` | Snapshot of the name at join time (2–16 chars) |
| `avatarId` | `string` | Snapshot at join time |
| `slot` | `number` | 0…`maxPlayers-1`, assigned at join, stable for the room |
| `team` | `'A' \| 'B' \| null` | Assigned by the host; `null` until assigned |
| `role` | `'host' \| 'peer'` | Mirrors `hostPlayerId` |
| `connectionState` | `'connected' \| 'grace' \| 'disconnected'` | `grace` for 20 s after a socket closes (`NFR-07`) |
| `joinedAt` | `number` | Join order; tie-break for host election |
| `socket` | `WebSocket` (in memory) | Never persisted |

## Storage and limits

| Concern | Rule |
|---------|------|
| Persistence | `ctx.storage` keeps `roomCode`, `status`, `hostPlayerId`, `hostGeneration`, `members` (without sockets) and `lastSnapshot`, so a DO eviction mid-match does not lose the room. `sockets` stay in memory. |
| Size | `lastSnapshot` ≤ 8 KB; a larger payload is rejected with `snapshot_too_large` and the host keeps the previous one |
| Idle sweep | An alarm at `lastActivityAt + 10 min`; in `lobby` it deletes the room, in `playing` it marks `abandoned` |
| Grace timer | An alarm at socket loss + 20 s; on fire, `connectionState = 'disconnected'` and the host is migrated if the lost socket was the host |
| Room lifetime | A room with no members for 60 s is deleted; a room never survives more than 24 h |
| Slot reuse | A freed slot is reused by the next joiner only in `lobby`; in `playing` a reconnect returns to its own slot by `accountId`/`guestId` |
| Concurrency | All writes go through the DO's single-threaded handler; no locks, no `await` between read and write of `members` |

## Relation to D1

| Room fact | Where it survives |
|-----------|-------------------|
| Who played, teams, slots, damage, result | `match_player` (submitted at `match_end`) |
| Winner, duration, ruleset | `match_record` |
| Rating effect | `rating_history` |
| Everything else (transient membership, ICE, snapshots) | Nowhere — deliberately dropped |

## Oracle

| Contract | Checked by |
|----------|-----------|
| `RoomState`/`Member` field names and enums | `packages/core/src/protocol.ts` + `tests/core/protocol.test.ts` type-level assertions (TC-ROOM-147) |
| Slot assignment, reuse, reconnect | `tests/worker/room.test.ts` with two DO instances (TC-ROOM-128) |
| Grace timer and disconnect transitions | `tests/worker/room.test.ts` with fake alarms (TC-ROOM-127) |
| Idle sweep and 24 h cap | `tests/worker/room.test.ts` (TC-ROOM-123) |
| `lastSnapshot` size cap and replacement | `tests/worker/room.test.ts` (TC-ROOM-073) |

## Genre rule-set extensions

`CR-2026-11-04-gb-gameplay-fidelity` adds the fields the delay queue, items, movement and modes need.

| Field | Type | Meaning | Oracle |
|---|---|---|---|
| `settings.mode` | `ModeId` | `solo` \| `score` \| `tag` \| `jewel` | `TC-ROOM-151` |
| `settings.mapId` | `string` | one of the eleven maps | `TC-CORE-920` |
| `turn.queue` | `number[]` | slots ordered by accumulated delay | `TC-CORE-901` |
| `turn.delays` | `number[]` | accumulated delay per slot | `TC-CORE-901` |
| `turn.round` | `number` | full passes through the queue; increments on wrap, starts at 0 | `TC-CORE-926` |
| `weather.wind` | `{ magnitude, directionDeg, sector }` | `magnitude` 0–26, `directionDeg = sector × 30`, `sector` 0–11 | `TC-CORE-926` |
| `weather.rolledAtRound` | `number` | the `turn.round` the current wind was rolled for | `TC-CORE-926` |
| `members[].loadout` | `Array<{id,qty}>` | frozen at `match_started`, total ≤ 11 | `TC-MATCH-006` |
| `members[].mobileId` | `string` | chosen mobile, immutable during the match | `TC-CORE-905` |
| `members[].weaponSlot` | `0 \| 1 \| 2` | active weapon | `TC-MATCH-906` |

`Turn` keeps `activeSlot`, `number`, `round` and `deadlineAt`; `queue` and `delays` are the authority for who acts next,
and the round boundary is what re-rolls the weather (`tunables.md` § 1.3). Room
capacity is written as `4 / 6 / 8` by the genre's own rule (`TC-ROOM-071`); `2` remains accepted because the spec allows
1v1.
