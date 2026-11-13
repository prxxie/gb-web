# mobiles — the seventeen playable mobiles

Seventeen mobiles, each an **original** creature: artillery-game stat archetypes and three weapon slots, but our own
names, silhouettes and palettes (`OQ-18`: nothing copied from any existing game). Names are English; each references a
mythical beast from a real-world tradition without reproducing any existing character. The roster shipped twenty until
2026-11-13; three rows were dropped and every surviving `mobileId` kept its number (`US-BAL-005` § 4).

Every mobile has its **own firing envelope**, its **own shell loadout**, its **own flight** and its **own movement
allowance**: a trajectory profile that sets the aim band, an individually tuned `angleMin`/`angleMax`, three weapon
slots, and a per-turn movement budget (distance, number of moves, run multiplier, energy and delay cost). Flight is a
mobile stat through two numbers, `weight` and `windDrag` (`tunables.md` § 1): gravity is `390 × weight ÷ 5.78` and the
wind coefficient is `0.222 × windDrag ÷ 0.046²`, so a heavy machine drops its shell sooner and a draggy one is pushed
further by the same wind (`ADR-0007`). HP and damage use the 1,000 scale (`900–1,200` HP), which reads naturally on a
mobile health bar.

Runtime copy: `packages/core/src/data/mobiles.ts`, versioned by `rulesetVersion` (`NFR-23`). Model source:
`` — see [`../gameplay/reference-gunbound.md`](../gameplay/reference-gunbound.md).

## Columns

| Field | Type | Meaning |
|---|---|---|
| `mobileId` | `TEXT` | `mbl-01` … `mbl-20` |
| `name` | string | English display name, rendered as-is (the roster's mobiles are proper nouns, like the maps' `id`); localising the seventeen names is a follow-up, tracked on `US-ROOM-007` |
| `archetype` | enum | `balanced` (2), `tank` (2), `sniper` (1), `bombardier` (1), `bouncer` (2), `support` (1), `glass` (2), `all-rounder` (1), `zoner` (2), `trickster` (2) — seventeen in all |
| `trajectory` | enum | `standard`, `direct`, `lobber`, `mortar`, `skimmer` — the launch law the mobile starts from (§ 3) |
| `armor` | `plated` \| `bionic` \| `warded` | the hull class the weapon-type matchup reads (§ 5) — a counter-pick, not a stat | `TC-CORE-933` |
| `angleMin` / `angleMax` | degrees | **this mobile's** aim window, inside its profile's band; the aim is clamped to it |
| `maxHp` | int 900–1200 | health pool |
| `maxShield` | int 0–300 | shield pool, absorbs before HP |
| `shieldRegen` | int per turn | refill at turn start, capped at `maxShield` |
| `defense` | number 0.85–1.15 | incoming-damage divisor (higher = tankier) |
| `energy` | int 78–130 | movement budget for the whole match |
| `baseDelay` | int 90–120 | starting weight in the turn queue |
| `weight` | number 4.20–7.50 | sets the machine's gravity: `390 × weight ÷ 5.78` u/s² (`tunables.md` § 1.4) |
| `windDrag` | number 0.0403–0.0950 | sets its wind coefficient: `0.222 × windDrag ÷ 0.046²` (§ 1.5) |
| `moveDistance` | int 60–110 | px covered by one move action |
| `maxMovesPerTurn` | int 1–2 | move actions allowed in one turn |
| `runMultiplier` | number 1.5–1.9 | distance multiplier for a run, at double energy cost |
| `moveEnergy` | int 8–14 | energy a walk costs (a run costs twice) |
| `moveDelay` | int 8–14 | turn-queue delay a move adds |
| `maxIncline` | degrees 22–44 | climbable slope |
| `weapons[3]` | array | shot 1, shot 2, super shot — `class`, `power` (180–580), `radius` (38–130), `delay`. A shell carries no mass of its own: the machine's `weight` sets the gravity it flies under and its `windDrag` the wind it feels (`tunables.md` § 1.1) |
| `effect` | enum | `explosion` \| `laser` \| `impact` \| `electric` |

