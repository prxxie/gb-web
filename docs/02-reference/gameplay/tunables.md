# Gameplay tunables

The numbers our build uses, in two halves: **integrator** values (the ballistics model we chose, `ADR-0005`) and **rule**
values that follow the genre conventions described in [`reference-gunbound.md`](reference-gunbound.md). Approved scope:
**package B — full genre depth** (`OQ-36`), including a playtested physics replica (`OQ-37`).

Every value lives in `packages/core/src/tuning.ts` (`TUNABLES`), versioned by `rulesetVersion` (`NFR-23`); changing one is a `!`
change under `01-overview/conventions.md` § 8. `[assumption: OQ-19]` = our invention; `[OQ-37]` = physics replica
parameter tuned by playtest.

## 1. Integrator — our ballistics model

A shot is **angle + power**; the simulation turns that into a trajectory. We chose a **constant-acceleration parabola
with per-mobile gravity and mass, wind divided by mass, and no drag term** (`ADR-0005`): no drag keeps the arc readable
and makes mass the only thing wind fights, and a fixed step keeps it deterministic across devices (`NFR-28`). Four
parameter families (§ 4.3) spread the twenty mobiles across the feel range, from flat-and-long to slow-and-lobby.

Units are **world units and seconds**; the world is `2,000 × 1,200`.

### 1.1 Equations

Launch, at the unit's muzzle (`t = 0`) — **one power law for every mobile**, as in GB:

```
v0 = force × speedK                      // force 0…maxPower (90–100); speedK 4.55 everywhere
vx =  cos(angle) × v0 × facing
vy = −sin(angle) × v0

ax =  windCoefficient × m × cos θ / mass          // GB:  a = wind / mass, resolved on both axes
ay = −gravity + windCoefficient × m × sin θ / mass //      g_eff = g − wind × sin(dir) / mass
```

Wind is **polar**, drawn as the genre draws it: a magnitude `m` on `0…26` and a direction `θ` quantised to **12 sectors
of 30°** (`θ = sector × 30`, `0°` = east/right, counter-clockwise, so `90°` = north/up). A wind blowing straight up
therefore *reduces* effective gravity, a wind blowing down adds to it — the vertical term is what makes a lobbed shot
hang or drop, and it is why the dial shows direction and not just strength.

One step, fixed `stepMs = 50` — 20 Hz, the rate the genre runs at and a step small enough that a fast shell cannot tunnel
through terrain — and **no drag**: shell weight is expressed through `mass` alone (a heavy shell drifts less, it is not
slowed more):

```
vx += ax × dt;   vy += ay × dt
x  += vx × dt;   y  += vy × dt
```

The genre quantities, mapped onto ours:

| Genre concept | Convention | Ours |
|---|---|---|
| screen parts | ~8 parts across a screen, 1 part ≈ 100 px | 1 unit = 1 px, ruler division 125 units |
| power bar | `0 … 4.0` | `force 0 … maxPower`, `v0 = force × speedK`, shown as power `0.0–4.0` |
| gravity | per mobile, so mobiles fly differently at the same power | per mobile `84 … 128 u/s²` |
| mass | per mobile, dividing the wind push | per mobile `118 … 169` |
| wind | magnitude `0…26` + direction angle (12 sectors), `a = wind / mass` | `windCoefficient × m × (cos θ, sin θ) / mass`, `windCoefficient = 42` |
| drag | **none** | **none** (`density` and `dragK` removed in `CR-2026-11-04-gb-constant-acceleration`) |

Impact — the segment `(x₀,y₀)→(x,y)` is intersected with the terrain polyline. On a hit the shell detonates (or bounces
with `bounceRestitution` when the class is `bounce`), the crater is carved (`terrainCarveRadius = 0.6 × radius`) and the
blast rings are tested:

```
d ≤ 0.4 R → tierPower 1.0      d ≤ 0.7 R → 0.6      d ≤ R → 0.3      else 0
damage = round(power × tierPower / defense)
shield absorbs first:  shield -= min(shield, damage);  hp -= damage − absorbed
```

Determinism (`NFR-28`): fixed step, integer-truncated trig inputs, no `Math.random()` in `core`, positions rounded to
`0.1` (`TC-CORE-040`).

