---
id: US-CORE-012
title: Load the eleven maps
epic: EPIC-03-match-core
status: done
priority: P1
size: M
depends_on: [US-CORE-006, US-CORE-011]
open_questions: []
accepted_assumptions: [OQ-19, OQ-37]
refs: [02-reference/gameplay/tunables.md, 02-reference/data/mobiles.md]
---

# US-CORE-012 — Load the eleven maps

## 1. Story

As a host, I want eleven maps with different gravity, wind and gimmicks, so that a session does not feel repetitive.

## 2. Context

GunBound ships up to eleven maps per mode and the room card's icon is `((mode) * 11 + map)`
``. Ours are original layouts (`OQ-18`) with GB-style parameters.

| Topic | Reference |
|---|---|
| Map data | [`02-reference/gameplay/tunables.md`](../../02-reference/gameplay/tunables.md) § 6 |
| Room selection | [`02-reference/screens/lobby.md`](../../02-reference/screens/lobby.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|---|---|---|
| AC1 | the map bundle | it is loaded | eleven records validate: `mapId`, `gravityModifier`, `windRange`, `gimmicks`, terrain RLE (`TC-CORE-920`) |
| AC2 | any map | a match starts | spawn points are valid ground positions for up to eight slots (`TC-CORE-920`) |
| AC3 | a map with gimmicks | the match starts | its gimmicks are active and listed in the lobby preview (`TC-CORE-918`) |
| AC4 | the host changes the map in the lobby | start is pressed | every peer receives the new `mapId` before the first snapshot (`TC-NET-067`, `TC-ROOM-166`) |
| AC5 | a map whose terrain is malformed | it is loaded | the loader throws at build time (`TC-CORE-945`) |
| AC6 | two matches on the same map and seed | they are compared | terrain, wind rolls and gimmick schedule match (`TC-CORE-040`) |

## 4. Contract

```ts
export interface MapDef {
  mapId: string;
  name: { vi: string; en: string };         // one authored label per locale, never a translated literal
  gravityModifier: number;                  // per-map knob on top of each mobile's own gravity
  seed: number;
  gimmicks: readonly Gimmick[];
  spawns: readonly (readonly [number, number] | null)[];  // slot-indexed; `null` = illegal slot
  jewels: readonly (readonly [number, number])[];
  windRange: { min: number; max: number };  // the magnitude window this map rolls into
  terrain: string;                          // authored mask, RLE over tenths (serializeTerrain)
}
export const MAPS: readonly MapDef[];
export function getMap(mapId: string): MapDef;   // throws RangeError for an unknown id
```

`terrain` is produced on first read and cached, because the generator needs `terrain.ts`, which reads back the
map profiles — an eager build would run against a half-initialised import.

## 5. Rules and edge cases

- Terrain is authored as RLE and expanded once at load; the wire carries only deltas after carving.
- Spawns are chosen by slot index, so the same map always seats slot 0 in the same place.
- Map art is ours; no GunBound map data is used (`OQ-18`).

## 6. Implementation notes

- `packages/core/src/data/{maps.json,terrains/*.rle}`; a small editor script converts a PNG to RLE.

## 7. Out of scope

Map editor UI, user-generated maps, seasonal rotation.

## 8. Test notes

`TC-CORE-920`, `TC-CORE-918`, `TC-ROOM-151`, `TC-FND-002`, `TC-CORE-040`.
Red: none — the rule was already implemented and green; this pass added the cases the ACs cited and corrected the citations that pointed at another story's case (see the delivery note at the end of this file).

<!-- delivery:2026-11-06 -->

## Delivery status — 2026-11-06

**done.** `packages/core/tests/maps.test.ts` / `data.test.ts` — `TC-CORE-920` (eleven map records validate: id, gravity
modifier, wind range, gimmicks, RLE), `TC-CORE-918` (gimmicks active and listed), `TC-CORE-945` (a corrupt RLE token and
a wrong-length mask both throw), `TC-CORE-040` (the same map and seed reproduce terrain, wind and the gimmick schedule);
`apps/worker/tests/room-settings.test.ts` `TC-NET-067` (the host's `room_settings` applies mode and map and broadcasts
`room_state` to every peer) and `TC-ROOM-166` (`match_started` carries the chosen mode and map).

AC4 cited `TC-ROOM-151`, whose only case is "`room_settings` from a peer is not-host" — the broadcast half it meant is
`TC-NET-067`. AC5 cited `TC-FND-002`, a CORS/env case; the terrain guard it meant is now `TC-CORE-945`.

This pass added `TC-CORE-957` (the listed gimmick runs and the lobby reads the same list), `TC-CORE-958` (a map and seed replay identically) and `TC-ROOM-207` (the host's mode and map reach `match_started`).
