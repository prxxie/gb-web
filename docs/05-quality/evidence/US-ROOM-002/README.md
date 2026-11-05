# US-ROOM-002 — join a room through the socket, local run

- Ran: 2026-11-05, `wrangler dev` + a two-socket Node script (`two-client.txt`, script kept out of the repo)
- `two-client.txt` transcript: two guests open `/api/v1/rooms/{code}/ws`, both send `auth`, both receive `room_state`
  with themselves in `you`; the host sees `peer_joined`; after the host drops, the guest reconnects with the same token and
  receives `room_state` with `status: playing` plus `snapshot_state {seq: 1}` — the grace-window replay (`NFR-07`)
- Proves AC1 partially (auth then `room_state`), AC4 partially (one roster, one slot numbering, teams `A`/`B`), and the
  replay half of the reconnect path
- Not proven: AC2 (5 s auth timeout, close `4401`), AC3 (`4409` on a ninth join), AC5 (slot reuse), AC6 (grace after three
  missed pings), AC7 (storage deletion after 60 s)
- Note: the roster showed `team: null` for both members before `team_assign`, which is the documented lobby state