**Calibration.** `force 98` at `45°`, `gravity 100`, `mass 168`, no wind → **1,988 units in 6.3 s**: one map width at
full power, with the long readable hang time GB shows. **Full wind (`m = 26`) at `θ = 0`** moves that landing point
**~129 units** — almost exactly one ruler division (`tunables.md` § 9), which is why the ruler and the wind dial belong
together: a player reads "full wind, one tick" and corrects by one division. Across the roster the drift at full wind is
**62–191 units** — Jade Dragon (`mass 118`) drifts most, Iron Tortoise (`169`) least — 3–10 % of the map: felt, still
aimable. A light-gravity mobile outranges a heavy one by ~50 % at the same power (`mbl-14` 2,162 vs `mbl-03` 1,441).

> **What is measured and what is ours.** Nothing here is copied from another product: the structure is a textbook
> parabola and every number is a design target fixed by the calibration point above and by playtest (`OQ-37`). The spread
> across the twenty mobiles is deliberate — it is what makes one mobile feel heavy and another floaty.

> **Conflict in the source, recorded not hidden.** `gbw-spec.md#6.3` pairs `force × 512/100` with `gravity 0.35` on a
> 2,000-unit map. Taken per tick, `0.35 × 20 = 7 u/s²`, which throws a full-force 45° shot ~37,000 units — 18× the map.
> We keep the usual speed law of the genre (`v0 = force × speedK`, `speedK` tuned to `4.55` so a full-force shot lands inside a 2,000-unit map) and express gravity in `u/s²` (`100`), because the pair as
> written cannot both be true (`OQ-19`).

### 1.2 Tunables

| Tunable | v1 value | Notes | Oracle |
|---|---|---|---|
| `stepMs` | `50` | fixed simulation step, chosen so the flight of a shot is reproducible on every device; rendering interpolates at 60 FPS (`NFR-01`, `NFR-28`) | `TC-CORE-020` |
| `gravity` | **per mobile `84–128 u/s²`** (`data/mobiles.md`); map modifier `×0.95–1.05` | the per-mobile feel knob | `TC-CORE-020` |
| `mass` | **per mobile `118–169`** | divides wind push; the heavier the mobile, the less it drifts | `TC-CORE-925` |
| `speedK` | `4.55` for every mobile | one power law, as in GB | `TC-CORE-924` |
| `windCoefficient` | `42` | `a = 42 × m × (cos θ, sin θ) / mass`; scaled so `m = 26` reproduces the previously tuned maximum push | `TC-CORE-023` |
| `windMagnitude` | `0…26` integers | rolled per round (§ 1.3); `0` = no wind, `26` = full | `TC-CORE-926` |
| `windSectors` | `12` | `directionDeg` is always a multiple of 30; `sector` 0–11 (`OQ-41`) | `TC-CORE-926` |
| `turnDurationMs` | `20 000` | the turn clock (`OQ-03`) | `TC-CORE-152` |
| `weatherRerollPerRound` | `true` | new wind after every full pass through the turn queue | `TC-CORE-926` |
| ~~`dragK`, `density` on a weapon~~ | **removed** | GB has no drag; weight is `mass` (`CR-2026-11-04-gb-constant-acceleration`) | `TC-CORE-023` |
| `force` | `0…maxPower` (90–100 per mobile) | `v0 = force × speedK` | `TC-CORE-021` |
| `angle` | clamped to the profile envelope (§ 4.2) | per mobile | `TC-CORE-022` |
| `bounceRestitution` | `0.6` | `bounce` class only; others detonate on impact | `TC-CORE-913` |
| `terrainCarveRadius` | `0.6 × blastRadius` | crater carving | `TC-CORE-914` |
| `maxFlightMs` | `10 000` | miss fallback, turn passes | `TC-CORE-028` |
| `mapBounds` | `2000×1200` | camera follows the projectile | `TC-MATCH-901` |
| `roundTo` | `0.1` | keeps snapshots inside `NFR-04` | `TC-CORE-040` |

Physics fidelity is bounded twice over: the model is ours, tuned to a calibration point and then to playtest (`OQ-37`),
and it says nothing about damage, health or the delay queue. § 1 is the integrator with playtested constants; § 2 and § 3
carry our own numbers for health, damage and movement.

### 1.3 Weather — one roll per round

The wind is the weather, and it changes once per **round**: when the turn queue wraps and every player has acted,
`turn.round` increments and the host re-rolls

```
magnitude = rng.int(0, 26)
sector    = rng.int(0, 11)          // directionDeg = sector × 30
```

then broadcasts `weather { wind: { magnitude, directionDeg, sector }, rolledAtRound }` on the `control` channel and in
every snapshot until the next roll. Rules:

- **Within a round the wind is constant** — it is a planning constant, not a moving target, so a player can compute a
  shot while others act.
