---
id: US-CORE-012
title: Load the eleven maps
epic: EPIC-03-match-core
status: ready
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
| AC1 | the map bundle | it is loaded | eleven records validate: `mapId`, `gravity`, `windRange`, `gimmicks`, terrain RLE (`TC-CORE-920`) |
| AC2 | any map | a match starts | spawn points are valid ground positions for up to eight slots (`TC-CORE-920`) |
| AC3 | a map with gimmicks | the match starts | its gimmicks are active and listed in the lobby preview (`TC-CORE-918`) |
| AC4 | the host changes the map in the lobby | start is pressed | every peer receives the new `mapId` before the first snapshot (`TC-ROOM-151`) |
| AC5 | a map whose terrain is malformed | it is loaded | the loader throws at build time (`TC-FND-002`) |
| AC6 | two matches on the same map and seed | they are compared | terrain, wind rolls and gimmick schedule match (`TC-CORE-040`) |

## 4. Contract

```ts
export interface MapRecord extends Stage { name: { vi: string; en: string }; terrain: Uint8Array;
  spawns: Array<{ x: number; y: number }> }
export function loadMaps(raw: unknown): MapRecord[];
```

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
`Red first: tests/core/maps.test.ts::eleven_maps_load_with_valid_spawns`.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**done.** the engine rule is implemented in `packages/core/src` and covered by `packages/core/tests/` (ballistics, combat, match, snapshot, data, room, rating, camera)
