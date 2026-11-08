# Gameplay tunables

The numbers our build uses, in two halves: **integrator** values (the ballistics model we chose, `ADR-0005`) and **rule**
values that follow the genre conventions described in [`reference-gunbound.md`](reference-gunbound.md). Approved scope:
**package B — full genre depth** (`OQ-36`), including a playtested physics replica (`OQ-37`).

Every value lives in `packages/core/src/tuning.ts` (`TUNABLES`), versioned by `rulesetVersion` (`NFR-23`); changing one is a `!`
change under `01-overview/conventions.md` § 8. `[assumption: OQ-19]` = our invention; `[OQ-37]` = physics replica
parameter tuned by playtest.

## 1. Integrator — our ballistics model

A shot is **angle + power**; the simulation turns that into a trajectory. We chose a **constant-acceleration parabola
with one gravity for the whole roster, a wind term with no mass in it, and no drag** (`ADR-0005`): every mobile draws the
same parabola at the same angle and power — which is the genre's point, a range learned on one mobile transfers to the
next — and a fixed step keeps it deterministic across devices (`NFR-28`). What separates the twenty mobiles is the
**firing envelope** (the angle band and the `maxPower` cap, § 4.2) and the shell in the slot, not the arc.

Units are **world units and seconds**; the world is `2,000 × 1,200`.

### 1.1 Equations

Launch, at the unit's muzzle (`t = 0`) — **one power law for every mobile**, as in GB:

```
v0 = force × speedK                      // force 0…maxPower (90–100); speedK 6.2 everywhere
vx =  cos(angle) × v0 × facing
vy = −sin(angle) × v0

ax =  windCoefficient × m × cos θ        // 105 × m, no divisor: 2,730 u/s² at full wind
ay =  windCoefficient × m × sin θ        // 0 for GB's horizontal wind
vy += (gravity + ay) × dt                // gravity 100 u/s² for every mobile, towards +y (down)
```

Wind is **horizontal only**, drawn as the genre draws it: a magnitude `m` on `0…26` and one of **two directions**,
`θ = sector × 180` — `sector 0` = east (`0°`), `sector 1` = west (`180°`), and the dial shows `E` or `W`. The genre has
no vertical wind: a lobbed shot never hangs because the weather blew upwards, so `ay` is `0` in play and the formula
keeps its general shape only for a map gimmick that would ever need it. The push carries **no mass divisor** — in GB
the wind moves every mobile alike, so one wind reading means one correction whatever the mobile.

One step, fixed `stepMs = 50` — 20 Hz, the rate the genre runs at and a step small enough that a fast shell cannot tunnel
through terrain — and **no drag**: a shell carries no weight of its own, so two shots of the same class differ by power
alone:

```
vx += (ax + forceX) × dt;   vy += (gravity + ay) × dt
x  += vx × dt;              y  += vy × dt
```

The genre quantities, mapped onto ours:

| Genre concept | Convention | Ours |
|---|---|---|
| screen parts | ~8 parts across a screen, 1 part ≈ 100 px | 1 unit = 1 px, ruler division 125 units |
| power bar | `0 … 4.0` | `force 0 … maxPower`, `v0 = force × speedK`, shown as power `0.0–4.0` |
| gravity | one value for the roster, so the same angle and power land in the same place in every mobile | **`100 u/s²`** for all twenty, `×0.95–1.05` by map (`gravityModifier`) |
| mass | not a flight term in the genre: the wind pushes every mobile alike | **removed** — no `mass` field, no wind divisor (`TC-CORE-023`, `TC-CORE-925`) |
| wind | magnitude `0…26`, **horizontal only** (east or west), no mass term | `windCoefficient × m × (cos θ, sin θ)`, `windCoefficient = 105`, `θ = sector × 180` |
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

**Calibration.** `force 98` at `45°`, `gravity 100`, no wind → **3,680 units in 8.55 s** (measured on the real
integrator; `v0 = 98 × 6.2 = 607.6` and `v0² / g = 3,692` before the 0.1 position quantum): **1.84 map widths**, the
genre's "full power leaves the map" ceiling, with the long readable hang time GB shows. Every mobile draws exactly that
parabola at that angle and power (`TC-CORE-023`).

**Full wind (`m = 26`, `θ = 0°`) moves that landing point 760 units** — six ruler divisions, a sixth of the map —
because `a_x = 0.8 × 26 = 20.8 u/s²` (a fifth of gravity) and `½·a·t² = 769` over the 8.6 s hang. The coefficient is the
one number the mass-free model had to re-derive: the first pass kept the old `105`, which with no divisor meant
`2,730 u/s²` — 27 × gravity, and a calibration shot thrown 100,131 units. A wind reading a player has to respect is a
sixth of the map, not fifty of them. The two figures a player feels are both measured and pinned by
`TC-CORE-960` / `TC-CORE-023`, so the retune cannot land silently. For reference, `drift ≈ ½ · windCoefficient · m · t²`,
so restoring a **one-ruler-division** full-wind correction (`125 units`) on the new 8.55 s hang time needs
`windCoefficient ≈ 2 × 125 / (26 × 8.55²) ≈ 0.13`; ~5 % of a map (`100 units`) lands in the same order of magnitude.
Wind also no longer varies by mobile: the drift column of [`data/mobiles.md`](../data/mobiles.md) § 4 spreads
`14,331–38,510 units` at a `10`-unit wind, and the *only* input is hang time — `mbl-17` hangs 8.7 s, `mbl-05` 5.2 s.

