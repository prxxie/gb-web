# GunBound-style artillery — the rules we adopt

The genre reference for this project: the rules a player of the classic turn-based artillery games expects, and the ones
v1 adopts. This file records **design intent**; the concrete values our build uses live in [`tunables.md`](tunables.md),
and scope changes are tracked by change requests in `docs/00-source/change-requests/`.

> **Sourcing.** Nothing here is copied from another product's code, assets, data files or binaries, and no third-party
> implementation is part of our basis (`OQ-18`). The rules below are genre conventions described in the client's own words
> and restated by us; the **ballistics formula and its parameter table** are the original's, which the client restored to
> the basis on 2026-11-13 (`CR-2026-11-13`, `ADR-0007`), and no code, asset, data file or binary of that product enters
> the build. Names, art, maps, items and mobiles are original to this project.

## 1. Match shape

| Fact | Value | Why | Oracle |
|---|---|---|---|
| Players per match | up to **8**, slots 0–7 | 4v4 is the largest mode the client asked for | `TC-ROOM-122` |
| Room capacity | **4 / 6 / 8**, with **2** accepted for 1v1 | the client's own range (`OQ-16`) | `TC-ROOM-071` |
| Turn timer | **20 s** | client decision (`OQ-03`); the genre's 60 s is too slow for a 3–8 minute mobile match | `TC-CORE-152` |
| Simulation tick | **50 ms (20 Hz)** | a fixed step is what makes the integrator deterministic (`NFR-28`) | `TC-CORE-020` |
| Maps | **11** | enough variety for the four modes without a content pipeline | `TC-CORE-920` |
| Screen | landscape, 2000 × 1200-unit maps | client decision (`OQ-22`, `CR-2026-11-04-touch-only-viewport`) | `TC-MATCH-918` |

A turn is a short chain of beats — round start, movement, aim, fire, resolve, pass — rather than one message. That shape
is why `US-CORE-002` owns a turn state machine and `US-CORE-015` owns the weather that changes at round boundaries.

## 2. Turn order is a delay queue, not an alternation

This is the rule that most defines the genre, and the one we adopt:

- every mobile has a **base delay**; every weapon, item and movement action **adds to it**;
- turn order is a **priority queue on accumulated delay**, so a cheap shot lets you act again before a slow one does;
- the roster shows each seat's delay — absolute for the active player, signed relative for the others.

**Consequence:** heavy weapons cost you future turns. Two players can act twice in a row if their delays differ enough.
Turn order is a property of the loadout, not of the team. Implementation: `US-CORE-002` (`TurnQueue`, `delays`), with the
per-mobile base delay in [`../data/mobiles.md`](../data/mobiles.md).

## 3. The shot: angle and power only, three weapon slots

- A shot is **angle + power** — nothing else, so the aim gesture is the whole input (`US-MATCH-002`).
- Each mobile carries **three weapon slots**: weapon 1, weapon 2, and one **super shot** with its own class and shape
  (`US-CORE-007`, [`../data/mobiles.md`](../data/mobiles.md)).
- Every weapon has **power, blast radius and a three-tier falloff — Inner / Mid / Outer** — so damage drops across three
  rings rather than one radius (`US-CORE-003`).
- The power bar is the genre's `0…4.0` for every mobile; a mobile's firing envelope is its own minimum and maximum
  angle, plus an effect type (`explosion` / `laser` / `impact` / `electric`) for feedback. Its `weight` and `windDrag`
  decide how the shell flies (§ 10).
- Movement is a turn action paid for with **energy**, bounded by the mobile's move distance and maximum incline
  (`US-CORE-008`).

## 4. Damage model

A blast resolves at a point, against every player within its radius:

