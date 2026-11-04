# items — the eleven battle items

The genre ships exactly eleven battle-usable items, and each one is described by a delay, an effect, whether it is a
shot, whether it skips a turn and whether it takes two loadout slots — see
[`../gameplay/reference-gunbound.md`](../gameplay/reference-gunbound.md) § 5. Ours live in
`packages/core/src/data/items.ts`, same model, our ids and art (`OQ-18`).

## Table

| itemId | item | effect in our build | `delayCost` | combat use | Oracle |
|---|---|---|---|---|---|
| `itm-dual` | Dual | fire twice this turn (second shot uses the same weapon) | +20 | yes | `TC-CORE-906` |
| `itm-blood` | Blood | next shot deals +25 % damage | +15 | yes | `TC-CORE-906` |
| `itm-energy-2` | Energy up 2 | +60 movement energy this turn | +10 | yes | `TC-CORE-907` |
| `itm-energy-1` | Energy up 1 | +30 movement energy this turn | +5 | yes | `TC-CORE-907` |
| `itm-dual-plus` | Dual+ | fire twice, second shot +15 % power | +30 | yes | `TC-CORE-906` |
| `itm-change-wind` | Change Wind | set the wind vector to a new random value, announce it | +25 | yes | `TC-CORE-908` |
| `itm-team-teleport` | Team Teleport | move every living team mate to the caster's position ±40 px | +40 | yes | `TC-CORE-909` |
| `itm-bunge` | Bunge shot | tether the shot to the caster: it returns and explodes near the caster | +20 | yes | `TC-CORE-910` |
| `itm-power-up` | Power up | `force` cap +20 for this shot | +15 | yes | `TC-CORE-906` |
| `itm-thunder` | Thunder | lightning strikes a horizontal band at the aim point | +35 | yes | `TC-CORE-911` |
| `itm-teleport` | Teleport | move the caster up to 150 px, ignoring incline | +25 | yes | `TC-CORE-909` |

## Loadout rules

| Rule | Value | Oracle |
|---|---|---|
| Loadout cap | 11 items per match (total quantity, not per type) | `TC-MATCH-006` |
| Picker | ready-room grid, 9 per page, host can lock the loadout | `TC-ROOM-151` |
| Who resolves an effect | the **host** applies it and puts it in the snapshot (we have no server-side referee — `OQ-30`) | `TC-NET-044` |
| Delay interaction | the item's `delayCost` is added to the caster's accumulated delay before the queue is re-sorted | `TC-CORE-901` |
| Untrusted input | the host validates `itemId` and the caster's remaining quantity before applying | `TC-NET-067` |

## Unverified

In the genre the client only displays an ownership status; the referee resolves the effect. Per-item numeric effects in the
table above are our design, not extracted values (`[assumption: OQ-19]`).