## 1. Stats

| Id | Name | Archetype | Armor | HP | Shield | Regen | Def | Energy | Delay | Weight | Wind drag | Effect |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `mbl-01` | Stone Sentinel | balanced | warded | 1,050 | 150 | 20 | 1.00 | 105 | 100 | 7.50 | 0.0720 | explosion |
| `mbl-02` | River Warden | support | warded | 1,000 | 300 | 40 | 0.90 | 100 | 110 | 5.33 | 0.0512 | impact |
| `mbl-03` | Iron Tortoise | tank | plated | 1,200 | 200 | 20 | 1.15 | 80 | 120 | 5.78 | 0.0555 | explosion |
| `mbl-04` | Glacier Mammoth | tank | plated | 1,150 | 250 | 30 | 1.12 | 85 | 118 | 4.80 | 0.0460 | impact |
| `mbl-05` | Storm Falcon | sniper | bionic | 925 | 0 | 0 | 0.90 | 120 | 95 | 5.00 | 0.0480 | laser |
| `mbl-07` | Ash Behemoth | bombardier | plated | 1,100 | 100 | 0 | 1.00 | 90 | 115 | 6.50 | 0.0624 | explosion |
| `mbl-09` | Moon Hare | bouncer | bionic | 975 | 100 | 10 | 0.95 | 115 | 105 | 5.33 | 0.0512 | impact |
| `mbl-10` | Coral Crab | bouncer | bionic | 990 | 120 | 10 | 0.96 | 112 | 103 | 4.80 | 0.0460 | laser |
| `mbl-11` | Pale Stag | all-rounder | warded | 1,020 | 280 | 40 | 0.92 | 102 | 108 | 5.78 | 0.0555 | impact |
| `mbl-12` | Sacred Crane | support | warded | 980 | 260 | 30 | 0.90 | 104 | 106 | 5.50 | 0.0528 | laser |
| `mbl-13` | Cinder Fox | glass | bionic | 900 | 0 | 0 | 0.85 | 130 | 90 | 4.20 | 0.0403 | explosion |
| `mbl-14` | Sky Serpent | glass | bionic | 920 | 0 | 0 | 0.86 | 128 | 92 | 4.90 | 0.0470 | laser |
| `mbl-15` | Jade Dragon | balanced | warded | 1,050 | 150 | 20 | 1.05 | 105 | 100 | 4.20 | 0.0403 | explosion |
| `mbl-17` | Sand Wyrm | zoner | plated | 1,025 | 150 | 10 | 1.00 | 100 | 110 | 6.50 | 0.0624 | impact |
| `mbl-18` | Frost Hydra | zoner | plated | 1,040 | 120 | 10 | 1.02 | 98 | 112 | 6.00 | 0.0580 | impact |
| `mbl-19` | Shadow Cat | trickster | bionic | 950 | 100 | 10 | 0.95 | 125 | 95 | 4.80 | 0.0460 | electric |
| `mbl-20` | Mist Raven | trickster | bionic | 940 | 80 | 10 | 0.94 | 128 | 93 | 4.80 | 0.0950 | electric |

## 2. Aim window and movement — per mobile

`angleMin…angleMax` is the mobile's own window (the profile's band, narrowed or shifted); `move` is px per move action,
`moves` is actions per turn, `run` the run multiplier, `energy·move` the walk cost (run costs double), `delay·move` the
queue weight a move adds, `incline` the steepest slope it can climb.

