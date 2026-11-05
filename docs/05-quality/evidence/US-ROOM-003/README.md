# US-ROOM-003 — team assignment and match start, local run

- Ran: 2026-11-05, two sockets in a `maxPlayers: 2` room on `wrangler dev`
- Transcript (`../US-ROOM-002/two-client.txt`): `team_assign {A,B}` → both peers receive `room_state` with
  `Host:A,Guest:B`; `start_match` → `match_started {seed, hostGeneration: 1, rulesetVersion: "2026-11-05",
  assignments: 2, room}`; a snapshot with `seq: 1` reaches the peer
- A first attempt that assigned teams `red`/`blue` was rejected with `error {code: "teams-unbalanced"}`, which proves the
  guard fires but also exposes contract drift: AC4 names the code `teams-not-balanced`, and `US-NET-004` repeats that
  name, while `packages/core/src/room.ts:189` emits `teams-unbalanced` / `not-lobby` / `not-full` / `not-enough-players`
- Also drifted: AC3's `match_started` shape (`startedAt` iso, `turnOrder`, `seed` hex) versus the implemented broadcast
  (`startedAt` epoch ms, no `turnOrder`, numeric `seed`) — `docs/02-reference/api/signaling.md` describes the implemented
  shape, so the story section is the stale one
- Not proven: AC2 (`not-host`), AC5 (`invalid-state`), AC6 (no partial side effect)
