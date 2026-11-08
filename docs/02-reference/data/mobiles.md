# mobiles — the twenty playable mobiles

Twenty mobiles, each an **original** creature: artillery-game stat archetypes and three weapon slots, but our own names,
silhouettes and palettes (`OQ-18`: nothing copied from any existing game). Names are English; each references a mythical
beast from a real-world tradition without reproducing any existing character.

Every mobile has its **own firing envelope**, its **own shell loadout** and its **own movement allowance**: a trajectory
profile that sets the aim band, an individually tuned `angleMin`/`angleMax`, its own `maxPower` cap, three weapon slots,
and a per-turn movement budget (distance, number of moves, run multiplier, energy and delay cost). Gravity is not a
mobile stat: one `TUNABLES.gravity` covers the whole roster (`tunables.md` § 1.1), so the same angle and force draw the
same parabola on every mobile — what separates them is the envelope and the shell. HP and damage use the 1,000 scale
(`900–1,200` HP), which reads naturally on a mobile health bar.

Runtime copy: `packages/core/src/data/mobiles.ts`, versioned by `rulesetVersion` (`NFR-23`). Model source:
`` — see [`../gameplay/reference-gunbound.md`](../gameplay/reference-gunbound.md).

## Columns

| Field | Type | Meaning |
|---|---|---|
| `mobileId` | `TEXT` | `mbl-01` … `mbl-20` |
| `name` | string | English display name, rendered as-is (the roster's mobiles are proper nouns, like the maps' `id`); localising the twenty names is a follow-up, tracked on `US-ROOM-007` |
| `archetype` | enum | `balanced`, `tank`, `sniper`, `bombardier`, `bouncer`, `support`, `glass`, `all-rounder`, `zoner`, `trickster` — exactly two mobiles each |
| `trajectory` | enum | `standard`, `direct`, `lobber`, `mortar`, `skimmer` — the launch law the mobile starts from (§ 3) |
| `armor` | `plated` \| `bionic` \| `warded` | the hull class the weapon-type matchup reads (§ 5) — a counter-pick, not a stat | `TC-CORE-933` |
| `angleMin` / `angleMax` | degrees | **this mobile's** aim window, inside its profile's band; the aim is clamped to it |
| `maxHp` | int 900–1200 | health pool |
| `maxShield` | int 0–300 | shield pool, absorbs before HP |
| `shieldRegen` | int per turn | refill at turn start, capped at `maxShield` |
| `defense` | number 0.85–1.15 | incoming-damage divisor (higher = tankier) |
| `energy` | int 78–130 | movement budget for the whole match |
| `baseDelay` | int 90–120 | starting weight in the turn queue |
| `maxPower` | int 90–100 | cap on `force` |
| `moveDistance` | int 60–110 | px covered by one move action |
| `maxMovesPerTurn` | int 1–2 | move actions allowed in one turn |
| `runMultiplier` | number 1.5–1.9 | distance multiplier for a run, at double energy cost |
| `moveEnergy` | int 8–14 | energy a walk costs (a run costs twice) |
| `moveDelay` | int 8–14 | turn-queue delay a move adds |
| `maxIncline` | degrees 22–44 | climbable slope |
| `weapons[3]` | array | shot 1, shot 2, super shot — `class`, `power` (180–580), `radius` (38–130), `delay`. There is no per-shell mass and no drag (`tunables.md` § 1.1) |
| `effect` | enum | `explosion` \| `laser` \| `impact` \| `electric` |

## 1. Stats