1. the impact point is clamped inside the terrain bounds;
2. each target's distance from the blast selects its ring — Inner, Mid or Outer;
3. damage is `power × tierPower / defense`, absorbed by shield first, then HP;
4. the victim enters a short **shock** state (a hit reaction) rather than acting as if nothing happened;
5. terrain is carved where the shell landed (`US-CORE-006`);
6. the weapon's **damage type meets the victim's armour class** before `defense` — the genre's counter-pick rule, so a
   roster is a matchup chart and not a list of bars (`TC-CORE-933`).

## 5. Items

Eleven battle items, bought/picked in the lobby and consumed during the match: Dual, Blood, Energy up 1, Energy up 2,
Dual+, Change Wind, Team Teleport, Bunge shot, Power up, Thunder, Teleport. Two properties matter for our design:

- **every item costs delay** — using one moves you back in the turn queue (`tunables.md` § 2);
- **effects resolve on the authoritative side**, not by the client claiming them (`US-CORE-009`).

A loadout is chosen before the match and capped (`US-ROOM-007`).

## 6. Game modes

Four modes share one engine and differ only in win condition and scoring: **Solo** (last team standing), **Score** (points
from hits), **Tag** (one active player per team at a time), **Jewel** (objective-based). We ship all four (`OQ-19`), each
as a *rules variant* of the same turn loop (`US-CORE-010`).

## 7. Stage gimmicks

Maps can carry gimmicks that change the physics for a round or a zone — **Force, Gust, Electric, Wind, Return, Heal, Fog** —
plus a tornado spawn point. Ours: eight gimmick types across eleven maps (`US-CORE-011`). The gimmick table lives in
[`tunables.md`](tunables.md) § 6.

## 8. Avatars

Equippable avatars grant small stat bonuses (attack or defense) on top of the mobile's own stats, so a player tunes a
build without changing the mobile. Ours: cosmetic-first, bonus-capped, and never able to exceed the balance band
(`US-CORE-013`).

## 9. What the genre does *not* give us

| Missing | Consequence for us |
|---|---|
| Every damage/HP number (they lived on servers that no longer exist) | we choose a 1,000-point scale and publish it in `tunables.md` |
| The ballistics integrator and its constants | the original's formula and parameter table are the basis again (`ADR-0007`, `CR-2026-11-13`); only its *damage* constants stay ours, and `OQ-37` still tunes by playtest |
| Any art, audio, map data, item art or names | all original to this project (`OQ-18`) |
| Rules for 2-player and 3v3 lobbies | ours: the queue and delay model scale to any 2–8 count (`US-ROOM-003`) |
| A mobile input scheme | ours: touch-only, `CR-2026-11-04-touch-only-viewport` |

## 10. The physics model we chose

A **constant-acceleration** integrator with **per-machine gravity and a per-machine wind coefficient** — no drag, because
a drag term makes the arc feel mushy and hides the wind. The bar is the genre's `0…4.0` for every mobile, and the arc is
a stat: a machine's `weight` sets its gravity and its `windDrag` sets how far the same wind carries it. That keeps the
genre's readable shot — one bar scale, a wind number you correct against — while the roster's mass differences stay
visible in the fall (`ADR-0007`, `CR-2026-11-13-gb-original-ballistics`).

```
bar  = clamp(bar, 0, 4)
v0   = bar × BAR_VELOCITY                  // 232.335 u/s per bar, one power law for every mobile
vx   =  cos(angle) × v0 × facing
vy   = −sin(angle) × v0
g    = BASE_GRAVITY × weight / GRAVITY_WEIGHT          // 390 × weight / 5.78
k    = WIND_COEFFICIENT × windDrag / WIND_DRAG_REFERENCE²   // 0.222 × windDrag / 0.046²
ax   =  k × m × WIND_EFFECT × cos θ        // WIND_EFFECT 0.95; θ ∈ {0°, 180°}
ay   = −k × m × WIND_EFFECT × sin θ        // 0 in play: GB's wind is horizontal
vy  += (g + ay) × dt                       // a_y = g − k·windEff·sin θ
```

