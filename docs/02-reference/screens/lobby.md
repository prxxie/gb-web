# Screen — `/lobby/:code`

Where players gather, teams are set and the host starts the match. Open to any member of the room; the room state comes
over the WebSocket ([signaling.md](../api/signaling.md)).

## Layout

```
┌───────────────────────────────────────────────────────────┐
│ ←   Phòng K7M2QX   [Sao chép mã]        3/4 người  [VI|EN]│
├───────────────────────────────┬───────────────────────────┤
│ ĐỘI A                         │ ĐỘI B                     │
│  0 (av) Bao      (chủ phòng)  │  2 (av) Linh              │
│  1 (av) Minh                  │  3 — trống —              │
│  [Chuyển đội]                 │  [Chuyển đội]             │
├───────────────────────────────┴───────────────────────────┤
│  host: [Bắt đầu]   everyone: [Rời phòng]   (chat: phrases)│
└───────────────────────────────────────────────────────────┘
```

## Fields

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| Room code | text + copy button | route param | `navigator.clipboard.writeText`; fallback selects the text |
| Occupancy | `n/max` | `room_state.members`, `maxPlayers` | — |
| Team columns | list of slots per team | `member.team`, `member.slot` | Empty slots render `— trống —` |
| Member row | avatar, name, host badge, connection dot | `member` | `grace` shows a pulsing dot + `Đang kết nối lại`. The avatar is a 28 px disc carrying the pick's number (`avatar-09` → `09`, `default` → `–`) until the images ship (`OQ-12`); it reads `member.avatarId`, so a peer's new pick appears on the next `room_state` |
| `Bắt đầu` | primary button, host only | — | Disabled until teams are equal and non-empty; tooltip says why |
| `Chuyển đội` | secondary, per member | host only via `team_assign` | Absent for peers |
| `Rời phòng` | text button | — | `leave` then `/` |
| Quick phrases / emotes | preset grid | `chat` on the control channel after the match starts | In lobby only emotes are shown (no match channel yet) |

## Team rules

- Team sizes must be equal at start: `maxPlayers / 2` per side (2→1v1, 4→2v2, 6→3v3, 8→4v4). The host may leave slots
  empty, but both sides must hold the same number of players.
- The host may be on either team; the host role is orthogonal to `team`.
- `Chuyển đội` is refused when the destination team is full (client-side disabled + server-side `409`).
- Late joiner: is seated in the emptier team (a tie seats on A), so a full room can start without shuffling;
  `team_assign` moves anybody afterwards. `Bắt đầu` is disabled while any member is unassigned (legacy rooms
  that predate this rule) or the teams differ in size.

## States

| State | Behaviour |
|-------|-----------|
| Connecting | `Đang kết nối…` until `room_state` arrives; 10 s timeout → banner + `Thử lại` |
| Host left | Banner `Chủ phòng đã rời` and the room waits for the new host (election in `lobby` promotes the earliest joiner) |
| Peer joined/left | Row appears/disappears with a 200 ms fade; no layout jump beyond that |
| Room full | Join attempt shows `Phòng đã đầy` (the socket closes `4409`) |
| Room closed | `Phòng đã đóng` → `/` after acknowledgement |
| Disconnected self | Overlay `Mất kết nối` with a 20 s countdown, then `Rời phòng` auto-fires (`NFR-07`) |
| Reconnected | Slot and team restored from `room_state`; overlay disappears without leaving the screen |

## Copy keys

`lobby.title`, `lobby.copy`, `lobby.copied`, `lobby.occupancy`, `lobby.teamA`, `lobby.teamB`, `lobby.empty`,
`lobby.host`, `lobby.start`, `lobby.startHint`, `lobby.switchTeam`, `lobby.leave`, `lobby.connecting`,
`lobby.reconnecting`, `lobby.hostLeft`, `lobby.full`, `lobby.closed`.

## Oracle

| Contract | Checked by |
|----------|-----------|
| Two browsers join, both see the same roster and teams | `tests/e2e/lobby.spec.ts` (TC-ROOM-147) |
| `Bắt đầu` gating (equal, non-empty, all assigned) | `tests/e2e/lobby.spec.ts` (TC-ROOM-148) |
| Host leaving promotes the earliest joiner and the banner shows | `tests/e2e/lobby.spec.ts` (TC-ROOM-149) |
| Reconnect within 20 s restores slot/team | `tests/e2e/reconnect.spec.ts` (TC-ROOM-046) |
| Copy button writes the exact code | `tests/e2e/lobby.spec.ts` (TC-ROOM-150) |

## GunBound rule-set extensions

The lobby gains a host-only settings column and a per-player loadout step (`US-ROOM-007`).

| Element | Content | Who edits | Oracle |
|---|---|---|---|
| Mode | four radio options: Solo, Score, Tag, Jewel | host | `TC-ROOM-151` |
| Map | eleven maps with a thumbnail and gimmick badges | host | `TC-CORE-920` |
| Capacity | 4 / 6 / 8 (2 kept for 1v1) | host | `TC-ROOM-071` |
| Mobile | twenty mobiles in a filterable grid, each shown in both team tints; duplicates allowed | each member | `TC-ROOM-153` |
| Loadout | eleven items across two pages of nine, with quantity and delay cost | each member | `TC-MATCH-006` |

Non-hosts see every control read-only, with the host's current choice and a "host is choosing" note. Starting the match
requires every member to confirm a loadout; the loadout freezes at `match_started` (`TC-ROOM-148`).