| Id | Name | Archetype | Armor | HP | Shield | Regen | Def | Energy | Delay | Max power | Effect |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `mbl-01` | Stone Sentinel | balanced | warded | 1,050 | 150 | 20 | 1.00 | 105 | 100 | 98 | explosion |
| `mbl-02` | River Warden | support | warded | 1,000 | 300 | 40 | 0.90 | 100 | 110 | 94 | impact |
| `mbl-03` | Iron Tortoise | tank | plated | 1,200 | 200 | 20 | 1.15 | 80 | 120 | 92 | explosion |
| `mbl-04` | Glacier Mammoth | tank | plated | 1,150 | 250 | 30 | 1.12 | 85 | 118 | 90 | impact |
| `mbl-05` | Storm Falcon | sniper | bionic | 925 | 0 | 0 | 0.90 | 120 | 95 | 100 | laser |
| `mbl-06` | Silver Ibex | sniper | bionic | 950 | 50 | 0 | 0.92 | 125 | 93 | 100 | laser |
| `mbl-07` | Ash Behemoth | bombardier | plated | 1,100 | 100 | 0 | 1.00 | 90 | 115 | 96 | explosion |
| `mbl-08` | Volcano Toad | bombardier | plated | 1,075 | 150 | 10 | 0.98 | 88 | 113 | 95 | explosion |
| `mbl-09` | Moon Hare | bouncer | bionic | 975 | 100 | 10 | 0.95 | 115 | 105 | 98 | impact |
| `mbl-10` | Coral Crab | bouncer | bionic | 990 | 120 | 10 | 0.96 | 112 | 103 | 97 | laser |
| `mbl-11` | Pale Stag | all-rounder | warded | 1,020 | 280 | 40 | 0.92 | 102 | 108 | 94 | impact |
| `mbl-12` | Sacred Crane | support | warded | 980 | 260 | 30 | 0.90 | 104 | 106 | 95 | laser |
| `mbl-13` | Cinder Fox | glass | bionic | 900 | 0 | 0 | 0.85 | 130 | 90 | 100 | explosion |
| `mbl-14` | Sky Serpent | glass | bionic | 920 | 0 | 0 | 0.86 | 128 | 92 | 100 | laser |
| `mbl-15` | Jade Dragon | balanced | warded | 1,050 | 150 | 20 | 1.05 | 105 | 100 | 98 | explosion |
| `mbl-16` | Sun Lion | all-rounder | warded | 1,060 | 180 | 20 | 1.06 | 103 | 101 | 97 | explosion |
| `mbl-17` | Sand Wyrm | zoner | plated | 1,025 | 150 | 10 | 1.00 | 100 | 110 | 95 | impact |
| `mbl-18` | Frost Hydra | zoner | plated | 1,040 | 120 | 10 | 1.02 | 98 | 112 | 96 | impact |
| `mbl-19` | Shadow Cat | trickster | bionic | 950 | 100 | 10 | 0.95 | 125 | 95 | 96 | electric |
| `mbl-20` | Mist Raven | trickster | bionic | 940 | 80 | 10 | 0.94 | 128 | 93 | 95 | electric |

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
| `mbl-06` | Silver Ibex | direct | -15° … 30° | 105 px | 2 | ×1.8 | 9 | +9 | 42° |
| `mbl-07` | Ash Behemoth | mortar | 45° … 88° | 70 px | 1 | ×1.5 | 13 | +13 | 30° |
| `mbl-08` | Volcano Toad | mortar | 40° … 85° | 72 px | 1 | ×1.6 | 12 | +12 | 28° |
| `mbl-09` | Moon Hare | skimmer | -5° … 45° | 95 px | 2 | ×1.8 | 8 | +9 | 38° |
| `mbl-10` | Coral Crab | skimmer | 0° … 42° | 92 px | 2 | ×1.6 | 9 | +10 | 36° |
| `mbl-11` | Pale Stag | standard | -12° … 42° | 86 px | 2 | ×1.7 | 9 | +10 | 33° |
| `mbl-12` | Sacred Crane | standard | -8° … 48° | 88 px | 2 | ×1.7 | 10 | +10 | 34° |
| `mbl-13` | Cinder Fox | direct | -18° … 28° | 110 px | 2 | ×1.9 | 8 | +8 | 42° |
| `mbl-14` | Sky Serpent | direct | -16° … 32° | 108 px | 2 | ×1.9 | 8 | +8 | 44° |
| `mbl-15` | Jade Dragon | standard | -10° … 50° | 88 px | 2 | ×1.7 | 10 | +10 | 35° |
| `mbl-16` | Sun Lion | standard | -6° … 46° | 90 px | 2 | ×1.7 | 10 | +11 | 34° |
| `mbl-17` | Sand Wyrm | mortar | 48° … 88° | 80 px | 1 | ×1.6 | 12 | +12 | 33° |
| `mbl-18` | Frost Hydra | mortar | 42° … 86° | 78 px | 1 | ×1.6 | 12 | +13 | 31° |
| `mbl-19` | Shadow Cat | skimmer | -8° … 44° | 105 px | 2 | ×1.8 | 8 | +9 | 40° |
| `mbl-20` | Mist Raven | direct | -20° … 35° | 108 px | 2 | ×1.8 | 8 | +9 | 41° |

