# Gameplay tunables

The numbers our build uses, in two halves: **integrator** values (the ballistics model the original uses, `ADR-0007`) and **rule**
values that follow the genre conventions described in [`reference-gunbound.md`](reference-gunbound.md). Approved scope:
**package B — full genre depth** (`OQ-36`), including a playtested physics replica (`OQ-37`).

Every value lives in `packages/core/src/tuning.ts` (`TUNABLES`), versioned by `rulesetVersion` (`NFR-23`); changing one is a `!`
change under `01-overview/conventions.md` § 8. `[assumption: OQ-19]` = our invention; `[OQ-37]` = physics replica
parameter tuned by playtest.

## 1. Integrator — our ballistics model

A shot is **angle + bar**; the simulation turns that into a trajectory. We chose a **constant-acceleration parabola with
per-machine gravity and a per-machine wind coefficient, and no drag** (`ADR-0007`, `CR-2026-11-13-gb-original-ballistics`):
the bar is `0…4` for every mobile, the arc is not — `weight` and `windDrag` are machine stats, so a heavy hull drops its
shell sooner and a draggy one is pushed further by the same weather. A fixed 25 ms step keeps it deterministic across
devices (`NFR-28`). What separates the seventeen mobiles is the **firing envelope** (the angle band, § 4.2), the
`weight`/`windDrag` pair and the shell in the slot.

Units are **world units and seconds**; the world is `2,000 × 1,200`. A ruler division is **1 phần = 100 units**, and a
screen's eight parts are **1 màn = 800 units** (§ 9), so a map is 2.5 màn wide.

### 1.1 Equations

Launch, at the unit's muzzle (`t = 0`) — **one power law for every mobile**:

```
bar      clamp(bar, 0, 4)
v0      = bar × BAR_VELOCITY                    // BAR_VELOCITY = 232.335 u/s per bar
vx      =  cos(angle) × v0 × facing
vy      = −sin(angle) × v0

g       = BASE_GRAVITY × weight / GRAVITY_WEIGHT        // 390 × weight / 5.78
k       = WIND_COEFFICIENT × windDrag / WIND_DRAG_REFERENCE²   // 0.222 × windDrag / 0.046²
windEff = m × WIND_EFFECT                               // m = 0…26, WIND_EFFECT = 0.95
ax      = k × windEff × cos θ
ay      = −k × windEff × sin θ                          // negative = an upward push

vy += (g + ay) × dt                                     // a_y = g − k·windEff·sin θ
```

Wind is **horizontal only**, drawn as the genre draws it: a magnitude `m` on `0…26` and one of **two directions**,
`θ = sector × 180` — `sector 0` = east (`0°`), `sector 1` = west (`180°`), and the dial shows `E` or `W`. The genre has
no vertical wind: `ay` is `0` in play and the general form is kept only for a map gimmick that would ever need it.

The wind coefficient is **proportional to the machine's drag**: a heavier, draggier hull is pushed *more*, which is what
makes the wind a per-machine correction rather than one roster-wide number.

| `windDrag` | `k` | meaning |
|---|---|---|
| `0.0460` (the reference; `mbl-04`, `mbl-10`, `mbl-19`) | **4.826** | 1.00 × the reference push |
| `0.0555` (the weight twin `mbl-03`, `mbl-11`) | **5.822** | 1.21 × |
| `0.0950` (`mbl-20` Mist Raven) | **9.966** | **2.06 ×** — the draggiest hull in the roster |

`k = 0.222 × drag ÷ 0.046²`, i.e. `k = (0.222/0.046) × (drag/0.046)`: a 0.046 machine gets `4.826` and `mbl-20` gets
`9.966` (`TC-BAL-121`).

A machine with no `weight` or `windDrag` is **refused**, never defaulted: `gravityFor`/`windKFor` throw
`cannot resolve a shot: the machine has no weight` (or `windDrag`), so a half-built row cannot fire a mystery arc
(`TC-BAL-126`).

One step, fixed `stepMs = 25` — 40 Hz, tight enough that a fast shell cannot tunnel through terrain — and **no drag**:

```
vx += (ax + forceX) × dt;   vy += (g + ay) × dt
x  += vx × dt;              y  += vy × dt
```

The genre quantities, mapped onto ours:

