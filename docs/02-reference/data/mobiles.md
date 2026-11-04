# mobiles — the twenty playable mobiles

Twenty mobiles, each an **original** creature: artillery-game stat archetypes and three weapon slots, but our own names,
silhouettes and palettes (`OQ-18`: nothing copied from any existing game). Names are English; each references a mythical
beast from a real-world tradition without reproducing any existing character.

Every mobile has its **own ballistics**, its **own angle window** and its **own movement allowance**: a per-mobile
`gravity`/`mass` pair (`tunables.md` § 1.1 — our ballistics model), a trajectory profile that sets the aim band, an
individually tuned `angleMin`/`angleMax`, and a per-turn movement budget (distance, number of moves, run multiplier,
energy and delay cost). HP and damage use the 1,000 scale (`900–1,200` HP), which reads naturally on a mobile health bar.

Runtime copy: `packages/core/src/data/mobiles.ts`, versioned by `rulesetVersion` (`NFR-23`). Model source:
`` — see [`../gameplay/reference-gunbound.md`](../gameplay/reference-gunbound.md).

## Columns

| Field | Type | Meaning |
|---|---|---|
| `mobileId` | `TEXT` | `mbl-01` … `mbl-20` |
| `name` | string | English display name; localised in `apps/web/src/i18n` |
| `archetype` | enum | `balanced`, `tank`, `sniper`, `bombardier`, `bouncer`, `support`, `glass`, `all-rounder`, `zoner`, `trickster` — exactly two mobiles each |
| `trajectory` | enum | `standard`, `direct`, `lobber`, `mortar`, `skimmer` — the launch law the mobile starts from (§ 3) |
| `angleMin` / `angleMax` | degrees | **this mobile's** aim window, inside its profile's band; the aim is clamped to it |
| `gravity` | int 84–128 | **this mobile's gravity**, u/s² — its own feel knob (`gameplay/tunables.md` § 1.1) |
| `mass` | int 118–169 | divides wind push; the heavier the mobile, the less its shots drift |
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
| `weapons[3]` | array | shot 1, shot 2, super shot — `class`, `power` (180–580), `radius` (38–130), `delay` — shell weight is the mobile's `mass` |
| `effect` | enum | `explosion` \| `laser` \| `impact` \| `electric` |

## 1. Stats