Examples of the spread: `mbl-13` Cinder Fox moves **110 px twice a turn** at ×1.9 but burns 900 HP and 8 energy per step;
`mbl-03` Iron Tortoise moves **60 px once** for 14 energy and +14 delay, but carries 1,200 HP and 200 shield. A margin,
a long aim window and a big movement budget never come together.

## 3. Weapons — three slots, three shells

`class power/radius dDelay`. Power is the Inner-tier damage before `defense`; `dDelay` is the turn-queue weight the shot
adds. A shell carries no weight of its own: there is no per-shell mass, no mobile `mass` and no drag
(`tunables.md` § 1.1), so the class and the power in the slot are the whole difference two shots can have.

| Id | Name | Shot 1 | Shot 2 | Super shot |
|---|---|---|---|---|
| `mbl-01` | Stone Sentinel | arc 240/80 d100 | warded | flat 220/70 d110 | arc 500/110 d200 |
| `mbl-02` | River Warden | arc 220/85 d100 | lob 210/95 d115 | cluster 460/120 d200 |
| `mbl-03` | Iron Tortoise | arc 250/90 d105 | plated | bounce 240/80 d120 | arc 520/120 d200 |
| `mbl-04` | Glacier Mammoth | lob 250/95 d112 | bounce 230/82 d118 | arc 510/118 d200 |
| `mbl-05` | Storm Falcon | flat 260/60 d100 | bionic | piercing 280/55 d115 | beam 480/40 d200 |
| `mbl-06` | Silver Ibex | flat 250/58 d98 | arc 270/65 d112 | beam 490/42 d198 |
| `mbl-07` | Ash Behemoth | lob 260/100 d110 | plated | cluster 240/90 d120 | lob 550/130 d200 |
| `mbl-08` | Volcano Toad | lob 250/98 d112 | bounce 230/85 d122 | cluster 540/128 d200 |
| `mbl-09` | Moon Hare | bounce 240/80 d100 | bionic | flat 220/65 d110 | bounce 500/110 d200 |
| `mbl-10` | Coral Crab | bounce 230/78 d102 | arc 220/70 d112 | beam 470/45 d198 |
| `mbl-11` | Pale Stag | arc 230/85 d100 | warded | flat 200/70 d110 | cluster 460/120 d200 |
| `mbl-12` | Sacred Crane | arc 210/82 d102 | beam 260/40 d120 | cluster 450/118 d200 |
| `mbl-13` | Cinder Fox | flat 300/60 d95 | bionic | arc 280/70 d110 | arc 580/90 d195 |
| `mbl-14` | Sky Serpent | flat 290/58 d96 | cluster 270/85 d118 | beam 560/44 d196 |
| `mbl-15` | Jade Dragon | arc 250/80 d100 | warded | piercing 270/60 d118 | arc 510/115 d200 |
| `mbl-16` | Sun Lion | arc 250/82 d100 | bounce 230/78 d116 | cluster 500/122 d200 |
| `mbl-17` | Sand Wyrm | lob 240/95 d108 | plated | piercing 260/60 d120 | cluster 500/125 d200 |
| `mbl-18` | Frost Hydra | lob 240/96 d110 | arc 250/80 d112 | lob 530/130 d200 |
| `mbl-19` | Shadow Cat | bounce 230/70 d98 | bionic | cluster 220/85 d116 | arc 460/100 d195 |
| `mbl-20` | Mist Raven | bounce 220/70 d98 | beam 250/42 d118 | beam 450/38 d196 |

No two mobiles share the same class triple, and every super shot hits harder than that mobile's shot 1 (1.8–2.0× power) at
the cost of double delay.

## 4. Trajectory — one gravity, so the envelope sets the arc