| Genre concept | Convention | Ours |
|---|---|---|
| screen parts | ~8 parts across a screen, 1 part ≈ 100 px | 1 màn = 800 units, 1 phần = 100 units, ruler division 125 units (§ 9) |
| power bar | `0 … 4.0` | **the bar itself** `0…4`, `v0 = bar × 232.335`; there is no 0–100 force behind it (`TC-BAL-119`) |
| gravity | one value for the roster | **per machine**: `390 × weight ÷ 5.78` u/s² (`mbl-03` = the reference 390), `×0.95–1.05` by map (`gravityModifier`) |
| mass | the wind pushes every mobile alike | **`weight`**, and it sets gravity; the wind reads `windDrag` instead (`TC-BAL-120`, `TC-BAL-121`) |
| wind | magnitude `0…26`, **horizontal only** (east or west) | `k × m × 0.95 × (cos θ, −sin θ)`, `k` from the machine's `windDrag`, `θ = sector × 180` |
| drag | **none** | **none**: `windDrag` is a wind coefficient, not air resistance (`density`/`dragK` removed in `CR-2026-11-04-gb-constant-acceleration`) |

Impact — the segment `(x₀,y₀)→(x,y)` is intersected with the terrain polyline. On a hit the shell detonates (or bounces
with `bounceRestitution` when the class is `bounce`), the crater is carved (`terrainCarveRadius = 0.6 × radius`) and the
blast rings are tested:

```
d ≤ 0.4 R → tierPower 1.0      d ≤ 0.7 R → 0.6      d ≤ R → 0.3      else 0
damage = round(power × tierPower / defense)
shield absorbs first:  shield -= min(shield, damage);  hp -= damage − absorbed
```

Determinism (`NFR-28`): fixed step, integer-truncated trig inputs, no `Math.random()` in `core`, positions rounded to
`0.1` (`TC-CORE-040`, `TC-BAL-125`: the same shot twice is bit-for-bit identical).

**Calibration.** `mbl-03` (the reference weight 5.78, so `g = 390`) at **bar 4, 45°**, no wind → **2,203 units in
3.35 s** (measured on the real integrator at a 25 ms step; `v0 = 4 × 232.335 = 929.34` and `v0²/g = 2,214.5` before the
0.1 position quantum and the last partial step). On the map that is **1.10 map widths**, so full bar overshoots the
1,640-unit spawn separation on every mobile without throwing the shell off the world. `TC-BAL-123` pins it at
**2,214 ± 20 units and 3.37 ± 0.05 s**.

**Why these constants.** They are solved from the source game's own feel targets rather than picked: the bar is 0–4 as in
GB, the reference machine's full-bar 45° shot carries ~2,214 units and hangs ~3.4 s, which puts the 1,640-unit spawn
separation at **bar ≈ 3.4** with a **~2.9 s** hang — a bar with usable room above the shot and a turn that resolves in a
few seconds. Gravity is expressed through `weight` so the roster's spread is a stat, not a hidden roster-wide constant;
`GRAVITY_WEIGHT = 5.78` is the machine whose weight reproduces `390 u/s²`.

**Full wind (`m = 26`, `θ = 0°`) moves that landing point `+814 units` east and `−808` west** — six and a half ruler
divisions, two fifths of the map. `a_x = k × 26 × 0.95 = 143.8 u/s²` for the reference machine (0.37 × its gravity) and
`½·a·t² = 807` over the 3.35 s hang, so the measured 814 is the wind term plus the changed ground contact
(`TC-BAL-124`: the measurement matches `½·k·24.7·t²` within 5 %). The figures a player feels are pinned by
`TC-BAL-123` / `TC-BAL-124` / `TC-CORE-960`, so a retune cannot land silently. For reference,
`drift ≈ ½ · k · 0.95 · m · t²`.
Wind is now **per machine**: the drift column of [`data/mobiles.md`](../data/mobiles.md) § 4 spreads `124–513 units` at
a `10`-unit wind, from the machine's own `k` and its hang time (`mbl-20` drifts 513, `mbl-05` 124).

> **What is measured and what is ours.** Nothing here is copied from another product: the structure is a textbook
> parabola and every number is a design target fixed by the calibration point above and by playtest (`OQ-37`). The spread
> across the seventeen mobiles is deliberate — it comes from `weight`/`windDrag`, the envelope and the shell (`ADR-0007`).

