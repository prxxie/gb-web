---
id: US-ROOM-007
title: Pick the mode, the map and the loadout
epic: EPIC-02-rooms
status: ready
priority: P0
size: M
depends_on: [US-ROOM-002, US-CORE-010, US-CORE-012]
open_questions: []
accepted_assumptions: [OQ-19, OQ-37]
refs: [02-reference/screens/lobby.md, 02-reference/gameplay/tunables.md]
---

# US-ROOM-007 — Pick the mode, the map and the loadout

## 1. Story

As a host, I want to choose the mode, the map and my loadout before the match starts, so that the room plays the variant
GunBound rooms play.

## 2. Context

GunBound's host sets mode, map and room options, and every player picks up to eleven items 9 per page
(`0x3101`, `0x3103`) ``. Ours hangs this off the lobby screen.

| Topic | Reference |
|---|---|
| Lobby screen | [`02-reference/screens/lobby.md`](../../02-reference/screens/lobby.md) |
| Modes and maps | [`02-reference/gameplay/tunables.md`](../../02-reference/gameplay/tunables.md) § 5–6 |
| Items | [`02-reference/data/items.md`](../../02-reference/data/items.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|---|---|---|
| AC1 | a host in the lobby | the settings render | mode (4), map (11) and capacity (4/6/8) are selectable, and non-hosts see them read-only (`TC-ROOM-151`) |
| AC2 | a mode is chosen | start is pressed | `match_started` carries `mode`, `mapId` and the loadouts (`TC-ROOM-148`) |
| AC3 | a player opens the loadout | the picker renders | eleven items across two pages of nine, with quantity and delay cost (`TC-ROOM-151`) |
| AC4 | a loadout exceeds eleven items | it is confirmed | the excess is refused with a visible message (`TC-MATCH-006`) |
| AC5 | the host changes the map | a non-host views the lobby | the preview updates from `room_state` without a reload (`TC-ROOM-147`) |
| AC6 | a guest joins | the loadout is opened | guests get the same eleven items for the match (`OQ-05` keeps guests unranked, not unequipped) (`TC-ROOM-151`) |
| AC7 | a member opens the mobile grid | a mobile is confirmed | twenty mobiles render once each in both team tints, duplicates across members are allowed, and the choice is carried in `room_state` and survives reconnect (`TC-ROOM-153`) |


## 4. Contract

```ts
export interface RoomSettings { mode: ModeId; mapId: string; maxPlayers: 4 | 6 | 8 }
export interface Loadout { items: Array<{ id: string; qty: number }> }   // total qty ≤ 11
export type MobileId = `mbl-${number}`   // mbl-01 … mbl-20; fixed per match, duplicates allowed
// WS: { t: 'room_settings', mode, mapId }  (host only)
// WS: { t: 'loadout', items, mobileId }    (each member, once per lobby)
//     { t: 'loadout', items[] }            (any member, before start)
```

## 5. Rules and edge cases

- Settings are host-only; a member's `room_settings` is rejected (`TC-NET-067`).
- Loadouts freeze at `match_started`; changing them mid-match is impossible.
- The picker never shows an item the account cannot use (`TC-AUTH-104`).

## 6. Implementation notes

- `apps/web/src/routes/lobby/SettingsPanel.tsx` + `LoadoutPicker.tsx`; state comes from `room_state`, writes go over WS.
- Lobby layout gains a two-column settings block; the roster keeps its width (`01-overview/conventions.md` § 6).

## 7. Out of scope

Item purchasing, per-mode separate leaderboards (`OQ-28`), map voting.

## 8. Test notes

`TC-ROOM-151`, `TC-ROOM-147`, `TC-ROOM-148`, `TC-MATCH-006`, `TC-AUTH-104`.
`Red first: tests/web/lobby-settings.test.tsx::non_host_sees_read_only_mode_select`.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**done.** mode, map, capacity and loadout selection are stored in `RoomSettings` and validated by `Field`; the defaults and capacity set are covered by `packages/core/tests/room.test.ts` and `data.test.ts`