Gravity is a rule, not a mobile stat: one `TUNABLES.gravity` covers the whole roster and only the map's
`gravityModifier` bends it (`tunables.md` § 1.1). Every mobile therefore flies **the same parabola** at the same angle
and force (`TC-CORE-935`) — which is the genre's point: a range learned on one mobile transfers to the next. What
separates the twenty is the firing envelope (the angle window of § 2 and the `maxPower` cap) and the shell in the slot
(§ 3).

The table is computed by the real integrator (`tunables.md` § 1.1: pure parabola, no drag), at the mobile's `maxPower`,
at 45° or the nearest angle its window allows, in dead calm, on a flat probe, measured to the **first** ground contact,
the probe being 60,000 units wide so the shell lands instead of being clamped at the map edge — a `bounce` shell
rebounds afterwards, so its total travel is longer than the range below. The drift column is the same shot in a
`10`-unit wind on sector 0 (east): GB's wind carries no mass term, so the only mobile-side input is the hang time —
two mobiles fired at the same angle and force drift by exactly the same amount. At the shipped `windCoefficient` (0.8)
that is `0.5 × 8 × t²` units, so the column is simply the hang time squared: a full wind (26) bends the calibration
shot 763 units, six ruler divisions, and a `10` bends it by a sixth of that.

| Id | Name | Range at max power | Hang time | Drift at wind +10 |
|---|---|---|---|---|
| `mbl-01` | Stone Sentinel | **3,680 units** at 45° | warded | 8.6 s | 290 units |
| `mbl-02` | River Warden | **3,386 units** at 45° | 8.2 s | 271 units |
| `mbl-03` | Iron Tortoise | **3,150 units** at 38° | plated | 7.0 s | 193 units |
| `mbl-04` | Glacier Mammoth | **3,097 units** at 45° | 7.8 s | 253 units |
| `mbl-05` | Storm Falcon | **2,930 units** at 25° | bionic | 5.2 s | 109 units |
| `mbl-06` | Silver Ibex | **3,300 units** at 30° | 6.2 s | 158 units |
| `mbl-07` | Ash Behemoth | **3,519 units** at 45° | plated | 8.4 s | 288 units |
| `mbl-08` | Volcano Toad | **3,453 units** at 45° | 8.3 s | 280 units |
| `mbl-09` | Moon Hare | **3,680 units** at 45° | bionic | 8.6 s | 290 units |
| `mbl-10` | Coral Crab | **3,576 units** at 42° | 8.0 s | 264 units |
| `mbl-11` | Pale Stag | **3,369 units** at 42° | warded | 7.8 s | 235 units |
| `mbl-12` | Sacred Crane | **3,453 units** at 45° | 8.3 s | 280 units |
| `mbl-13` | Cinder Fox | **3,176 units** at 28° | bionic | 5.8 s | 132 units |
| `mbl-14` | Sky Serpent | **3,438 units** at 32° | 6.5 s | 171 units |
| `mbl-15` | Jade Dragon | **3,680 units** at 45° | warded | 8.6 s | 290 units |
| `mbl-16` | Sun Lion | **3,613 units** at 45° | 8.5 s | 281 units |
| `mbl-17` | Sand Wyrm | **3,436 units** at 48° | plated | 8.7 s | 305 units |
| `mbl-18` | Frost Hydra | **3,519 units** at 45° | 8.4 s | 288 units |
| `mbl-19` | Shadow Cat | **3,526 units** at 44° | bionic | 8.3 s | 275 units |
| `mbl-20` | Mist Raven | **3,237 units** at 35° | 6.7 s | 184 units |

The roster spans a factor of 1.26 in reach — `mbl-01`, `mbl-09` and `mbl-15` reach **3,680 units** at 45° where
`mbl-05` reaches **2,930** at 25° — and the `maxPower` cap (90–100) accounts for the middle of that spread. Drift spans
2.8× for one reason only: hang time. `mbl-17` hangs 8.7 s and drifts 39,968 units; `mbl-05` hangs 5.2 s and drifts
14,331. That is the roster's shape — low windows throw flat and short, high windows lob far and sit in the wind, and
the eleven mobiles whose window reaches 45° land at the same distance whenever they are given the same force.