> **Conflict in the source, recorded not hidden.** `gbw-spec.md#6.3` pairs `force × 512/100` with `gravity 0.35` on a
> 2,000-unit map. Taken per tick, `0.35 × 20 = 7 u/s²`, which throws a full-force 45° shot ~37,000 units — 18× the map.
> `ADR-0007` keeps the genre's speed law (`v0 = bar × 232.335`) and a per-machine gravity in `u/s²`, because the pair as
> written cannot both be true (`OQ-19`); the old `speedK 5.9` / `gravity 152` / `windCoefficient 1.0` triple of
> 2026-11-05 is retired and refused by ruleset (`TC-BAL-127`).

### 1.2 Tunables

| Tunable | v1 value | Notes | Oracle |
|---|---|---|---|
| `stepMs` | `25` | fixed simulation step (40 Hz), chosen so the flight of a shot is reproducible on every device; rendering interpolates at 60 FPS (`NFR-01`, `NFR-28`) | `TC-CORE-020` |
| `BASE_GRAVITY` | **`390 u/s²`** | gravity of the reference weight; a machine's own `g = 390 × weight ÷ 5.78`, bent by the map's `gravityModifier` (`×0.95–1.05`) | `TC-BAL-120` |
| `GRAVITY_WEIGHT` | `5.78` | the weight that reproduces 390 (`mbl-03`, `mbl-11`) | `TC-BAL-120` |
| `BAR_VELOCITY` | `232.335 u/s per bar` | one power law: `v0 = bar × 232.335`, so bar 4 is `929.34 u/s` | `TC-BAL-119` |
| `WIND_COEFFICIENT` | `0.222` | `k = 0.222 × windDrag ÷ 0.046²`; the constant is solved to keep the reference machine at `4.826` | `TC-BAL-121` |
| `WIND_DRAG_REFERENCE` | `0.046` | the reference drag: `k(0.046) = 4.826`, `k(0.0950) = 9.966` | `TC-BAL-121` |
| `WIND_EFFECT` | `0.95` | the wind term is `k × m × 0.95`; with `m = 26` the reference machine gets `143.8 u/s²` | `TC-BAL-124` |
| `windMagnitude` | `0…26` integers | rolled per round (§ 1.3); `0` = no wind, `26` = full | `TC-CORE-926` |
| `windSectors` | `2` | **east or west only**: `directionDeg = sector × 180` (`0` / `180`), `sector` 0–1, `sectorLabel` → `E`/`W` (`OQ-41`) | `TC-CORE-926` |
| `turnDurationMs` | `20 000` | the turn clock (`OQ-03`) | `TC-CORE-152` |
| `weatherRerollPerRound` | `true` | new wind after every full pass through the turn queue | `TC-CORE-926` |
| ~~`speedK`~~, ~~`gravity`~~, ~~`windCoefficient`~~ | **removed** | replaced by `BAR_VELOCITY`, `BASE_GRAVITY` + `GRAVITY_WEIGHT`, `WIND_COEFFICIENT` + `WIND_DRAG_REFERENCE` (`ADR-0007`) | `TC-BAL-119`…`TC-BAL-124` |
| ~~`mass`~~ | **removed** | the wind reads `windDrag` and gravity reads `weight`; there is no `Mobile.mass` and no `StepContext.mass` | `TC-CORE-925` |
| `bar` | `0…4.0` (clamped, quantised to `0.01` on the wire) | `v0 = bar × 232.335`; every mobile shares the scale | `TC-BAL-119` |
| `angle` | clamped to the profile envelope (§ 4.2) | per mobile | `TC-CORE-022` |
| `bounceRestitution` | `0.6` | `bounce` class only; others detonate on impact | `TC-CORE-913` |
| `terrainCarveRadius` | `0.6 × blastRadius` | crater carving | `TC-CORE-914` |
| `maxFlightMs` | `12 000` | miss fallback, turn passes (was `10 000`) | `TC-CORE-028` |
| `mapBounds` | `2000×1200` | camera follows the projectile | `TC-MATCH-901` |
| `roundTo` | `0.1` | keeps snapshots inside `NFR-04` | `TC-CORE-040` |
| `powerBarMax` | `4` | the top of the bar; `barFromPower` clamps to it | `TC-BAL-119` |

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
| damage | `round(power × tierPower × attack × blood × matchup / defense)`; shield absorbs first | falls off across rings, and the weapon type meets the hull class | `TC-CORE-903` |
| weapon-type matchup | `ARMOR_MATRIX`: one armour class at `+15…20 %`, one at `−10 %`, one neutral per damage type (`data/mobiles.md` § 5) | weapon type vs armour class | `TC-CORE-933` |
| friendly fire | on | on (unverified) | `TC-CORE-027` |
| death | HP 0 → `eliminated`, skipped by the queue | yes | `TC-CORE-027` |

