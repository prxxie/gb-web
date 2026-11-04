---
id: US-NET-001
title: Connect every peer to the host with two data channels
epic: EPIC-04-netplay
status: ready
priority: P0
size: M
depends_on: [US-ROOM-006, US-ROOM-005]
open_questions: []
accepted_assumptions: [OQ-24]
refs: [04-decisions/adr/ADR-0004-gameplay-topology-p2p.md, 02-reference/api/signaling.md, 01-overview/architecture.md]
---

# US-NET-001 — Connect every peer to the host with two data channels

## 1. Story

**As a** peer
**I want** one reliable channel for my inputs and one unreliable channel for state
**so that** a lost snapshot never delays my shot and my input never silently disappears.

## 2. Context

The star mesh keeps the host's uplink to `n − 1` links instead of a full mesh (28 links at 8 players). Channel
semantics are the core of the design: `control` is ordered and reliable, `state` is unordered with
`maxRetransmits: 0`.

| Topic | Reference |
|-------|-----------|
| Topology and channel decisions | [ADR-0004](../../04-decisions/adr/ADR-0004-gameplay-topology-p2p.md) |
| `match_started`, signaling relay | [api/signaling.md](../../02-reference/api/signaling.md) |
| Component responsibilities | [architecture.md](../../01-overview/architecture.md#components) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A room in `playing` | The host opens a peer connection per peer | Each peer connection has exactly two channels named `control` and `state`, created by the host and accepted by the peer (`TC-NET-901`) |
| AC2 | The channel configuration | It is inspected | `control` is `{ordered: true}`; `state` is `{ordered: false, maxRetransmits: 0}` (`TC-NET-901`) |
| AC3 | Four peers | The host reaches `connectionState === "connected"` on all | The match begins sending snapshots only after the last peer is connected or 5 s have passed, whichever first |
| AC4 | A peer whose connection fails | 5 s pass with no `connected` | The host reports `peer_unreachable` to the DO, the peer stays in `grace`, and the match does not block (`TC-ROOM-055`) |
| AC5 | `match_started` for eight players | It is received | The host creates 7 peer connections and never more; the peer connections are closed when the match ends |
| AC6 | A new host after migration | It is elected | It rebuilds its peer connections to every other member and reuses the same channel names (`TC-NET-903`) |

## 4. Contract

```ts
export interface Channels { control: RTCDataChannel; state: RTCDataChannel }
export function createChannels(pc: RTCPeerConnection): Channels;
export function awaitPeerConnected(pc: RTCPeerConnection, timeoutMs: number): Promise<boolean>;
```

`control` messages: `input`, `chat`, `turn_end`, `match_end`, `host_hello`.
`state` messages: `snapshot`, `host_heartbeat` (1 Hz, carries `seq` and `hostGeneration`).

Negotiation: host creates both channels before the offer; the peer reads them from `ondatachannel`. The `control`
channel's `binaryType` stays `"arraybuffer"`; payloads are UTF-8 JSON strings in v1.

## 5. Rules and edge cases

- The DO never participates in the media/transport path; it only relays SDP and ice candidates (`NFR-09`).
- A peer that reconnects mid-match gets fresh credentials and a fresh peer connection (`NFR-10`); old channels are closed.
- `state` messages must be dropped silently when the channel's `bufferedAmount` exceeds 64 KB — the next snapshot
  supersedes them.
- No channel may be created for a member in `disconnected`.
- The host sends `host_hello {hostGeneration, seq}` on each new `control` channel so a peer can rejoin the sequence.

## 6. Implementation notes

- `apps/web/src/net/channels.ts` and `apps/web/src/net/host.ts` / `peer.ts`; the scene never touches an `RTCDataChannel`.
- ICE: `iceServers` from `GET /turn-credentials`, `iceTransportPolicy: "all"`, one `RTCPeerConnection` per peer.
- Connection state machine callbacks feed the same reconnect overlay used for the socket (`US-ROOM-004`).

## 7. Out of scope

- Fan-out of state and input application — [US-NET-002](US-NET-002-stream-host-state-to-peers.md).
- Full mesh between peers (rejected: uplink growth is quadratic).

## 8. Test notes

`TC-NET-901` (channel config, asserted against a mocked `RTCPeerConnection` and in a Playwright pair),
`TC-ROOM-055` (one peer unreachable), `TC-NET-903` (rebuild after election). Browser-level tests need `--use-fake-device-for-media-stream`
off; no media tracks are used.

## 9. Open questions

- **OQ-24** (accepted assumption) — 7 peer connections per host stay within the browser's practical limit on the two
  reference phones; if 8-player matches drop frames, the fallback is 4v4 as the largest supported mode (flagged in
  `OQ-24`).

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**in-progress.** `apps/web/src/net/mesh.ts` builds the star with `control`/`state` channels; needs two browsers — `TC-NET-901` is an e2e case.
