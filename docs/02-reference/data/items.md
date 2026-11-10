# items — the eleven battle items

The genre ships exactly eleven battle-usable items, and each one is described by a delay, an effect, whether it is a
shot, whether it skips a turn and whether it takes two loadout slots — see
[`../gameplay/reference-gunbound.md`](../gameplay/reference-gunbound.md) § 5. Ours live in
`packages/core/src/data/items.ts`, same model, our ids and art (`OQ-18`).

## Table

| itemId | item | effect in our build | `delayCost` | combat use | Oracle |
|---|---|---|---|---|---|
| `itm-dual` | Dual | fire twice this turn (second shot uses the same weapon) | +600 | yes | `TC-CORE-906` |
| `itm-blood` | Blood | spend 8 % of your health for +33 % damage on this shot | +0 | yes | `TC-CORE-906` |
| `itm-energy-2` | Energy up 2 | restore 25 % of your health | +300 | yes | `TC-CORE-907` |
| `itm-energy-1` | Energy up 1 | restore 10 % of your health | +100 | yes | `TC-CORE-907` |
| `itm-dual-plus` | Dual+ | fire twice, second shot +15 % power | +250 | yes | `TC-CORE-906` |
| `itm-change-wind` | Change Wind | reverse the wind: same strength, the other way | +150 | yes | `TC-CORE-908` |
| `itm-team-teleport` | Team Teleport | swap places with the team mate on the lowest health | +50 | yes | `TC-CORE-909` |
| `itm-bunge` | Bunge shot | 25 % more ground carved by this shot | +50 | yes | `TC-CORE-910` |
| `itm-power-up` | Power up | +33 % damage on this shot | +150 | yes | `TC-CORE-906` |
| `itm-thunder` | Thunder | lightning strikes a horizontal band at the aim point | +200 | yes | `TC-CORE-911` |
| `itm-teleport` | Teleport | move the caster up to 150 px, ignoring incline | +150 | yes | `TC-CORE-909` |

## Loadout rules

| Rule | Value | Oracle |
|---|---|---|
| Loadout cap | 11 items per match (total quantity, not per type) | `TC-MATCH-006` |
| Picker | ready-room grid, 9 per page, host can lock the loadout | `TC-ROOM-151` |
| Who resolves an effect | the **host** applies it and puts it in the snapshot (we have no server-side referee — `OQ-30`) | `TC-NET-044` |
| Delay interaction | the item's `delayCost` **plus the thinking time** (`+10 per second of the turn`, `tunables.md` § 2) is added to the caster's accumulated delay before the queue is re-sorted | `TC-CORE-901` |
| Untrusted input | the host validates `itemId` and the caster's remaining quantity before applying | `TC-NET-067` |

## Where the numbers come from

The delay column is the genre's own tempo scale, restated at our shot delay (~100): **Dual costs six shots**, Teleport,
Change Wind and Power up a shot and a half, Thunder two, Team Teleport and Bunge half, Energy up 1/2 a third and three
shots, and **Blood is free** — the price is 8 % of your health. The first version of this table had every item at +5…+40,
i.e. a fifth of a shot, which made the whole item economy free and removed the genre's central trade.

The effects follow the genre too, and two of them were modelled wrong until 2026-11-08: **Energy up heals** (it was
buying movement points), **Bunge Shot carves more ground** (it was a returning shell — the boomerang arc is a mobile
trait, not an item), **Change Wind reverses** rather than re-rolls, and **Team Teleport swaps** you with your weakest
team mate rather than rallying the team. `itm-teleport` still blinks 150 px instead of teleporting to where the shot
lands; that one needs the shot-then-teleport flow and is the remaining gap.

## The practice starter kit

A practice match has no room, so nobody has picked a loadout — and the tray used to open on an empty state in every
practice match a developer or a new player ever started (`US-MATCH-009`). `PRACTICE_LOADOUT`
(`apps/web/src/lib/plan.ts`) gives **both seats** the same five picks, six items in total, inside `LOADOUT_CAP`:

| Item | Quantity | Why it is in the kit |
|---|---|---|
| `itm-energy-1` | 2 | The heal, so a practice match can show a health swing without ending |
| `itm-change-wind` | 1 | The one item that changes a rule rather than a number |
| `itm-power-up` | 1 | The damage buff, the simplest effect to see on the numbers |
| `itm-bunge` | 1 | Terrain carving — the only item that edits the map |
| `itm-teleport` | 1 | Mobility, which exercises the movement rules |

The bot carries the same kit on purpose: a practice match is symmetric, and the bot's item heuristic
(`packages/core/src/bot.ts`) then has something to spend. A real room's loadout always wins — this kit is only for a match
that has no room behind it.
