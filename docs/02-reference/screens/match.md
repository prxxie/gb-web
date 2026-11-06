# Screen — `/match/:code`

The game. One full-screen Phaser canvas inside the React shell, driven by the host-authoritative simulation
([ADR-0004../../04-decisions/adr/ADR-0004-gameplay-topology-p2p.md)). Route also hosts the offline bot match, which
skips rooms and networking entirely.

## Layout (fullscreen landscape, HUD overlays the canvas)

The match is **fullscreen landscape**: on the first tap the shell calls `requestFullscreen()` (iOS Safari has no API on
iPhone — there the page simply fills the viewport with `viewport-fit=cover` and safe-area insets instead, `OQ-39`). The
canvas fills the screen; the HUD floats above it and never reserves layout space.

```
┌───────────────────────────────────────────────────────────┐
│ ⟨Đội A⟩ [hp▮▮] slot0 slot1 │ slot2 slot3 [hp…]   Gió → 0.42 │  roster strip
│                                                    Lượt 3  │
│                     (canvas — camera window)               │
│        ▲                                                   │
│   ◀  (2.7)  ▶   ← four-way pad around the mobile          │
│        ▼          ring shows power 0.0–4.0                 │
│                                                            │
│ ├────┬────┬────┬────┬────┬────┬────┬────┤      [Bỏ lượt]    │  ruler (8→16 ticks)
└───────────────────────────────────────────────────────────┘
```

## Camera and zoom

The camera shows a **window** onto the 2000 × 1200-unit map, not the whole map.

| Property | Value | Notes |
|---|---|---|
| Default window | **1000 × 600 units** — half the map each way | the height is fixed at 600 units and the width follows the screen: 1000 on a 5:3 screen, wider on a landscape phone (844 × 313 is 2.7:1, so ~1617 units), so the box is never cropped and the extra width comes as more battlefield, never as a smaller box |
| Zoom out limit | whole map (2000 × 1200) | `zoomMin` |
| Zoom in limit | 4 × default (250 × 150 units) | `zoomMax`, enough to aim at a 44-unit-wide crater |
| Pan | two-finger drag, 1:1 with the finger centroid | clamped so the window never leaves the map bounds |
| Zoom | pinch (separation change > 12 px) about the pinch midpoint | also `wheel` on desktop |
| Follow | none — the camera stays where the player left it | on your turn, if the window does not contain your mobile, a one-shot pan brings it back into view |

## Ruler (bottom edge)

The bottom strip is a measuring ruler in **parts**, drawn in screen space so it is always legible:

| Zoom state | Divisions across the window | World units per division |
|---|---|---|
| default window (½ map) | **8** | 125 |
| every step out | 9 … 15 | `visibleWidth / n` |
| whole map | **16** | 125 |

Rule: `segments = clamp(round(8 × visibleWidth / 1000), 8, 16)` — the count grows as the window widens and lands on 16 at
full-map zoom. Every division is labelled with its world width; every fourth division is a major tick with a number. The
ruler is the player's protractor substitute for the arc they cannot compute — the same job GunBound's part-grid does
(`reference-gunbound.md` § 10).