| Id | Name | Trajectory | Angle window | Move | Moves/turn | Run | Energy/move | Delay/move | Incline |
|---|---|---|---|---|---|---|---|---|---|
| `mbl-01` | Stone Sentinel | standard | -10° … 45° | 88 px | 1 | ×1.5 | 12 | +12 | 35° |
| `mbl-02` | River Warden | lobber | 38° … 82° | 85 px | 2 | ×1.7 | 9 | +10 | 32° |
| `mbl-03` | Iron Tortoise | skimmer | -8° … 38° | 60 px | 1 | ×1.5 | 14 | +14 | 25° |
| `mbl-04` | Glacier Mammoth | lobber | 30° … 88° | 65 px | 1 | ×1.6 | 12 | +13 | 22° |
| `mbl-05` | Storm Falcon | direct | -20° … 25° | 100 px | 2 | ×1.7 | 10 | +9 | 40° |
| `mbl-07` | Ash Behemoth | mortar | 45° … 88° | 70 px | 1 | ×1.5 | 13 | +13 | 30° |
| `mbl-09` | Moon Hare | skimmer | -5° … 45° | 95 px | 2 | ×1.8 | 8 | +9 | 38° |
| `mbl-10` | Coral Crab | skimmer | 0° … 42° | 92 px | 2 | ×1.6 | 9 | +10 | 36° |
| `mbl-11` | Pale Stag | standard | -12° … 42° | 86 px | 2 | ×1.7 | 9 | +10 | 33° |
| `mbl-12` | Sacred Crane | standard | -8° … 48° | 88 px | 2 | ×1.7 | 10 | +10 | 34° |
| `mbl-13` | Cinder Fox | direct | -18° … 28° | 110 px | 2 | ×1.9 | 8 | +8 | 42° |
| `mbl-14` | Sky Serpent | direct | -16° … 32° | 108 px | 2 | ×1.9 | 8 | +8 | 44° |
| `mbl-15` | Jade Dragon | standard | -10° … 50° | 88 px | 2 | ×1.7 | 10 | +10 | 35° |
| `mbl-17` | Sand Wyrm | mortar | 48° … 88° | 80 px | 1 | ×1.6 | 12 | +12 | 33° |
| `mbl-18` | Frost Hydra | mortar | 42° … 86° | 78 px | 1 | ×1.6 | 12 | +13 | 31° |
| `mbl-19` | Shadow Cat | skimmer | -8° … 44° | 105 px | 2 | ×1.8 | 8 | +9 | 40° |
| `mbl-20` | Mist Raven | direct | -20° … 35° | 108 px | 2 | ×1.8 | 8 | +9 | 41° |

Examples of the spread: `mbl-13` Cinder Fox moves **110 px twice a turn** at ×1.9 but burns 900 HP and 8 energy per step;
`mbl-03` Iron Tortoise moves **60 px once** for 14 energy and +14 delay, but carries 1,200 HP and 200 shield. A margin,
a long aim window and a big movement budget never come together.

## 3. Weapons — three slots, three shells

`class power/radius dDelay`. Power is the Inner-tier damage before `defense`; `dDelay` is the turn-queue weight the shot
adds. A shell carries no mass of its own — the machine's `weight` sets the gravity it flies under and `windDrag` the wind
it feels — and there is no
per-shell drag (`tunables.md` § 1.1), so the class and the power in the slot are the whole difference two shots can have.