| Id | Name | Archetype | `g` | `mass` | HP | Shield | Regen | Def | Energy | Delay | Max power | Effect |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `mbl-01` | Stone Sentinel | balanced | 100 | 168 | 1,050 | 150 | 20 | 1.00 | 105 | 100 | 98 | explosion |
| `mbl-02` | River Warden | support | 112 | 150 | 1,000 | 300 | 40 | 0.90 | 100 | 110 | 94 | impact |
| `mbl-03` | Iron Tortoise | tank | 118 | 169 | 1,200 | 200 | 20 | 1.15 | 80 | 120 | 92 | explosion |
| `mbl-04` | Glacier Mammoth | tank | 115 | 155 | 1,150 | 250 | 30 | 1.12 | 85 | 118 | 90 | impact |
| `mbl-05` | Storm Falcon | sniper | 86 | 132 | 925 | 0 | 0 | 0.90 | 120 | 95 | 100 | laser |
| `mbl-06` | Silver Ibex | sniper | 92 | 145 | 950 | 50 | 0 | 0.92 | 125 | 93 | 100 | laser |
| `mbl-07` | Ash Behemoth | bombardier | 128 | 165 | 1,100 | 100 | 0 | 1.00 | 90 | 115 | 96 | explosion |
| `mbl-08` | Volcano Toad | bombardier | 122 | 160 | 1,075 | 150 | 10 | 0.98 | 88 | 113 | 95 | explosion |
| `mbl-09` | Moon Hare | bouncer | 98 | 128 | 975 | 100 | 10 | 0.95 | 115 | 105 | 98 | impact |
| `mbl-10` | Coral Crab | bouncer | 106 | 152 | 990 | 120 | 10 | 0.96 | 112 | 103 | 97 | laser |
| `mbl-11` | Pale Stag | all-rounder | 102 | 160 | 1,020 | 280 | 40 | 0.92 | 102 | 108 | 94 | impact |
| `mbl-12` | Sacred Crane | support | 96 | 140 | 980 | 260 | 30 | 0.90 | 104 | 106 | 95 | laser |
| `mbl-13` | Cinder Fox | glass | 84 | 118 | 900 | 0 | 0 | 0.85 | 130 | 90 | 100 | explosion |
| `mbl-14` | Sky Serpent | glass | 90 | 126 | 920 | 0 | 0 | 0.86 | 128 | 92 | 100 | laser |
| `mbl-15` | Jade Dragon | balanced | 99 | 158 | 1,050 | 150 | 20 | 1.05 | 105 | 100 | 98 | explosion |
| `mbl-16` | Sun Lion | all-rounder | 104 | 169 | 1,060 | 180 | 20 | 1.06 | 103 | 101 | 97 | explosion |
| `mbl-17` | Sand Wyrm | zoner | 126 | 168 | 1,025 | 150 | 10 | 1.00 | 100 | 110 | 95 | impact |
| `mbl-18` | Frost Hydra | zoner | 124 | 162 | 1,040 | 120 | 10 | 1.02 | 98 | 112 | 96 | impact |
| `mbl-19` | Shadow Cat | trickster | 94 | 120 | 950 | 100 | 10 | 0.95 | 125 | 95 | 96 | electric |
| `mbl-20` | Mist Raven | trickster | 88 | 136 | 940 | 80 | 10 | 0.94 | 128 | 93 | 95 | electric |

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

## 3. Weapons — three slots, three masses

`class power/radius dDelay`. Power is the Inner-tier damage before `defense`; `dDelay` is the turn-queue weight the shot
adds. Shell weight is the **mobile's** `mass`, not a per-weapon field — GB has no per-shell mass and no drag
(`tunables.md` § 1.1).

| Id | Name | Shot 1 | Shot 2 | Super shot |
|---|---|---|---|---|
| `mbl-01` | Stone Sentinel | arc 240/80 d100 | flat 220/70 d110 | arc 500/110 d200 |
| `mbl-02` | River Warden | arc 220/85 d100 | lob 210/95 d115 | cluster 460/120 d200 |
| `mbl-03` | Iron Tortoise | arc 250/90 d105 | bounce 240/80 d120 | arc 520/120 d200 |
| `mbl-04` | Glacier Mammoth | lob 250/95 d112 | bounce 230/82 d118 | arc 510/118 d200 |
| `mbl-05` | Storm Falcon | flat 260/60 d100 | piercing 280/55 d115 | beam 480/40 d200 |
| `mbl-06` | Silver Ibex | flat 250/58 d98 | arc 270/65 d112 | beam 490/42 d198 |
| `mbl-07` | Ash Behemoth | lob 260/100 d110 | cluster 240/90 d120 | lob 550/130 d200 |
| `mbl-08` | Volcano Toad | lob 250/98 d112 | bounce 230/85 d122 | cluster 540/128 d200 |
| `mbl-09` | Moon Hare | bounce 240/80 d100 | flat 220/65 d110 | bounce 500/110 d200 |
| `mbl-10` | Coral Crab | bounce 230/78 d102 | arc 220/70 d112 | beam 470/45 d198 |
| `mbl-11` | Pale Stag | arc 230/85 d100 | flat 200/70 d110 | cluster 460/120 d200 |
| `mbl-12` | Sacred Crane | arc 210/82 d102 | beam 260/40 d120 | cluster 450/118 d200 |
| `mbl-13` | Cinder Fox | flat 300/60 d95 | arc 280/70 d110 | arc 580/90 d195 |
| `mbl-14` | Sky Serpent | flat 290/58 d96 | cluster 270/85 d118 | beam 560/44 d196 |
| `mbl-15` | Jade Dragon | arc 250/80 d100 | piercing 270/60 d118 | arc 510/115 d200 |
| `mbl-16` | Sun Lion | arc 250/82 d100 | bounce 230/78 d116 | cluster 500/122 d200 |
| `mbl-17` | Sand Wyrm | lob 240/95 d108 | piercing 260/60 d120 | cluster 500/125 d200 |
| `mbl-18` | Frost Hydra | lob 240/96 d110 | arc 250/80 d112 | lob 530/130 d200 |
| `mbl-19` | Shadow Cat | bounce 230/70 d98 | cluster 220/85 d116 | arc 460/100 d195 |
| `mbl-20` | Mist Raven | bounce 220/70 d98 | beam 250/42 d118 | beam 450/38 d196 |