- **Across rounds it is unpredictable** — every round is a fresh roll, deterministically derived from the match `seed`
  and `round` (`NFR-28`), so a replay reproduces the same weather sequence (`TC-CORE-926`).
- **Announced once**: a 1.5 s banner (`match.weather.changed`), the number and the dial arrow animating to the new sector;
  dismissible by any tap (`US-MATCH-003`).
- **`m = 0` is legal** — a dead-calm round is a legitimate roll and the dial must read `0` with a hollow arrow.
- The dial has **12 ticks** (30° each) so a player can judge direction to ±15° and, with the ruler, correct a shot to
  within one division; direction is *never* a free angle — the dial shows the sector, not a hidden continuous value.

## 2. Health model — the 1,000 scale

Health in this genre reads in the hundreds-to-thousands, so we use a
1,000-point scale that keeps the same *feel*: four to six solid inner hits to remove a mobile.

| Field | v1 | Genre shape | Oracle |
|---|---|---|---|
| `maxHp` | per mobile **900–1,200** (`data/mobiles.md`) | per-mobile | `TC-CORE-025` |
| `maxShield` / `shieldRegen` | per mobile **0–300** / **0–40** | Max Shield, Shield regen amount | `TC-CORE-905` |
| `defense` | per mobile `0.85–1.15` | defense power | `TC-CORE-026` |
| `power` per weapon | **180–580** (Inner tier) | weapon `power` field | `TC-CORE-024` |
| blast tiers | **Inner / Mid / Outer** at `0.4` / `0.7` / `1.0` of radius, power `1.0` / `0.6` / `0.3` | three-tier blast model | `TC-CORE-024` |
| damage | `round(power × tierPower / defense)`; shield absorbs first | falls off across rings | `TC-CORE-903` |
| friendly fire | on | on (unverified) | `TC-CORE-027` |
| death | HP 0 → `eliminated`, skipped by the queue | yes | `TC-CORE-027` |

## 3. Turn scheduling — delay queue

| Tunable | v1 | Meaning | Oracle |
|---|---|---|---|
| `baseDelay` | per mobile 90–120 | starting weight | `TC-CORE-901` |
| `weaponDelay` | shot 1 `100`, shot 2 `120`, super shot `200` | added when the shot is fired | `TC-CORE-901` |
| `itemDelay` | per item `+5…+40` (`data/items.md`) | added when the item is used | `TC-CORE-901` |
| `moveDelay` | per mobile `+8…+14` per move action | movement is never free; it also costs queue position | `TC-CORE-904` |
| `maxMovesPerTurn` | per mobile `1` or `2` | how many move actions a turn allows | `TC-CORE-904` |
| `moveEnergy` | per mobile `8–14` per walk, ×2 per run | drawn from the match-long `energy` budget | `TC-CORE-904` |
| `runMultiplier` | per mobile `1.5–1.9` | a run covers more ground for double energy | `TC-CORE-904` |
| `maxIncline` | per mobile `22–44°` | steeper ground stops the move | `TC-CORE-904` |
| `turnDurationMs` | `20 000` (`OQ-03`) | one turn | `TC-MATCH-903` |
| `turnGraceMs` | `20 000` | one extension | `TC-CORE-152` |
| tie-break | lower slot index | deterministic | `TC-CORE-901` |
| roster display | delay ÷ 10, absolute for the active player, relative for others | GB shows `"%5d"` / `"%+5d"` | `TC-MATCH-903` |

## 4. Shot classes

Each mobile carries three weapons (`data/mobiles.md`). The classes below are the trajectory behaviours they resolve to.

| Class | Behaviour | Fuel for fidelity |
|---|---|---|
| `arc` | 45°-friendly parabola | the baseline shot of the genre |
| `flat` | low angle, high speed, shallow arc | direct-fire mobiles |
| `lob` | high angle, slow, long hang time | bombardment mobiles |
| `bounce` | detonates after 1–3 terrain bounces (`bounceRestitution`) | the bouncing archetype |
| `cluster` | splits into 3 sub-projectiles at apex | area denial |
| `piercing` | passes through terrain, detonates on the first unit hit | `piercing` attribute |
| `beam` | instant line, no arc, reduced by `defense` twice | `laser` effect type |
| super shot | one per match, always the mobile's biggest, `delayCost 200` | PSS |

### 4.2 Trajectory profiles — the angle envelope, not the speed