Two deliberate departures from what this project shipped before:

- **Gravity is a machine stat read from `weight`.** It used to be `84–128 u/s²` per mobile, then one roster-wide value;
  `ADR-0007` restores the per-machine fall, but through one number the player can see rather than a hidden field: the
  reference `weight 5.78` reproduces the `390 u/s²` every balance target was tuned against, `mbl-03` and `mbl-11` are
  twins, and `Mobile.gravity` / `Mobile.mass` do not exist.
- **The wind push scales with the machine's own `windDrag`.** It used to be `42 × m / mass` (drift 62–191 units) and
  then one roster-wide coefficient; it is now `0.222 × windDrag ÷ 0.046²` — `4.826` for the
  reference drag, `9.966` for the draggiest hull, so a heavy hull is pushed *more*, not less. `windAcceleration` takes
  `(wind, k)` and the step context requires `windK`: there is no default and no mass argument.
- **The wind is horizontal.** Two directions, east (`sector 0`, `directionDeg 0`) and west (`sector 1`, `180`), because a
  shell in the genre never hangs because the weather blew upwards. Twelve 30° sectors were our own invention.

Fixed **25 ms** step, positions rounded to 0.1, no `Math.random()` in the core (`NFR-28`). Calibration, measured on the
real integrator: `mbl-03` (weight 5.78, so `g = 390`) at **bar 4 and 45°**, no wind → **2,203 units in 3.35 s**, i.e.
1.10 map widths — the genre's "full power leaves the map" ceiling, and every mobile at bar 4 clears the 1,640-unit spawn
separation. Full wind (`m = 26`, `sector 0`) puts `143.8 u/s²` on that shot (0.37 × its gravity) and moves the landing
point **+814 units east / −808 west**, two fifths of the map. Values, units (`1 màn = 800 u`, `1 phần = 100 u`) and the
full parameter table: [`tunables.md`](tunables.md) § 1; the per-mobile reach and drift table is
[`data/mobiles.md`](../data/mobiles.md) § 4.

**Why not something else** — the alternatives and the reasons they lost are in
[`ADR-0005`](../../04-decisions/adr/ADR-0005-gb-physics-replica.md) and
[`ADR-0007`](../../04-decisions/adr/ADR-0007-original-gb-ballistics.md): a general physics engine (non-deterministic
across devices, +300 KB against `NFR-03`), server-side authority (the 10 ms CPU limit on the free tier), precomputed
tables (free aim plus wind makes the table infinite).

## 11. Where each rule lives in this project

| Rule | Story | Reference |
|---|---|---|
| Delay queue turn order | `US-CORE-002` | [`../data/mobiles.md`](../data/mobiles.md) § 2 |
| Angle/power shot, three slots | `US-CORE-001`, `US-CORE-007` | [`tunables.md`](tunables.md) § 1 |
| Inner/Mid/Outer damage, shield, defense | `US-CORE-003` | [`tunables.md`](tunables.md) § 2 |
| Terrain carving | `US-CORE-006` | [`tunables.md`](tunables.md) § 3 |
| Movement and energy | `US-CORE-008` | [`tunables.md`](tunables.md) § 4.4 |
| Eleven items | `US-CORE-009` | [`../data/items.md`](../data/items.md) |
| Four modes | `US-CORE-010` | [`tunables.md`](tunables.md) § 7 |
| Stage gimmicks | `US-CORE-011` | [`tunables.md`](tunables.md) § 6 |
| Eleven maps | `US-CORE-012` | [`tunables.md`](tunables.md) § 5 |
| Avatar bonuses | `US-CORE-013` | [`tunables.md`](tunables.md) § 8 |
| Weather per round, east-or-west wind | `US-CORE-015` | [`tunables.md`](tunables.md) § 1.3 |
| The closed form of § 10, as a practice tool | `US-BAL-007` | [`../screens/practice.md`](../screens/practice.md) |