## Fields

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| HP bars | per player, 0–1200 | snapshot `players[].hp` | Colour shifts to `danger` below 30 % |
| Shield | per player, 0–300 | snapshot `players[].shield` | Thin bar above HP |
| Active slot | integer | `turn.activeSlot` | Highlighted in the roster strip |
| **Wind dial** | 12-tick compass, arrow at the sector, numeric **0–26** | `weather.wind` | Arrow at `directionDeg` (a multiple of 30°), ticks every 30° with a longer tick at `0/90/180/270`, numbers at the four cardinals, `0` drawn as a hollow arrow with the dial greyed |
| Weather banner | text + dial for 1.5 s | `weather` when `rolledAtRound` changes | `match.weather.changed` — "Gió đổi: 14 · hướng 120°"; any tap dismisses it; never blocks input |
| Turn clock | countdown from **20 s** | `turn.deadlineAt` | Local countdown, re-synced on each snapshot; turns `warning` under 5 s |
| Turn number | integer | `turn.number` | — |
| Aim arc | canvas graphics | local input | Dotted, in the mobile's `angleMin…angleMax` window |
| **Power ring** | gradient arc **around the mobile**, 64 px radius, clockwise from −90° | local input | Numeric value **inside** the ring, `0.0–4.0` (GunBound's power bar); sent as `force = round(power × 25)` |
| Angle chip | degrees | local input | Shown while the up/down controls are touched, `37°` |
| Connection dot | `connected` / `grace` / `disconnected` | `room_state` | Pulsing during grace |

## Controls

There is **no joystick**: every action is a finger gesture on the canvas or one of the four controls that appear around
your mobile on your turn (`OQ-40` — this supersedes the optional joystick in source § 2.2).

| Control | Gesture | Effect | Message | Permission |
|---------|---------|--------|---------|-----------|
| Pull power (aim) | **one finger** dragged anywhere on the canvas | Power 0.0–4.0 in proportion to the drag distance; angle from the drag direction; the ring fills around the mobile | — (local) | active slot only |
| Fire | **release** the one-finger drag | Commits `force = round(power × 25)` and the angle; a release below **0.3** cancels instead of firing | `input{kind:'fire', angle, force, facing, seq, weaponSlot}` on `control` | active slot |
| Pan window | **two fingers** dragged together | Moves the camera, 1:1 with the centroid, clamped to the map | — (local) | any member |
| Zoom | pinch in / out (two fingers, separation change > 12 px) | Zoom between `zoomMin` and `zoomMax` about the midpoint | — (local) | any member |
| Angle up / down | tap or hold the ▲ / ▼ of the four-way pad (**±1° per tap, 10°/s held**) | Rotates the barrel, clamped to the mobile's own `angleMin…angleMax`; the chip shows the value | — (folded into the next `fire`) | active slot |
| Move left / right | tap or hold the ◀ / ▶ of the four-way pad | Walks/ runs the mobile within `moveDistance`, debits `moveEnergy` and `moveDelay` as it moves | `input{kind:'move', direction, distance, seq}` on `control` | active slot |
| Skip turn | `Bỏ lượt` button, 60×60 | Forfeits the turn | `input{kind:'skip'}` | active slot |
| Chat | the `Trò chuyện` button opens a preset phrase grid and emote buttons (closed by default, so the pull gesture keeps the canvas) | Bubble for 3 s | `chat{kind, id}` | any member, rate-limited 2/s |
| Rotate notice | — | Portrait blocks play with a rotate prompt | — | — |

Gesture arbitration: a two-finger gesture cancels any power pull in progress **without firing**; the pad, the weapon
strip, the item tray and `Bỏ lượt` are DOM elements above the canvas, so a touch that starts on one of them never becomes
a drag. All pad and button targets are ≥ 60 × 60 logical px (`NFR-17`).

## Turn and end conditions

1. The host decides whose turn it is (`activeSlot`), starts the 20 s clock, and broadcasts it in the snapshot.
2. A fire input resolves: projectile steps with the round's wind, terrain and blast damage applied to every player in range
   (friendly fire included — `OQ-02` default), hp floored at 0.
3. The turn ends on shot resolution, on `skip`, or on the timeout. Timeout on a disconnected player skips immediately.
4. A team loses when every player on it has `hp = 0`. Eliminated players are skipped in the rotation.
5. The host sends `match_end` with the result, then `match_recorded` once the Worker has accepted it; every client
   navigates to `/results/:code`.

## States

| State | Behaviour |
|-------|-----------|
| Loading | Asset progress bar; the HUD is not interactive until `match_started` |
| Waiting for opponent | Canvas shows the map and the roster; banner `Chờ người chơi…` |
| Not your turn | Aim input ignored; hint `Lượt của {tên}` |
| Reconnecting | Overlay `Đang kết nối lại…` + 20 s countdown; simulation continues locally from the last snapshot |
| Reconnect success | Snapshot applied, overlay clears, no re-entry animation |
| Grace expired | Self marked `disconnected`; turns auto-skip; can rejoin within the match (`NFR-07`) |
| Host migration | 300 ms `Đang chuyển chủ phòng…` overlay; play resumes from `lastSnapshot`, ≤ 5 s (`NFR-06`) |
| Match ended remotely | Straight to `/results/:code` |
| Offline bot match | No HUD network dots, no chat, `Bỏ lượt` stays; leaving returns to `/` |

## Copy keys

`match.wind`, `match.weather.changed`, `match.wind.calm`, `match.turn`, `match.timeLeft`, `match.skip`, `match.yourTurn`, `match.waiting`, `match.reconnecting`,
`match.migrating`, `match.eliminated`, `match.bot`, `match.phrases.title`, `match.rotate`, `match.power`,
`match.angle.up`, `match.angle.down`, `match.move.left`, `match.move.right`, `match.ruler.unit`, `match.zoom.hint`.

## Oracle

| Contract | Checked by |
|----------|-----------|
| Aim drag → angle/force within tolerance, a pull under the deadzone sends nothing | `apps/web/tests/aim.test.tsx` (TC-MATCH-914, TC-MATCH-916) |
| Power ring shows 0.0–4.0 and maps to `force = power × 25` | `apps/web/tests/power-ring.test.tsx` (TC-MATCH-915) |
| Release below 0.3 cancels; two-finger gesture cancels without firing | `apps/web/tests/gestures.test.tsx` (TC-MATCH-916) |
| Camera default window 1000 × 600, clamped pan, zoom bounds | `packages/core/tests/camera.test.ts` + `apps/web/tests/camera.test.tsx` (TC-MATCH-918, TC-MATCH-919) |
| Ruler divisions 8 → 16 as the window widens | `apps/web/tests/ruler.test.tsx` (TC-MATCH-920) |
| Units blend between two snapshots 100 ms apart; positions only, `hp`/`facing`/`eliminated` snap | `apps/web/tests/interpolate.test.tsx` (TC-MATCH-924) |
| An eliminated mobile is drawn as a faded wreck in place and keeps its roster cell, ordered by slot | `apps/web/tests/interpolate.test.tsx` (TC-MATCH-924, the wreck) and `apps/web/tests/roster.test.tsx` (TC-MATCH-925, the strip) |
| Landscape launch, safe-area insets respected, no fullscreen launch flag | `tests/e2e/smoke.spec.ts` (TC-PWA-063) |
| Turn clock starts at 20 s, skips on timeout, does not drift > 1 s | `packages/core/tests/turn.test.ts` (TC-CORE-152) |
| Wind re-rolled once per round, dial shows 12 sectors and 0–26 | `packages/core/tests/weather.test.ts` (TC-CORE-926), `apps/web/tests/wind-dial.test.tsx` (TC-MATCH-923) |
| Blast damage, friendly fire, elimination, team-loss detection | `packages/core/tests/combat.test.ts`, `packages/core/tests/match.test.ts` (TC-CORE-020…TC-CORE-028) |
| Snapshot apply is idempotent and duck-types by `seq` | `packages/core/tests/snapshot.test.ts` (TC-CORE-040) |
| Reconnect overlay countdown matches the 20 s grace | `apps/web/tests/reconnect.test.tsx` (TC-ROOM-174…TC-ROOM-177) |
| Host migration overlay ≤ 5 s end-to-end | `tests/e2e/migration.spec.ts` (TC-ROOM-149, TC-ROOM-182) |
| Offline bot match needs no network at all | `tests/e2e/pwa-offline.spec.ts` (TC-PWA-064) |

## GunBound rule-set extensions

`CR-2026-11-04-gb-gameplay-fidelity` adds three HUD areas and two state displays.

| Area | Content | Targets | Copy keys | Oracle |
|---|---|---|---|---|
| Weapon strip | three buttons: shot 1, shot 2, super shot (charge state) | 60×60 each, 8 px gaps | `match.weapon.1..3`, `match.weapon.charge` | `TC-MATCH-906` |
| Item tray | loadout items with quantity and delay cost, 2 pages of 9 | 44×44 minimum | `match.item.*`, `match.item.empty` | `TC-MATCH-006` |
| Move controls | four-way pad around the mobile on your turn: ◀ ▶ move, ▲ ▼ angle | 60×60 each, ring 96 px from the sprite | `match.move.*`, `match.angle.*` | `TC-MATCH-907` |
| Delay roster | each seat's delay: absolute for the active player, signed relative for others | — | `match.roster.delay` | `TC-MATCH-903` |
| Shield | shield value next to HP, shield bar thinner above HP | — | `match.roster.shield` | `TC-MATCH-903` |

Mode badges (`Solo / Score / Tag / Jewel`) appear in the top bar with the map name; in Jewel mode a collected-jewel
counter appears for each team (`TC-CORE-917`). Fog maps shorten the aim arc and hide blast markers, never unit positions
(`TC-CORE-918`).