GB gives every mobile the *same* power law and differentiates them with `gravity` and `mass` (§ 1.1). We do the same: the
profile now fixes only the **aim band** — the angular territory the mobile is allowed to work in — and the arc itself comes
from the mobile's own `gravity`/`mass` pair.

| Profile | Band | `speedK` | Reads as | Mobiles |
|---|---|---|---|---|
| `standard` | −10 … 45 | 4.55 | the baseline GB arc, 45°-friendly, `g` near 100 | Stone Sentinel, Jade Dragon, Pale Stag, Sacred Crane, Sun Lion |
| `direct` | −20 … 25 | 4.55 | flat and fast — low `g`, light, needs line of sight | Storm Falcon, Silver Ibex, Cinder Fox, Sky Serpent, Mist Raven |
| `lobber` | 35 … 85 | 4.55 | high arc that clears walls, `g` 112–115 | River Warden, Glacier Mammoth |
| `mortar` | 45 … 88 | 4.55 | plunging fire, heaviest `g` (122–128) and most mass | Ash Behemoth, Volcano Toad, Sand Wyrm, Frost Hydra |
| `skimmer` | −5 … 40 | 4.55 | low and bouncy, ricochets on terrain | Iron Tortoise, Moon Hare, Coral Crab, Shadow Cat |

The band is the *outer* limit; each mobile declares its own `angleMin`/`angleMax` inside it (`data/mobiles.md` § 2) —
`Storm Falcon` stops at 25°, `Jade Dragon` reaches 50°, `Cinder Fox` fires from −18°. The clamp always uses the mobile's
window, never the profile's.

Every mobile therefore has its own arc, and the spread is large: `mbl-14` Sky Serpent lands **2,162 units** in 5.8 s,
`mbl-01` Stone Sentinel **1,988 units** in 6.3 s, `mbl-03` Iron Tortoise only **1,441 units** in 4.4 s
(`data/mobiles.md` § 3 prints all twenty from the real integrator).

### 4.3 Four parameter families

Our twenty mobiles are grouped into four parameter families, because a single family makes every mobile feel like the
same vehicle with different paint:

| Family | Mobiles | Note |
|---|---|---|
| `light-fast` | the baseline family: `g 100 / m 168` | the reference arc every other family is compared against |
| `mid` | the wide middle: per-mobile `g` and `m` from the same closed form | 12 of the 20 mobiles |
| `wind-sensitive` | its arc changes most when the weather rolls | two mobiles, low `mass` |
| `heavy-lobber` | high `mass`, high `g`, short reach | one archetype pair, the Ash Behemoth family |

Our mobiles are spread across that family range (`g` 84–128 in our units, `mass` 118–169), so the roster covers a
light-and-far pair, a heavy-arc pair, a mid-range pair and a defensive pair without any two sharing a triple.

### 4.4 Movement — per turn, paid in energy and delay

A mobile may reposition inside its turn (a direction plus a *run* flag, bounded by move
distance and climbable incline, and the move costs queue delay). Our rule:

```
walk:  distance = moveDistance            energy −= moveEnergy            delay += moveDelay
run:   distance = moveDistance × runMultiplier   energy −= moveEnergy × 2   delay += moveDelay
guard: movesThisTurn < maxMovesPerTurn, energy ≥ cost, slope ≤ maxIncline, inside mapBounds
```

| Quantity | Range across the roster | Example |
|---|---|---|
| `moveDistance` | 60–110 px per action | Iron Tortoise 60, Cinder Fox 110 |
| `maxMovesPerTurn` | 1–2 | tanks and mortars 1, skirmishers 2 |
| `runMultiplier` | ×1.5–1.9 | Iron Tortoise ×1.5, Cinder Fox ×1.9 |
| `moveEnergy` | 8–14 per walk | Iron Tortoise 14, Cinder Fox 8 |
| `energy` | 78–130 for the match | ≈6–14 walks per match |
| `moveDelay` | +8…+14 per move | a double-moving skirmisher loses queue position fast |

Energy never regenerates, so a mobile that spends its budget early becomes a fixed turret; the queue cost means movement
buys position with tempo. See `data/mobiles.md` § 2 for the twenty values and `US-CORE-008` for the guards.

## 5. Modes

| Mode | Win condition | Extra state | Oracle |
|---|---|---|---|
| `solo` | last team with a living player | — | `TC-CORE-027` |
| `score` | highest damage total at the round cap (12 turns each) | `score[team]` | `TC-CORE-915` |
| `tag` | teams take whole-team turns; last team standing | `activeTeam` | `TC-CORE-916` |
| `jewel` | collect jewels from the map, enemy kills transfer them | `jewels[]`, `carried[]` | `TC-CORE-917` |