## 5. Art brief (original silhouettes, AI-generated per `OQ-12`)

| Id | Name | Mythic motif | Silhouette | Palette |
|---|---|---|---|---|
| `mbl-01` | Stone Sentinel | Megalithic guardian (Mediterranean) | warded | broad shoulders, stone plated torso, single glowing eye slit | sandstone, moss green, iron grey |
| `mbl-02` | River Warden | Water guardian spirit (Vietnamese) | slim figure wrapped in flowing water ribbons | jade, pale gold, river blue |
| `mbl-03` | Iron Tortoise | World-bearing turtle (Chinese) | plated | low dome shell, stubby legs, heavy cannon on the shell | iron, bronze, dark red |
| `mbl-04` | Glacier Mammoth | Frozen colossus (Norse) | huge shaggy mass, tusks of ice, snow-capped back | ice white, slate, deep blue |
| `mbl-05` | Storm Falcon | Thunder bird (North American) | bionic | narrow wings, lightning-tipped beak, feather blades | storm grey, electric blue, white |
| `mbl-06` | Silver Ibex | Mountain climber (Alpine) | spiral horns, lean frame, hooves of polished silver | silver, charcoal, ice blue |
| `mbl-07` | Ash Behemoth | Volcanic beast (Mesopotamian) | plated | hunched back splitting into vents, glowing cracks | ash grey, ember orange, black |
| `mbl-08` | Volcano Toad | Fire-bellied toad (Mesoamerican) | wide squat body, throat sac, lava-veined skin | lava red, obsidian, sulphur yellow |
| `mbl-09` | Moon Hare | Lunar hare (East Asian) | bionic | long ears as stabilisers, spring-loaded legs | moon white, lilac, pearl grey |
| `mbl-10` | Coral Crab | Sea-shell walker (Pacific) | wide carapace, one heavy claw cannon, barnacle armour | coral pink, teal, sand |
| `mbl-11` | Pale Stag | White stag (Celtic) | warded | antlers carrying hanging lanterns, slender legs | bone white, forest green, gold |
| `mbl-12` | Sacred Crane | Longevity crane (Japanese) | long neck, folded wings, halo ring behind the head | vermilion, porcelain white, ink black |
| `mbl-13` | Cinder Fox | Nine-tailed fox (Korean) | bionic | multiple tails fanning out, low profile, flame tips | cinder orange, charcoal, cream |
| `mbl-14` | Sky Serpent | Feathered serpent (Mesoamerican) | coiled body, plume crest, wing-fins | turquoise, jade, obsidian |
| `mbl-15` | Jade Dragon | Oriental dragon (Vietnamese) | warded | long sinuous body, whiskers, pearl orb on the forehead | jade green, imperial gold, ivory |
| `mbl-16` | Sun Lion | Solar lion (Egyptian) | mane as a sun disc, straight forelegs, kohl markings | sun gold, lapis, terracotta |
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

Two mobiles per archetype give a safe pick and a sharper pick: e.g. `Iron Tortoise` (1,200 HP, 60 px, one move) versus
`Glacier Mammoth` (1,150 HP, 250 shield, 65 px, one move, more delay).

Within an archetype the two picks sit inside **±10 % of each other** on damage per delay (shot 1 power ÷ delay); across
archetypes the spread is deliberate — `mbl-12` Sacred Crane 2.06 at the bottom, `mbl-13` Cinder Fox 3.16 at the top —
because glass pays with 900 HP, no shield, 0.85 defense, and tanks pay with the lowest queue weight.

Movement is balanced on the same principle: `energy ÷ moveEnergy` is 6–14 walk actions per match, and a mobile that gets
two moves per turn always pays either more energy per move or a bigger delay. The spreadsheet beside the JSON
(`mobiles.balance.csv`, regenerated by `scripts/balance-report.mjs`) prints both bands (`TC-CORE-923`).

## Oracle

`packages/core/tests/mobiles.test.ts` — schema, clamps, angle windows, movement budgets, regen order, defense rounding,
unique class triples, per-mobile flight sample, damage-per-delay band (`TC-CORE-905`, `TC-CORE-923`, `TC-CORE-924`).