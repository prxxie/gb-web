---
id: EPIC-04-netplay
code: NET
title: Peer-to-peer transport and host authority
---

# EPIC-04 — Peer-to-peer transport and host authority

The WebRTC layer between host and peers: two data channels (reliable `control`, unreliable `state`), the host's input
loop, snapshot fan-out at 10 Hz, mid-match recovery after an election, and the checks that stop a peer from writing state
it does not own ([ADR-0004](../../04-decisions/adr/ADR-0004-gameplay-topology-p2p.md)).

## Goal

Eight phones in one room hold a star of data channels where the host's simulation is the only truth, a dropped or
demoted host does not desynchronise anyone, and no peer can push a snapshot.

## Stories

Generated from story frontmatter — run `node .agents/scripts/verify-docs.mjs --fix`; do not edit by hand.

<!-- cpt:epic-stories -->
| Id | Title | Priority | Size | Status | Depends on |
|---|---|---|---|---|---|
| [US-NET-001](US-NET-001-connect-peers-with-two-channels.md) | Connect every peer to the host with two data channels | P0 | M | done | US-ROOM-006, US-ROOM-005 |
| [US-NET-002](US-NET-002-stream-host-state-to-peers.md) | Send inputs to the host and stream state back at 10 Hz | P0 | M | in-progress | US-NET-001, US-CORE-004 |
| [US-NET-003](US-NET-003-restore-state-after-migration.md) | Restore every peer's state after a host migration | P1 | S | ready | US-NET-002, US-ROOM-005 |
| [US-NET-004](US-NET-004-reject-messages-from-the-wrong-sender.md) | Reject realtime messages the sender does not own | P1 | S | ready | US-NET-002 |
<!-- /cpt:epic-stories -->

## Out of scope

- Signaling and TURN credentials — [US-ROOM-006](../EPIC-02-rooms/US-ROOM-006-relay-signaling-and-issue-turn-credentials.md).
- Server authority over physics (rejected in ADR-0004).
- Voice chat.