## 3. Turn scheduling — delay queue

| Tunable | v1 | Meaning | Oracle |
|---|---|---|---|
| `baseDelay` | per mobile 90–120 | starting weight | `TC-CORE-901` |
| `weaponDelay` | shot 1 `100`, shot 2 `120`, super shot `200` | added when the shot is fired | `TC-CORE-901` |
| `itemDelay` | per item `+0…+600` (`data/items.md`) | added when the item is used | `TC-CORE-901` |
| `thinkingDelayPerSecond` | `4` | **GB adds delay for every second the turn takes**, so deliberating costs queue position; measured from the turn's own start (`turnStartedAt`) and capped at the turn length. It was `10`, which made an 18 s turn cost 180 delay — three quarters of a shot, and enough that a careful player fell a full turn behind an instant bot every six turns (measured 2026-11-09) | `TC-CORE-901` |
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

Every mobile shares the *same* power law (§ 1.1: `v0 = bar × 232.335`) but **not** the same arc: gravity is a machine
stat read from `weight`, and the wind coefficient from `windDrag`. The profile still fixes only the **aim band** — the
angular territory the mobile is allowed to work in — so a mobile's reach is its band × its weight, and the shell picks
the behaviour.

| Profile | Band | Reads as | Mobiles |
|---|---|---|---|
| `standard` | −10 … 45 | the baseline GB arc, 45°-friendly | Stone Sentinel, Jade Dragon, Pale Stag, Sacred Crane |
| `direct` | −20 … 25 | flat and fast — the tightest band, so no 45° reference shot | Storm Falcon, Cinder Fox, Sky Serpent, Mist Raven |
| `lobber` | 35 … 85 | high arc that clears walls | River Warden, Glacier Mammoth |
| `mortar` | 45 … 88 | plunging fire, no low-angle answer | Ash Behemoth, Sand Wyrm, Frost Hydra |
| `skimmer` | −5 … 40 | low and bouncy, ricochets on terrain | Iron Tortoise, Moon Hare, Coral Crab, Shadow Cat |

The band is the *outer* limit; each mobile declares its own `angleMin`/`angleMax` inside it (`data/mobiles.md` § 2) —
`Storm Falcon` stops at 25°, `Jade Dragon` reaches 50°, `Cinder Fox` fires from −18°. The clamp always uses the mobile's
window, never the profile's.

**One power law, seventeen arcs.** At bar 4 and 45° each machine lands where its own weight puts it: the 4.20-weight
`mbl-15` reaches **3,034 units in 4.6 s**, the reference 5.78-weight `mbl-03` **2,202 units in 3.35 s** (at its 38°
window edge), and the 7.50-weight `mbl-01` **1,696 units in 2.6 s**. The band decides which angles exist at all, so a
mobile capped at 25° (`Storm Falcon`) cannot use the 45° reference shot.
[`data/mobiles.md`](../data/mobiles.md) § 4 prints all seventeen from the real integrator.

### 4.3 What separates the seventeen mobiles

The roster is differentiated by the **aim band** (§ 4.2), the **`weight`/`windDrag` pair** (§ 1.1), the **shell** in each
slot (`data/mobiles.md` § 3), and the health/defense/movement profile (`data/mobiles.md` § 1–2). The bar is the same 0–4
for everyone, so a bar learned on one mobile transfers; what the player must re-learn is where that bar lands.

| Lever | Range across the roster | Note |
|---|---|---|
| aim band | `−20…25` (`direct`) to `45…88` (`mortar`) | decides which angles exist for that mobile |
| `weight` | 4.20–7.50 | sets gravity, so it sets reach: 1,696–3,034 units at bar 4 |
| `windDrag` | 0.0403–0.0950 | sets the wind coefficient: `k` 4.23–9.97 |
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
buys position with tempo. See `data/mobiles.md` § 2 for the seventeen values and `US-CORE-008` for the guards.

## 5. Modes

| Mode | Win condition | Extra state | Oracle |
|---|---|---|---|
| `solo` | last team with a living player | — | `TC-CORE-027` |
| `score` | highest damage total at the round cap (12 turns each) | `score[team]` | `TC-CORE-915` |
| `tag` | teams take whole-team turns; last team standing | `activeTeam` | `TC-CORE-916` |
| `jewel` | collect jewels from the map, enemy kills transfer them | `jewels[]`, `carried[]` | `TC-CORE-917` |