No two mobiles share the same class triple, and every super shot hits harder than that mobile's shot 1 (1.8–2.0× power) at
the cost of double delay.

## 4. Trajectory — every mobile flies its own arc

Every mobile carries its own `gravity` and `mass` (§ 1) and every mobile shares one power law, so the same force produces
a different arc — exactly how GB differentiates its mobiles. The table is computed by the real integrator
(`tunables.md` § 1.1: pure parabola, no drag), at the mobile's `maxPower`, at 45° or the steepest angle its window
allows, in dead calm.

| Id | Name | `g` | `mass` | Range at max power | Hang time | Drift at wind +10 |
|---|---|---|---|---|---|---|
| `mbl-01` | Stone Sentinel | 100 | 168 | **1,988 units** at 45° | 6.3 s | 130 units |
| `mbl-02` | River Warden | 112 | 150 | **1,633 units** at 45° | 5.4 s | 107 units |
| `mbl-03` | Iron Tortoise | 118 | 169 | **1,441 units** at 38° | 4.4 s | 62 units |
| `mbl-04` | Glacier Mammoth | 115 | 155 | **1,458 units** at 45° | 5.0 s | 90 units |
| `mbl-05` | Storm Falcon | 86 | 132 | **1,844 units** at 25° | 4.5 s | 83 units |
| `mbl-06` | Silver Ibex | 92 | 145 | **1,949 units** at 30° | 4.9 s | 93 units |
| `mbl-07` | Ash Behemoth | 128 | 165 | **1,491 units** at 45° | 4.8 s | 78 units |
| `mbl-08` | Volcano Toad | 122 | 160 | **1,531 units** at 45° | 5.0 s | 86 units |
| `mbl-09` | Moon Hare | 98 | 128 | **2,029 units** at 45° | 6.4 s | 178 units |
| `mbl-10` | Coral Crab | 106 | 152 | **1,828 units** at 42° | 5.6 s | 112 units |
| `mbl-11` | Pale Stag | 102 | 160 | **1,793 units** at 45° | 5.9 s | 121 units |
| `mbl-12` | Sacred Crane | 96 | 140 | **1,946 units** at 45° | 6.4 s | 159 units |
| `mbl-13` | Cinder Fox | 84 | 118 | **2,043 units** at 28° | 5.1 s | 121 units |
| `mbl-14` | Sky Serpent | 90 | 126 | **2,162 units** at 35° | 5.8 s | 147 units |
| `mbl-15` | Jade Dragon | 99 | 158 | **2,008 units** at 45° | 6.4 s | 141 units |
| `mbl-16` | Sun Lion | 104 | 169 | **1,873 units** at 45° | 6.0 s | 117 units |
| `mbl-17` | Sand Wyrm | 126 | 168 | **1,475 units** at 48° | 5.1 s | 85 units |
| `mbl-18` | Frost Hydra | 124 | 162 | **1,539 units** at 45° | 5.0 s | 84 units |
| `mbl-19` | Shadow Cat | 94 | 120 | **2,028 units** at 44° | 6.5 s | 191 units |
| `mbl-20` | Mist Raven | 88 | 136 | **1,995 units** at 35° | 5.6 s | 128 units |

