# GunBound-style artillery — the rules we adopt

The genre reference for this project: the rules a player of the classic turn-based artillery games expects, and the ones
v1 adopts. This file records **design intent**; the concrete values our build uses live in [`tunables.md`](tunables.md),
and scope changes are tracked by change requests in `docs/00-source/change-requests/`.

> **Sourcing.** Nothing here is copied from another product's code, assets, data files or binaries, and no third-party
> implementation is part of our basis (`OQ-18`). The rules below are genre conventions described in the client's own words
> and restated by us; the physics is a formula we derived and tuned (`ADR-0005`). Names, art, maps, items and mobiles are
> original to this project.

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
- A mobile's firing envelope is its own: minimum and maximum angle, maximum power, and an effect type
  (`explosion` / `laser` / `impact` / `electric`) for feedback.
- Movement is a turn action paid for with **energy**, bounded by the mobile's move distance and maximum incline
  (`US-CORE-008`).

## 4. Damage model

A blast resolves at a point, against every player within its radius:

1. the impact point is clamped inside the terrain bounds;
2. each target's distance from the blast selects its ring — Inner, Mid or Outer;
3. damage is `power × tierPower / defense`, absorbed by shield first, then HP;
4. the victim enters a short **shock** state (a hit reaction) rather than acting as if nothing happened;
5. terrain is carved where the shell landed (`US-CORE-006`).

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
| The ballistics integrator and its constants | we derive one ourselves (`ADR-0005`) and tune it by playtest (`OQ-37`) |
| Any art, audio, map data, item art or names | all original to this project (`OQ-18`) |
| Rules for 2-player and 3v3 lobbies | ours: the queue and delay model scale to any 2–8 count (`US-ROOM-003`) |
| A mobile input scheme | ours: touch-only, `CR-2026-11-04-touch-only-viewport` |

## 10. The physics model we chose

A **constant-acceleration** integrator with **per-mobile gravity and mass** — no drag, because a drag term makes the
arc feel mushy and hides the wind. It is the shape that produces the genre's readable shot: a long parabola, a visible
wind drift, and a mobile that feels heavy or floaty by its own numbers.

```
v0 = force × speedK                          // one power law for every mobile
ax =  windCoefficient × m × cos θ / mass
ay = −gravity + windCoefficient × m × sin θ / mass
```

Fixed **50 ms** step, positions rounded to 0.1, no `Math.random()` in the core (`NFR-28`). Calibration:
`force 98` at `45°`, `gravity 100`, `mass 168`, no wind → **1,988 units in 6.3 s** — one map width. Full wind
(`m = 26`, `sector 0`) moves that landing point **~129 units**, one ruler division. Values, units and the full parameter
table: [`tunables.md`](tunables.md) § 1.

**Why not something else** — the alternatives and the reasons they lost are in
[`ADR-0005`](../../04-decisions/adr/ADR-0005-gb-physics-replica.md): a general physics engine (non-deterministic across
devices, +300 KB against `NFR-03`), server-side authority (the 10 ms CPU limit on the free tier), precomputed tables
(free aim plus wind makes the table infinite).

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
| Weather per round, 12-sector wind | `US-CORE-015` | [`tunables.md`](tunables.md) § 1.3 |