> **What is measured and what is ours.** Nothing here is copied from another product: the structure is a textbook
> parabola and every number is a design target fixed by the calibration point above and by playtest (`OQ-37`). The spread
> across the twenty mobiles is deliberate — but it comes from the firing envelope and the shell, not from gravity: one
> gravity is what lets a player carry a learned angle/power pair from one mobile to the next.

> **Conflict in the source, recorded not hidden.** `gbw-spec.md#6.3` pairs `force × 512/100` with `gravity 0.35` on a
> 2,000-unit map. Taken per tick, `0.35 × 20 = 7 u/s²`, which throws a full-force 45° shot ~37,000 units — 18× the map.
> We keep the usual speed law of the genre (`v0 = force × speedK`, `speedK 6.2`, which throws a full-force shot 1.84 map
> widths — "full power leaves the map", the genre's own ceiling) and express gravity in `u/s²` (`100`), because the pair
> as written cannot both be true (`OQ-19`).

### 1.2 Tunables

| Tunable | v1 value | Notes | Oracle |
|---|---|---|---|
| `stepMs` | `50` | fixed simulation step, chosen so the flight of a shot is reproducible on every device; rendering interpolates at 60 FPS (`NFR-01`, `NFR-28`) | `TC-CORE-020` |
| `gravity` | **`100 u/s²` for the whole roster**; map modifier `×0.95–1.05` | one gravity, so the same angle and power draw the same parabola in every mobile — a learned range transfers (`TC-CORE-023`) | `TC-CORE-020` |
| ~~`mass`~~ | **removed** | was per mobile `118–169` and divided the wind push; GB's wind is mass-independent, and with it went `Mobile.mass` and `StepContext.mass` (`TC-CORE-925`) | `TC-CORE-925` |
| `speedK` | `6.2` for every mobile | one power law, as in GB; full power flies 1.84 map widths | `TC-CORE-924` |
| `windCoefficient` | `105` | `a = 105 × m × (cos θ, sin θ)`, **no divisor**: `m = 26` is `2,730 u/s²`, 27 × gravity, and the coefficient is still to be retuned against the 8.55 s hang time (§ 1.1) | `TC-CORE-023` |
| `windMagnitude` | `0…26` integers | rolled per round (§ 1.3); `0` = no wind, `26` = full | `TC-CORE-926` |
| `windSectors` | `2` | **east or west only**: `directionDeg = sector × 180` (`0` / `180`), `sector` 0–1, `sectorLabel` → `E`/`W` (`OQ-41`) | `TC-CORE-926` |
| `turnDurationMs` | `20 000` | the turn clock (`OQ-03`) | `TC-CORE-152` |
| `weatherRerollPerRound` | `true` | new wind after every full pass through the turn queue | `TC-CORE-926` |
| ~~`dragK`, `density` on a weapon~~ | **removed** | GB has no drag, and a shell carries no weight of its own (`CR-2026-11-04-gb-constant-acceleration`) | `TC-CORE-023` |
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
sector    = rng.int(0, 1)           // directionDeg = sector × 180: 0° east, 180° west
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
- The dial has **two halves**, `E` and `W` — GB's whole wind vocabulary. Direction is *never* a free angle: the dial
  shows which side the weather is on, and the `0…26` number beside it is what a player corrects with, against the ruler
  (§ 9) for a small wind and by degrees of angle once the push is large.

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
| `itemDelay` | per item `+0…+600` (`data/items.md`) | added when the item is used | `TC-CORE-901` |
| `thinkingDelayPerSecond` | `10` | **GB adds 10 to your delay for every second the turn takes**, so deliberating costs queue position; measured from the turn's own start (`turnStartedAt`) and capped at the turn length | `TC-CORE-901` |
| `ssCost` / `ssChargeDealt` / `ssChargeTaken` | `100` / `0.25` / `0.12` | the super-shot gauge: full is 100, a shot spends all of it, and damage fills it — twice as fast when you deal it | `TC-CORE-922` |
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

GB gives every mobile the *same* power law and the *same* gravity (§ 1.1). We do the same: the profile fixes only the
**aim band** — the angular territory the mobile is allowed to work in — and the arc is identical for all twenty at the
same angle and power, so the band and the shell are what is left to tell mobiles apart.

| Profile | Band | `speedK` | Reads as | Mobiles |
|---|---|---|---|---|
| `standard` | −10 … 45 | 6.2 | the baseline GB arc, 45°-friendly | Stone Sentinel, Jade Dragon, Pale Stag, Sacred Crane, Sun Lion |
| `direct` | −20 … 25 | 6.2 | flat and fast — the tightest band, so no 45° reference shot | Storm Falcon, Silver Ibex, Cinder Fox, Sky Serpent, Mist Raven |
| `lobber` | 35 … 85 | 6.2 | high arc that clears walls | River Warden, Glacier Mammoth |
| `mortar` | 45 … 88 | 6.2 | plunging fire, no low-angle answer | Ash Behemoth, Volcano Toad, Sand Wyrm, Frost Hydra |
| `skimmer` | −5 … 40 | 6.2 | low and bouncy, ricochets on terrain | Iron Tortoise, Moon Hare, Coral Crab, Shadow Cat |

The band is the *outer* limit; each mobile declares its own `angleMin`/`angleMax` inside it (`data/mobiles.md` § 2) —
`Storm Falcon` stops at 25°, `Jade Dragon` reaches 50°, `Cinder Fox` fires from −18°. The clamp always uses the mobile's
window, never the profile's.

**One arc, twenty bands.** At 45° and `force 98` every mobile lands on the same spot — **3,680 units in 8.55 s** — and
what the band changes is which angles it may fire at all: a mobile capped at 25° cannot use the 45° reference shot, so it
reaches 2,930 units at full power where a 45°-capable one reaches 3,680. [`data/mobiles.md`](../data/mobiles.md) § 4
prints all twenty from the real integrator.

### 4.3 What separates the twenty mobiles

There are no per-mobile flight parameters left: one `gravity`, one `speedK`, one `windCoefficient`. The roster is
differentiated by the **aim band** (§ 4.2), the **shell** in each slot (`data/mobiles.md` § 3), and the health/defense/
movement profile (`data/mobiles.md` § 1–2). That is deliberate — the spread the genre has is in what a mobile may *do*,
not in how a shell falls, which is what makes an angle/power table learned on one mobile readable on the next.

| Lever | Range across the roster | Note |
|---|---|---|
| aim band | `−20…25` (`direct`) to `45…88` (`mortar`) | decides which angles exist for that mobile |
| `maxPower` | 90–100 | the middle of the roster's 1.26× reach spread |
| `maxHp` / `defense` | 900–1,200 / 0.85–1.15 | how many hits it survives |
| shell classes | three per mobile, no two triples alike | arc / flat / lob / bounce / cluster / piercing / beam |

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

Eleven maps in `packages/core/src/data/maps.ts`, each with a `gravityModifier` of `0.95–1.05` applied to the one
`TUNABLES.gravity` (`§ 1.2`), a `seed` and its `gimmicks[]`.

| Gimmick | Effect | Oracle |
|---|---|---|
| `force` | pushes projectiles sideways with a constant field | `TC-CORE-918` |
| `gust` | periodic 4× wind spikes, announced in the HUD | `TC-CORE-918` |
| `electric` | every 3rd turn a random cell is struck for 150 damage | `TC-CORE-919` |
| `wind` | the round re-rolls twice and plays the second roll (`rollWeather(seed, round × 2)`) | `TC-CORE-023` |
| `return` | shots that leave the map return once with reduced power | `TC-CORE-913` |
| `heal` | standing within 200 units of the map centre (`HEAL_ZONE_X` 1000, `HEAL_ZONE_RADIUS` 200) heals 100 HP at turn start, capped at `maxHp` | `TC-CORE-919` |
| `fog` | blast markers hidden; aim arc shortened | `TC-MATCH-901` |
| tornado | fixed spawn point moves units 60 px per turn | `TC-CORE-919` |

## 7. Avatar bonuses

Worn avatars grant `+2…+8` to one stat (`attack` = damage multiplier, `defense`, `energy`, `delay` reduction), stacked
from the account's equipped parts and validated server-side at loadout time — `TC-AUTH-104`, `data/accounts.md`.

| Stat | Unit | Cap | Applied as |
|---|---|---|---|
| `attack` | percent | `+10` | damage `× (1 + attack/100)` |
| `defense` | percent | `+10` | incoming damage `÷ (1 + defense/100)` |
| `energy` | points | `+12` | added to the pool (`base + energy`), not a multiplier |
| `delay` | percent | `−8` | delay `× (1 − delay/100)` |

`AVATAR_CAPS` in `packages/core/src/data/avatars.ts` is the single source of these numbers (`TC-CORE-921`).

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
| `viewDefault` | 1000 × 600 units | half the map each way. Fixed height, aspect-following width: a 2.7:1 phone window is ~1617 × 600, so the window always matches the canvas and nothing is cropped |
| framing | follows the active mobile | at the start of a turn the window centres on the shooting mobile and keeps its feet ~70 % down the frame, so the shot has room to arc; a pan by the player overrides it until the next turn |
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
| `interpolateMs` | 100 ms | the screen draws one state behind and catches up within this gap — a state that lands mid-blend continues from the drawn pixel instead of jumping (`US-MATCH-001` AC2) |
| `previewDots` | 24 | how many dots the aim aid samples the resolved flight into — a dotted line, not a curve, so the count is drawing, not physics (`US-MATCH-005` AC2) |

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