The roster spans a factor of 1.5 in reach (`mbl-14` 2,162 vs `mbl-03` 1,441) and 3× in wind sensitivity (`mbl-19` drifts
191 units, `mbl-03` only 62). That spread is the point: a roster needs a light mobile that flies far and blows in the wind
(`mbl-14`), a heavy one that throws short and straight (`mbl-03`), and everything between — and this roster contains both ends of that scale.
## 5. Art brief (original silhouettes, AI-generated per `OQ-12`)

| Id | Name | Mythic motif | Silhouette | Palette |
|---|---|---|---|---|
| `mbl-01` | Stone Sentinel | Megalithic guardian (Mediterranean) | broad shoulders, stone plated torso, single glowing eye slit | sandstone, moss green, iron grey |
| `mbl-02` | River Warden | Water guardian spirit (Vietnamese) | slim figure wrapped in flowing water ribbons | jade, pale gold, river blue |
| `mbl-03` | Iron Tortoise | World-bearing turtle (Chinese) | low dome shell, stubby legs, heavy cannon on the shell | iron, bronze, dark red |
| `mbl-04` | Glacier Mammoth | Frozen colossus (Norse) | huge shaggy mass, tusks of ice, snow-capped back | ice white, slate, deep blue |
| `mbl-05` | Storm Falcon | Thunder bird (North American) | narrow wings, lightning-tipped beak, feather blades | storm grey, electric blue, white |
| `mbl-06` | Silver Ibex | Mountain climber (Alpine) | spiral horns, lean frame, hooves of polished silver | silver, charcoal, ice blue |
| `mbl-07` | Ash Behemoth | Volcanic beast (Mesopotamian) | hunched back splitting into vents, glowing cracks | ash grey, ember orange, black |
| `mbl-08` | Volcano Toad | Fire-bellied toad (Mesoamerican) | wide squat body, throat sac, lava-veined skin | lava red, obsidian, sulphur yellow |
| `mbl-09` | Moon Hare | Lunar hare (East Asian) | long ears as stabilisers, spring-loaded legs | moon white, lilac, pearl grey |
| `mbl-10` | Coral Crab | Sea-shell walker (Pacific) | wide carapace, one heavy claw cannon, barnacle armour | coral pink, teal, sand |
| `mbl-11` | Pale Stag | White stag (Celtic) | antlers carrying hanging lanterns, slender legs | bone white, forest green, gold |
| `mbl-12` | Sacred Crane | Longevity crane (Japanese) | long neck, folded wings, halo ring behind the head | vermilion, porcelain white, ink black |
| `mbl-13` | Cinder Fox | Nine-tailed fox (Korean) | multiple tails fanning out, low profile, flame tips | cinder orange, charcoal, cream |
| `mbl-14` | Sky Serpent | Feathered serpent (Mesoamerican) | coiled body, plume crest, wing-fins | turquoise, jade, obsidian |
| `mbl-15` | Jade Dragon | Oriental dragon (Vietnamese) | long sinuous body, whiskers, pearl orb on the forehead | jade green, imperial gold, ivory |
| `mbl-16` | Sun Lion | Solar lion (Egyptian) | mane as a sun disc, straight forelegs, kohl markings | sun gold, lapis, terracotta |
| `mbl-17` | Sand Wyrm | Serpent of the dunes (South Asian) | hooded head, segmented body half-buried | ochre, burnt sienna, bone |
| `mbl-18` | Frost Hydra | Many-headed serpent (Slavic) | three necks, icicle spines, frozen scales | frost blue, white, steel |
| `mbl-19` | Shadow Cat | Night cat (West African) | sleek low body, tail with a blade, glowing eyes | charcoal, violet, copper |
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