## 6. Maps and gimmicks

Eleven maps in `packages/core/src/data/maps.ts`, each with a `gravityModifier` of `0.95–1.05` applied to the machine's own
gravity (`§ 1.1`), a `seed` and its `gimmicks[]`.

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
| `manWidth` | **800 units** | one screen, the unit every distance is spoken in (`US-BAL-001`) |
| `partsPerMan` | **8** | one part = `manWidth / partsPerMan` = **100 units**; the map is 2.5 màn |
| `viewDefault` | 800 × `800 / aspect` | the window is exactly one screen wide; the canvas aspect buys height, never width (`US-BAL-002`) |
| framing | follows the active mobile | at the start of a turn the window centres on the shooting mobile and keeps its feet ~70 % down the frame; the opponent is off screen past one màn, by design |
| follow | the shell in the air | after a release the camera rides the shot to its impact, eased 18 % a frame; the next turn's framing waits for it |
| `measureReturnMs` | **2500 ms** | a measure zoom (whole map) closes itself; a press while it is open only closes it and fires nothing |
| `zoomMin` (widest) | whole map, 2000 units | the measure view |
| `zoomMax` (closest) | 250 units wide | a 44-unit crater fills the ring, so aim can be placed precisely |
| `panClamp` | window edge never leaves `mapBounds` | no lost player, no off-map void |
| `pinchThreshold` | 12 px separation change | distinguishes a pan from a zoom |
| `powerDragFull` | 0.45 × the shorter screen edge | full power is one comfortable thumb sweep, not a corner-to-corner drag |
| `powerDeadzone` | 0.3 | a release below this cancels the shot (`OQ-38`) |
| power → bar | `bar = round(power × 100) / 100`, clamped `0…4` | the power bar shows 0.0–4.0 and the wire field `bar` **is** that number (`US-BAL-005` AC3) |
| `powerRingRadius` | 64 px screen | always the same size, so the number inside is readable while zooming |
| `padRing` | 96 px from the sprite | the four-way pad never covers the mobile or the barrel |
| `rulerSegments` | `clamp(round(visibleWidth / 100), 8, 24)` | one division is one part at every zoom: 8 at one screen, 20 at the whole map |
| `rulerUnit` | **100 units** (one part) | the label is the part's number on the map, not an offset |
| `interpolateMs` | 100 ms | the screen draws one state behind and catches up within this gap — a state that lands mid-blend continues from the drawn pixel instead of jumping (`US-MATCH-001` AC2) |
| ~~`previewDots`~~ | ~~24~~ | **superseded 2026-11-13 by `previewSteps`** (`US-BAL-003`): a fixed dot count said nothing about the flight — a 200-unit lob and a 2 000-unit shot got the same number of dots |
| `previewSteps` | **10** | dots per aid preview, one per equal **time** step (`dt = flightMs / 10`) — a tick a player can count against the wind (`US-BAL-003` AC3) |
| `previewDotMinPx` | **6 px** | ticks closer than this on screen are dropped; at low power a 25 ms step is a smear |
| `previewClip` | the camera window | the aid's arc is clipped at the window's left/right edge, and no tick or blast ring is drawn at the crossing (`US-BAL-003` AC1) |

**Why the ruler doubles.** A single part scale cannot serve both views: 125-unit divisions would be unreadable at the whole
map, and 62.5-unit divisions would be noise at half map. Doubling the division count keeps one division at ~125 world
units across most of the zoom range while the *labels* stay honest about the changing scale — and it mirrors the genre's habit of
measuring a map in screen parts rather than one fixed grid (`reference-gunbound.md` § 10).

**Why power is shown as 0–4.** It is the scale genre players already read off their own power bar, and the integrator
consumes the same quantity — the bar is the input, with no 0–100 force behind it (`US-BAL-004` AC1) — so a player tuning
by feel is tuning exactly what the physics uses. The gradient ring is the mobile-anchored replacement for the bar
everybody else draws along an edge:
it keeps the eye on the target instead of the corner of the screen.

## 10. What stays unverifiable

No published specification fixes damage, HP, wind or delay numbers for this genre, and no other product's data is part of
our basis (`OQ-18`). Every number above is a **design target**, to be replaced by playtest data (`US-OPS-003`,
`OQ-33`), never a measured value from another game.