| Id | Name | Shot 1 | Shot 2 | Super shot |
|---|---|---|---|---|
| `mbl-01` | Stone Sentinel | arc 240/80 d100 | warded | flat 220/70 d110 | arc 500/110 d200 |
| `mbl-02` | River Warden | arc 220/85 d100 | lob 210/95 d115 | cluster 460/120 d200 |
| `mbl-03` | Iron Tortoise | arc 250/90 d105 | plated | bounce 240/80 d120 | arc 520/120 d200 |
| `mbl-04` | Glacier Mammoth | lob 250/95 d112 | bounce 230/82 d118 | arc 510/118 d200 |
| `mbl-05` | Storm Falcon | flat 260/60 d100 | bionic | piercing 280/55 d115 | beam 480/40 d200 |
| `mbl-07` | Ash Behemoth | lob 260/100 d110 | plated | cluster 240/90 d120 | lob 550/130 d200 |
| `mbl-09` | Moon Hare | bounce 240/80 d100 | bionic | flat 220/65 d110 | bounce 500/110 d200 |
| `mbl-10` | Coral Crab | bounce 230/78 d102 | arc 220/70 d112 | beam 470/45 d198 |
| `mbl-11` | Pale Stag | arc 230/85 d100 | warded | flat 200/70 d110 | cluster 460/120 d200 |
| `mbl-12` | Sacred Crane | arc 210/82 d102 | beam 260/40 d120 | cluster 450/118 d200 |
| `mbl-13` | Cinder Fox | flat 300/60 d95 | bionic | arc 280/70 d110 | arc 580/90 d195 |
| `mbl-14` | Sky Serpent | flat 290/58 d96 | cluster 270/85 d118 | beam 560/44 d196 |
| `mbl-15` | Jade Dragon | arc 250/80 d100 | warded | piercing 270/60 d118 | arc 510/115 d200 |
| `mbl-17` | Sand Wyrm | lob 240/95 d108 | plated | piercing 260/60 d120 | cluster 500/125 d200 |
| `mbl-18` | Frost Hydra | lob 240/96 d110 | arc 250/80 d112 | lob 530/130 d200 |
| `mbl-19` | Shadow Cat | bounce 230/70 d98 | bionic | cluster 220/85 d116 | arc 460/100 d195 |
| `mbl-20` | Mist Raven | bounce 220/70 d98 | beam 250/42 d118 | beam 450/38 d196 |

No two mobiles share the same class triple, and every super shot hits harder than that mobile's shot 1 (1.8–2.0× power) at
the cost of double delay.

## 4. Trajectory — the machine's own weight and drag set the arc

Flight is two per-machine numbers, not one roster rule (`ADR-0007`, `tunables.md` § 1): gravity is
`390 × weight ÷ 5.78` and the wind coefficient is `0.222 × windDrag ÷ 0.046²`, both bent only by the map's
`gravityModifier`. A heavy machine therefore flies **a shorter parabola than a light one** at the same bar — which is
the genre's point: the bar, not a per-machine power cap, is what a player learns. What separates the seventeen is the
firing envelope (the angle window of § 2), the weight and drag below, and the shell in the slot (§ 3).

The table is computed by the real integrator (`tunables.md` § 1.2: 25 ms step, pure parabola, no drag), at the mobile's
**bar 4**, at 45° or the nearest angle its window allows, in dead calm, on a flat probe, measured to the **first** ground
contact, the probe being 60,000 units wide so the shell lands instead of being clamped at the map edge — a `bounce`
shell rebounds afterwards, so its total travel is longer than the range below. `TC-BAL-136` pins every cell. The drift
column is the same shot in a `10`-unit wind on sector 0 (east): the wind acceleration is
`k × 10 × 0.95` with `k` the machine's own coefficient, so the drift is `0.5 × k × 9.5 × t²` — proportional to the
machine's drag and to the square of its hang time (`TC-CORE-925`).

Read the range column against the **1,640-unit spawn separation**: at bar 4 every machine throws between 1.03× and 1.85×
that separation, so full power reaches the enemy on every mobile without leaving the map. The calibration shot — `mbl-03`,
the reference weight 5.78 — lands **2,203 units** away after **3.35 s**; a full 26-unit wind moves it **+814 units**
east and **−808** west (`TC-BAL-123`, `TC-BAL-124`).

