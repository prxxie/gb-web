---
id: US-NET-002
title: Send inputs to the host and stream state back at 10 Hz
epic: EPIC-04-netplay
status: done
priority: P0
size: M
depends_on: [US-NET-001, US-CORE-004]
open_questions: []
accepted_assumptions: [OQ-24, OQ-32]
refs: [02-reference/api/signaling.md, 01-overview/architecture.md, 01-overview/nonfunctional-requirements.md]
---

# US-NET-002 — Send inputs to the host and stream state back at 10 Hz

## 1. Story

**As a** peer
**I want** my shot applied by the host and its result streamed back
**so that** the match feels immediate and everyone sees the same trajectory.

## 2. Context

The host runs the only simulation. Peers send `input` with a monotonic `seq` on `control` and render from `snapshot`
messages on `state`, interpolating between the two most recent ones. There is no client prediction and no rollback in
v1 (`OQ-32`).

| Topic | Reference |
|-------|-----------|
| Input and snapshot messages | [api/signaling.md](../../02-reference/api/signaling.md) |
| Snapshot encoding | [US-CORE-004](../EPIC-03-match-core/US-CORE-004-encode-and-apply-snapshots.md) |
| NFR-02 touch latency, NFR-04 budget | [nonfunctional-requirements.md](../../01-overview/nonfunctional-requirements.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A peer on its turn | It fires | `input {kind:"fire", angle, force, facing, seq}` is sent on `control` and the host applies it to the next simulation step |
| AC2 | The host simulating | A turn resolves | A `snapshot` is sent to every connected peer at 10 Hz while a projectile is in flight and at 2 Hz while idle (`TC-NET-905`) |
| AC3 | A snapshot received by a peer | It is applied | The peer's rendered HP, turn and wind match the host's within 100 ms of the message (`TC-NET-906`; the two-browser pass is `TC-NET-902`) |
| AC4 | An input with a `seq` lower than the last one applied for that turn | It arrives | It is dropped without an error (`TC-NET-905`) |
| AC5 | The `state` channel congested (`bufferedAmount > 64 KB`) | The next snapshot is due | It is dropped, not queued, and the following snapshot supersedes it (`TC-NET-905`) |
| AC6 | A peer that never receives a snapshot for 2 s | The watchdog fires | The peer shows the reconnect overlay and shows the reconnect overlay; the replay is the socket's own `snapshot_state`, which the DO already sends a returning client, so no request frame is invented (`TC-NET-905`; `US-ROOM-004` AC2) |
| AC7 | A match in progress | The network is inspected | No snapshot exceeds 800 B and the host's uplink stays under 8 KB/s per peer (`TC-NET-905`, `TC-NET-907`; measured 380 B for eight players) |

## 4. Contract

`input` (peer → host, `control`, reliable): `{t:"input", turn:number, seq:number, kind:"fire"|"skip", angle?:number, force?:number, facing?:1|-1, weaponSlot?:0|1|2}`.
`snapshot_state` (host → peers, `state`, unreliable): `{t:"snapshot_state", snapshot}` where `snapshot` is the `Snapshot` from `US-CORE-004`. The DO also sends this frame to a returning client, so one shape covers both directions ([signaling.md](../../02-reference/api/signaling.md) §3).
A peer never simulates: it puts its shot on `control` and renders the host's answer (`TC-NET-906`). Until
2026-11-07 every client simulated its own input and published the result, so an online room had as many simulations as
players and the DO refused every peer's `snapshot_push`.
`host_heartbeat` (host → peers, `state`, 1 Hz): `{t:"host_heartbeat", seq, hostGeneration, turnNumber}`.

Host loop: `requestAnimationFrame` at 60 Hz for simulation, a 100 ms interval for publishing, and an immediate publish
after each turn resolution.

## 5. Rules and edge cases

- The host applies at most one `fire` per `(slot, turn.number)`; later `seq` wins (`TC-CORE-045`).
- Interpolation is render-only: the peer never extrapolates projectile position, it draws between the last two snapshots.
- Snapshots are published immediately on turn resolution so the hit is not delayed by up to 100 ms.
- A peer's input during someone else's turn is rejected with `error unsupported-message` and does not affect state.
- `state` messages carry no chat and no events; those ride `control`.

## 6. Implementation notes

- `apps/web/src/net/session.ts` holds `GameSession` (host or peer role) with `applyInput`, `publishSnapshot`, `onSnapshot`.
- One shared `performance.now()`-based clock per device; `deadlineAt` comes from the host, not the local clock.
- Log a desync report (`stateHash` per side) at match end when host and submitted result disagree — see `US-RANK-001`.

## 7. Out of scope

- Client-side prediction and rollback (`OQ-32`: not in v1).
- Voice, spectators, replays.

## 8. Test notes

`TC-NET-902` (rate, size, latency of applied state — two browsers, still owed), `TC-NET-905` (the wire rules),
`TC-NET-906` (the page's half), `TC-NET-907` (the DO accepts and relays packed), `TC-ROOM-047` (watchdog), `TC-CORE-045`
(alias rule).
Playwright runs two contexts on one machine; the rate assertion samples 100 messages.

Red: `apps/web/tests/netplay-wiring.test.tsx` — the first version of TC-NET-906 failed because a peer's release
applied the shot locally and broadcast it instead of sending an `input` frame (no frame was sent at all: the spy counted
zero calls), and `apps/web/tests/netplay.test.tsx` — TC-NET-905's size case failed at 1 319 B against the 800 B budget
before the players were packed.

## 9. Open questions

- **OQ-24** (accepted assumption) — 10 Hz + 800 B fits the free tier and the reference phones.
- **OQ-32** (accepted assumption) — no rollback: a peer sees its own shot when the host's snapshot arrives (~1 RTT).
  If the client demands local prediction, this story splits and `conventions.md` § 9 gains a prediction contract.

<!-- delivery:2026-11-07 -->

## Delivery status — 2026-11-07

**done.** One simulation, seven clients: a peer sends its input and renders the host's answer.

| AC | Evidence | State |
|----|----------|-------|
| AC1 | `apps/web/tests/netplay.test.tsx::TC-NET-905` (frame shape and the `seq` rule), `apps/web/tests/netplay-wiring.test.tsx::TC-NET-906` (a peer sends exactly one `input` and publishes nothing; the host applies and publishes) | met |
| AC2 | `TC-NET-905` — `snapshotHz`/`snapshotIntervalMs` drive the mesh interval: 10 Hz while a turn is running, 2 Hz once it is over | met; the two-browser timing sample is `TC-NET-902` |
| AC3 | `TC-NET-906` plus the `resyncFromSnapshot` path shared with `US-ROOM-004` AC2 | met at page level; the measurement is `TC-NET-902` |
| AC4 | `TC-NET-905` — `isStaleInput` drops `seq ≤ last` per `slot:turn`; the host keeps that map in `appliedInputs` | met |
| AC5 | `TC-NET-905` — a `bufferedAmount` over 64 KB skips the send | met (unit); no congested-link run |
| AC6 | `TC-NET-905` (the 2 s constant) and the watchdog effect that raises the reconnect banner | met, with the request half re-read as the socket's own replay |
| AC7 | `TC-NET-905` — packed players, terrain stripped, **380 B** for eight; `apps/worker/tests/snapshot-push.test.ts::TC-NET-907` — the DO accepts the packed push, stores an expanded `Snapshot` and relays packed | met |

**What this pass changed in the code.** `apps/web/src/net/input.ts` owns the wire rules (`inputFrameOf`,
`isStaleInput`, `snapshotHz`, `wireSnapshot`, `toPackedSnapshot`, `readSnapshot`, `unpackSnapshot`).
`apps/web/src/net/mesh.ts` publishes at `snapshotIntervalMs(status)` and reads packed snapshots.
`apps/web/src/routes/MatchPage.tsx` sends an `input` frame instead of simulating when it is not the host, applies a
peer's frame on the host (slot attributed from `room_state`, never trusted from the frame), packs the per-turn
`snapshot_push` and stamps `lastSnapshotAt` for the watchdog. `apps/worker/src/room-do.ts` expands a packed push before
storing it and relays packed. `packages/core` gained `expandWire`, `isWireSnapshot` and `packSnapshot`.

**Three drifts this pass found and settled.**
1. *No peer ever sent an input.* Every client applied its own shot and broadcast the result, so an online room ran one
   simulation per player and the DO refused the peers' `snapshot_push`. Now only the host simulates.
2. *The frame carried no weapon slot.* A peer's super shot landed as the primary weapon. `weaponSlot` is part of the
   frame and of `api/signaling.md` § Control channel messages.
3. *The packed encoding existed and was never used.* `WireSnapshot` shipped with `US-CORE-004`, but the app sent the
   named-field object: 1 319 B for eight players against an 800 B budget. The state channel, the per-turn push and the
   relay now all carry the packed form; the DO keeps an expanded `Snapshot` in storage so a replay or a leaderboard
   dispute can still read it.

**AC6, settled rather than guessed.** It asked the peer to request a `snapshot_state` from the DO. No such client → DO
frame exists in `api/signaling.md`, and the socket already sends that replay to a returning client
(`US-ROOM-004` AC2). The observable half — the overlay — is implemented, and the replay is the documented mechanism.