## 6. Maps and gimmicks

Eleven maps in `packages/core/src/data/maps.ts`, each with a `gravityModifier` of `0.95–1.05` applied to the mobile's own gravity (`§ 1.2`), a `seed` and its `gimmicks[]`.

| Gimmick | Effect | Oracle |
|---|---|---|
| `force` | pushes projectiles sideways with a constant field | `TC-CORE-918` |
| `gust` | periodic 4× wind spikes, announced in the HUD | `TC-CORE-918` |
| `electric` | every 3rd turn a random cell is struck for 150 damage | `TC-CORE-919` |
| `wind` | wind re-rolls twice per turn instead of once | `TC-CORE-023` |
| `return` | shots that leave the map return once with reduced power | `TC-CORE-913` |
| `heal` | standing in the marked zone heals 100 HP at turn start | `TC-CORE-919` |
| `fog` | blast markers hidden; aim arc shortened | `TC-MATCH-901` |
| tornado | fixed spawn point moves units 60 px per turn | `TC-CORE-919` |

## 7. Avatar bonuses

Worn avatars grant `+2…+8` to one stat (`attack` = damage multiplier, `defense`, `energy`, `delay` reduction), stacked
from the account's equipped parts and validated server-side at loadout time — `TC-AUTH-104`, `data/accounts.md`.

## 8. Room

| Tunable | v1 | Genre | Oracle |
|---|---|---|---|
| capacity | `4, 6, 8` | `4, 6, 8` | `TC-ROOM-071` |
| teams | equal, host-picked | equal | `TC-ROOM-148` |
| mode / map | host picks | host picks | `TC-ROOM-151` |
| idle expiry | `10 min` | — | `TC-ROOM-123` |
| grace | `20 s` | — | `TC-ROOM-127` |
| loadout cap | `11` items | 11 | `TC-MATCH-006` |

## 9. Camera, zoom, ruler and the power ring

The match is fullscreen landscape with a **window** onto the 2000 × 1200-unit map (`screens/match.md` § Camera). These are
the numbers behind it.

| Constant | Value | Why |
|---|---|---|
| `viewDefault` | 1000 × 600 units | exactly half the map each way — the whole battlefield is reachable in two pans |
| `zoomMin` (widest) | whole map, 2000 × 1200 | the strategic view |
| `zoomMax` (closest) | 250 × 150 units (4 × default) | a 44-unit crater fills the ring, so aim can be placed precisely |
| `panClamp` | window edge never leaves `mapBounds` | no lost player, no off-map void |
| `pinchThreshold` | 12 px separation change | distinguishes a pan from a zoom |
| `powerDragFull` | 0.45 × the shorter screen edge | full power is one comfortable thumb sweep, not a corner-to-corner drag |
| `powerDeadzone` | 0.3 | a release below this cancels the shot (`OQ-38`) |
| power → force | `force = round(power × 25)` | the power bar shows 0–4.0, the wire field `force` is 0–100 |
| `powerRingRadius` | 64 px screen | always the same size, so the number inside is readable while zooming |
| `padRing` | 96 px from the sprite | the four-way pad never covers the mobile or the barrel |
| `rulerSegments` | `clamp(round(8 × visibleWidth / 1000), 8, 16)` | 8 divisions at the default window, 16 at full-map zoom |
| `rulerUnit` | visibleWidth / `rulerSegments` world units per division | 125 units at 1000-wide, 125 again at 2000-wide/16 |

**Why the ruler doubles.** A single part scale cannot serve both views: 125-unit divisions would be unreadable at the whole
map, and 62.5-unit divisions would be noise at half map. Doubling the division count keeps one division at ~125 world
units across most of the zoom range while the *labels* stay honest about the changing scale — and it mirrors the genre's habit of
measuring a map in screen parts rather than one fixed grid (`reference-gunbound.md` § 10).

**Why power is shown as 0–4.** It is the scale genre players already read off their own power bar, and the integrator
consumes the same quantity (`force = power × 25`), so a player tuning by feel is tuning exactly what the physics uses. The gradient ring is the mobile-anchored replacement for the bar everybody else draws along an edge:
it keeps the eye on the target instead of the corner of the screen.

## 10. What stays unverifiable

No published specification fixes damage, HP, wind or delay numbers for this genre, and no other product's data is part of
our basis (`OQ-18`). Every number above is a **design target**, to be replaced by playtest data (`US-OPS-003`,
`OQ-33`), never a measured value from another game.