| Id | Name | Weight | Wind drag | Range at bar 4 | Hang time | Drift at wind +10 |
|---|---|---|---|---|---|---|
| `mbl-01` | Stone Sentinel | 7.50 | 0.0720 | **1,696 units** at 45° | 2.6 s | 242 units |
| `mbl-02` | River Warden | 5.33 | 0.0512 | **2,389 units** at 45° | 3.7 s | 342 units |
| `mbl-03` | Iron Tortoise | 5.78 | 0.0555 | **2,138 units** at 38° | 2.9 s | 237 units |
| `mbl-04` | Glacier Mammoth | 4.80 | 0.0460 | **2,654 units** at 45° | 4.1 s | 380 units |
| `mbl-05` | Storm Falcon | 5.00 | 0.0480 | **1,953 units** at 25° | 2.3 s | 124 units |
| `mbl-07` | Ash Behemoth | 6.50 | 0.0624 | **1,958 units** at 45° | 3.0 s | 280 units |
| `mbl-09` | Moon Hare | 5.33 | 0.0512 | **2,389 units** at 45° | 3.7 s | 342 units |
| `mbl-10` | Coral Crab | 4.80 | 0.0460 | **2,648 units** at 42° | 3.8 s | 331 units |
| `mbl-11` | Pale Stag | 5.78 | 0.0555 | **2,198 units** at 42° | 3.2 s | 275 units |
| `mbl-12` | Sacred Crane | 5.50 | 0.0528 | **2,315 units** at 45° | 3.5 s | 332 units |
| `mbl-13` | Cinder Fox | 4.20 | 0.0403 | **2,512 units** at 28° | 3.1 s | 191 units |
| `mbl-14` | Sky Serpent | 4.90 | 0.0470 | **2,336 units** at 32° | 3.0 s | 207 units |
| `mbl-15` | Jade Dragon | 4.20 | 0.0403 | **3,034 units** at 45° | 4.6 s | 435 units |
| `mbl-17` | Sand Wyrm | 6.50 | 0.0624 | **1,946 units** at 48° | 3.1 s | 312 units |
| `mbl-18` | Frost Hydra | 6.00 | 0.0580 | **2,122 units** at 45° | 3.2 s | 306 units |
| `mbl-19` | Shadow Cat | 4.80 | 0.0460 | **2,655 units** at 44° | 4.0 s | 364 units |
| `mbl-20` | Mist Raven | 4.80 | 0.0950 | **2,491 units** at 35° | 3.3 s | 513 units |

The roster spans a factor of **1.79** in reach — `mbl-15` Jade Dragon (weight 4.20, window reaching 45°) reaches
**3,034 units** where `mbl-01` Stone Sentinel (weight 7.50) reaches **1,696** — and weight is the whole of that spread:
the four 4.80-weight machines land within 0.4 % of each other at the same angle, and the two 4.20-weight machines are
twins. Drift spans **4.1×** for two reasons at once: a draggier machine (`mbl-20`, drag 0.0950, 2.06× the reference)
and a longer hang. `mbl-20` drifts 513 units where `mbl-05` drifts 124. That is the roster's shape — low windows throw
flat and short, high windows lob far and sit in the wind, and weight decides how far the lob goes.

## 5. Art brief (original silhouettes, AI-generated per `OQ-12`)

| Id | Name | Mythic motif | Silhouette | Palette |
|---|---|---|---|---|
| `mbl-01` | Stone Sentinel | Megalithic guardian (Mediterranean) | warded | broad shoulders, stone plated torso, single glowing eye slit | sandstone, moss green, iron grey |
| `mbl-02` | River Warden | Water guardian spirit (Vietnamese) | slim figure wrapped in flowing water ribbons | jade, pale gold, river blue |
| `mbl-03` | Iron Tortoise | World-bearing turtle (Chinese) | plated | low dome shell, stubby legs, heavy cannon on the shell | iron, bronze, dark red |
| `mbl-04` | Glacier Mammoth | Frozen colossus (Norse) | huge shaggy mass, tusks of ice, snow-capped back | ice white, slate, deep blue |
| `mbl-05` | Storm Falcon | Thunder bird (North American) | bionic | narrow wings, lightning-tipped beak, feather blades | storm grey, electric blue, white |
| `mbl-07` | Ash Behemoth | Volcanic beast (Mesopotamian) | plated | hunched back splitting into vents, glowing cracks | ash grey, ember orange, black |
| `mbl-09` | Moon Hare | Lunar hare (East Asian) | bionic | long ears as stabilisers, spring-loaded legs | moon white, lilac, pearl grey |
| `mbl-10` | Coral Crab | Sea-shell walker (Pacific) | wide carapace, one heavy claw cannon, barnacle armour | coral pink, teal, sand |
| `mbl-11` | Pale Stag | White stag (Celtic) | warded | antlers carrying hanging lanterns, slender legs | bone white, forest green, gold |
| `mbl-12` | Sacred Crane | Longevity crane (Japanese) | long neck, folded wings, halo ring behind the head | vermilion, porcelain white, ink black |
| `mbl-13` | Cinder Fox | Nine-tailed fox (Korean) | bionic | multiple tails fanning out, low profile, flame tips | cinder orange, charcoal, cream |
| `mbl-14` | Sky Serpent | Feathered serpent (Mesoamerican) | coiled body, plume crest, wing-fins | turquoise, jade, obsidian |
| `mbl-15` | Jade Dragon | Oriental dragon (Vietnamese) | warded | long sinuous body, whiskers, pearl orb on the forehead | jade green, imperial gold, ivory |
| `mbl-17` | Sand Wyrm | Serpent of the dunes (South Asian) | plated | hooded head, segmented body half-buried | ochre, burnt sienna, bone |
| `mbl-18` | Frost Hydra | Many-headed serpent (Slavic) | three necks, icicle spines, frozen scales | frost blue, white, steel |
| `mbl-19` | Shadow Cat | Night cat (West African) | bionic | sleek low body, tail with a blade, glowing eyes | charcoal, violet, copper |
| `mbl-20` | Mist Raven | Messenger raven (Northern European) | folded wings, scattered feathers, a mask-like face | slate, mist grey, ink |

