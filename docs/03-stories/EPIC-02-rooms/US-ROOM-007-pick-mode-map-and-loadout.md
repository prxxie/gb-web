---
id: US-ROOM-007
title: Pick the mode, the map and the loadout
epic: EPIC-02-rooms
status: done
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
| AC7 | a member opens the mobile grid | a mobile is confirmed | seventeen mobiles render once each in both team tints, duplicates across members are allowed, and the choice is carried in `room_state` and survives reconnect (`TC-ROOM-153`) |


## 4. Contract

```ts
export interface RoomSettings { mode: ModeId; mapId: string; maxPlayers: 4 | 6 | 8 }
export interface Loadout { items: Array<{ id: string; qty: number }> }   // total qty ≤ 11
// MobileId is `Mobile.mobileId`, an open string in `packages/core`: `isMobileId` is the runtime allowlist
// (mbl-01 … mbl-20, fixed from `match_started` on, duplicates across members allowed)
// WS: { t: 'room_settings', mode, mapId }  (host only)
// WS: { t: 'loadout', items, mobileId? }   (each member, any time while the lobby is open)
```

## 5. Rules and edge cases

- Settings are host-only; a member's `room_settings` is rejected (`TC-NET-067`).
- Loadouts freeze at `match_started`; changing them mid-match is impossible.
- The picker never shows an item the account cannot use (`TC-AUTH-104`).

## 6. Implementation notes

`apps/web/src/components/SettingsPanel.tsx`, `MobileGrid.tsx` + `LoadoutPicker.tsx`; state comes from `room_state`, writes go over WS.
- The mobile pick rides the same `{ t: 'loadout' }` frame as the items (`mobileId` next to `items`): one write path per member and one echo — the worker stores it on the member record and every client reads it back from `room_state`.
- The grid is the only mobile control. With a `<select>` the pick lived in local state, so it never reached the room and a reload lost it; `apps/web/src/routes/LobbyPage.tsx` now keeps no mobile state of its own and echoes `room_state`.
- Lobby layout gains a two-column settings block; the roster keeps its width (`01-overview/conventions.md` § 6).

## 7. Out of scope

Item purchasing, per-mode separate leaderboards (`OQ-28`), map voting.

Follow-ups found while shipping, each one a story of its own:

- The seventeen mobile names are English strings rendered as-is (`02-reference/data/mobiles.md`); localising them needs a
  `{ vi, en }` shape like `MapDef.name` and a translation pass over the roster.
- The grid is seventeen `aria-pressed` buttons. Single-choice semantics (`role="radiogroup"`, roving tabindex) and a live
  region announcing "saved" are an accessibility story, not a lobby story.
- `move`, `item` and `snapshot_push` are still unbudgeted in the room (`apps/worker/src/room-do.ts` `charge`); only
  the lobby writes are charged now (`TC-ROOM-712`). That belongs to `US-NET-004`.
- A refused `loadout` is dropped silently in the lobby (`apps/web/src/routes/LobbyPage.tsx`). AC4 asks for a visible
  message; rendering the refusal in the lobby banner is a lobby UI story.

## 8. Test notes

`TC-ROOM-151`, `TC-ROOM-147`, `TC-ROOM-148`, `TC-MATCH-006`, `TC-AUTH-104`, `TC-ROOM-153`, `TC-ROOM-708`, `TC-ROOM-709`, `TC-ROOM-710`.
- **Red:** `TC-ROOM-709` in `apps/web/tests/lobby-mobile.test.tsx` failed — there was no grid, only a `<select>` holding a local `mobileId`; `TC-ROOM-708` in `apps/worker/tests/room-settings.test.ts` failed — a `loadout` frame carrying `mobileId` was refused as an unknown key; `TC-ROOM-713` in `apps/web/tests/lobby-join.test.tsx` failed — the two mounts of the effect posted `join` twice; `TC-ROOM-153` in `tests/e2e/lobby-mobile.spec.ts` failed — the guest's socket was closed as an unknown player, so the grid came back on `mbl-01` after the reload.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**done.** mode, map, capacity and loadout selection are stored in `RoomSettings` and validated by `Field`; the defaults and capacity set are covered by `packages/core/tests/room.test.ts` and `data.test.ts`

<!-- delivery:2026-11-08 -->

## Delivery status — 2026-11-08 (AC7 and AC5 closed)

AC1–AC6 shipped on 2026-11-05; this pass closed the two that only looked green.

- **AC7.** `MobileGrid` renders the seventeen mobiles once each in both team tints. A pick is a `loadout` frame with `mobileId`; the worker stores it on the member and the grid echoes `room_state` instead of keeping a local copy. `auth` no longer carries `mobileId` — the room owns it. `packages/core` exports `isMobileId` so the parser and the worker share one allowlist.
- **AC5.** `SettingsPanel` renders `map-preview`: the chosen map's name plus a badge per gimmick, straight off `room_state`, so a member sees the host's map change without a reload.
- **Two defects the e2e run found.** `StrictMode` runs a mount effect twice: the lobby posted `join` twice (200 then 409, and the 409 navigated away) — now deduped per room code in `apps/web/src/routes/LobbyPage.tsx`; and `ensureSession()` minted a second guest identity, so the seat belonged to guest A while the socket authenticated as guest B and the room closed it as an unknown player — now one mint per page load (`TC-ROOM-710`).