Art rules: readable at 64 px, one dominant mass plus one silhouette hook (horns, shell, wings, tail, mane), palette of
three values so a phone screen keeps units distinguishable on every map, and no depiction copied from any existing game
or film. Each mobile renders in both team tints.

## 6. Rules

1. A mobile is chosen in the lobby and fixed for the match; duplicates are allowed (`TC-ROOM-153`).
2. The aim is clamped to the mobile's **own** `angleMin`/`angleMax` before the shot leaves the client, never on the host (`TC-CORE-022`).
3. A turn allows `maxMovesPerTurn` move actions; a walk costs `moveEnergy`, a run twice that and covers `moveDistance × runMultiplier` px. Movement stops at `maxIncline` and at the bounds (`TC-CORE-904`).
4. Every move adds `moveDelay` to the player's queue weight and the A/B/C check happens again before the shot (`TC-CORE-901`).
5. `energy` never regenerates during a match; at 0 the mobile can no longer move (`TC-CORE-904`).
6. `defense` divides incoming damage: `round(power × tierPower / defense)` (`TC-CORE-026`).
7. `shieldRegen` applies at the start of that player's turn, capped at `maxShield` (`TC-CORE-905`).
8. Balance edits touch JSON and bump `rulesetVersion`; nothing keys on `mobileId` in the rules (`NFR-29`).

## 7. Balance notes

Ten archetypes hold two picks and four hold one after the 2026-11-13 drop; a pair gives a safe pick and a sharper one,
e.g. `Iron Tortoise` (1,200 HP, 60 px, one move) versus `Glacier Mammoth` (1,150 HP, 250 shield, 65 px, one move, more
delay).

Within an archetype the two picks sit inside **±10 % of each other** on damage per delay (shot 1 power ÷ delay); across
archetypes the spread is deliberate — `mbl-12` Sacred Crane 2.06 at the bottom, `mbl-13` Cinder Fox 3.16 at the top —
because glass pays with 900 HP, no shield, 0.85 defense, and tanks pay with the lowest queue weight.

Movement is balanced on the same principle: `energy ÷ moveEnergy` is 6–14 walk actions per match, and a mobile that gets
two moves per turn always pays either more energy per move or a bigger delay. The spreadsheet beside the JSON
(`mobiles.balance.csv`, regenerated by `scripts/balance-report.mjs`) prints both bands (`TC-CORE-923`).

## Oracle

`packages/core/tests/mobiles.test.ts` — schema, clamps, angle windows, movement budgets, regen order, defense rounding,
unique class triples, per-mobile flight sample, damage-per-delay band (`TC-CORE-905`, `TC-CORE-923`, `TC-CORE-924`).