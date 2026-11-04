---
id: CR-2026-11-04-gb-gameplay-fidelity
status: approved
requested_by: client (project owner)
date: 2026-11-04
---

# CR-2026-11-04-gb-gameplay-fidelity — make the gameplay follow GunBound as closely as possible

> **Amended 2026-11-05** — the citations this CR gathered were removed from the basis by
> [`CR-2026-11-05-no-decompile`](CR-2026-11-05-no-decompile.md). The decisions here stand: the values were already ours,
> only the provenance wording changed. This file is kept as the record of how the decision was reached.


## Request

> https://github.com/colemancda/GunBound-Decomp get gameplay here. i want it most likely gb as possible

Follow-up clarification of what "as GB as possible" can mean, given the source (asked 2026-11-04, answered same day):
the decompilation is the **client** and the client has no physics — it sends angle + power and the server owns trajectory,
damage, items and scoring. So GB can supply the *rules around the shot* but not the integrator.

## Impact

Supporting extraction: [`docs/02-reference/gameplay/reference-gunbound.md`](../../02-reference/gameplay/reference-gunbound.md).

### What the source changes in our current design

| Kind | Item | Change |
|---|---|---|
| Rule | Turn order | **Delay queue instead of team alternation.** Each mobile has a base delay and each item adds a delay term; turn order is sorted by accumulated delay, so weapon choice buys or costs turns `` |
| Rule | Weapons | Each mobile has **weapon 1, weapon 2 and one super shot**, each with power/shape/density/attribute in **Inner/Mid/Outer** tiers; mines and item shots exist too `` |
| Rule | Health | **HP + Shield + shield regen + defense stat**, not one flat HP bar `` |
| Rule | Movement | A turn action (direction + run flag) bounded by **move distance / max incline**, paid with **Energy** `` |
| Rule | Items | **11 battle items** (Dual, Blood, Energy up 1/2, Dual+, Change Wind, Team Teleport, Bunge shot, Power up, Thunder, Teleport) with a **Delay** cost each; loadout cap 11, picker 9 per page `` |
| Rule | Modes | **Solo / Score / Tag / Jewel** `` |
| Rule | Stages | Up to **11 maps** with per-map gimmicks **Force / Gust / Electric / Wind / Return / Heal / Fog** and a tornado spawn `` |
| Rule | Capacity | **4 / 6 / 8** slots, not 2–8 `` |
| Rule | Avatars | Worn avatars grant **stat bonuses**, not cosmetics only `` |
| Constraint | Ballistics | Must stay ours: no integrator, no gravity/wind/damage constants in the source |

### Doc impact

| Doc | Change |
|---|---|
| `01-overview/glossary.md` | + delay, turn queue, weapon slots 1/2/SS, shield, energy, movement, items, modes, gimmicks |
| `01-overview/nonfunctional-requirements.md` | + per-turn state budget (delay array, loadout), + 8-player item payload |
| `02-reference/gameplay/` | new layer: `reference-gunbound.md` (written) + `tunables.md` (to write) |
| `02-reference/data/room-state.md` | `Turn` gains `queue[]`, `delays[]`; member gains `loadout[]`, `energy`, `shield`, `weaponSlot` |
| `02-reference/data/mobiles.md` | **new** table: per-mobile HP/shield/energy/angles/maxPower/moveDistance/incline/baseDelay/defense + 3 weapons |
| `02-reference/data/items.md` | **new** table: 11 items, effect, delay cost, flags |
| `02-reference/api/signaling.md` | `input` grows `weaponSlot` and `move`; snapshot grows shield/energy/items |
| `02-reference/screens/lobby.md` | capacity 4/6/8, mode selector, map selector |
| `02-reference/screens/match.md` | weapon slots, item tray, movement controls, delay roster |
| `03-stories/*` | see below |
| `08-ops/slo.md`, `08-ops/runbook.md` | no change (SLIs are transport-level) |

### Story impact

| Story | Change |
|---|---|
| `US-CORE-001` | rewrite: three weapon profiles per mobile, per-weapon power/attribute, Inner/Mid/Outer blast — was one shot |
| `US-CORE-002` | rewrite: delay queue instead of strict alternation; movement phase; energy spend |
| `US-CORE-003` | rewrite: shield → HP → defense → three-tier falloff; items can modify |
| `US-CORE-004` | extend snapshot: shield, energy, loadout, weapon slot, queue |
| `US-CORE-005` | bot must pick weapons/items sensibly |
| `US-MATCH-002` | add weapon select + item tray |
| `US-MATCH-003` | roster shows delay and shield |
| `US-ROOM-001` | capacity 4/6/8 only; mode + map choice |
| `US-ROOM-002` | loadout step before ready |
| New stories | mobiles data + loadout, items and effects, movement, modes/scoring, stage gimmicks, maps, avatar bonuses |
| Unaffected | FND, AUTH, RANK, PWA, OPS, NET (transport) |

### Effort delta

| Option | Adds | Total | Schedule (2 devs, 130 dev-days) |
|---|---|---|---|
| **A — GB combat rules** (delay queue, 3 weapon slots, HP+shield+defense, Inner/Mid/Outer, movement+energy, 11 items, capacity 4/6/8) | +27 d | 106 d | ~16 weeks → **M3 slips 3 weeks** |
| **B — Full GunBound** (A + 4 modes + stage gimmicks + 11 maps + avatar bonuses) | +49 d | 111 d (re-estimated in W2–W7 planning) | 17 weeks → **M3 slips 4 weeks** |
| **C — Minimal GB feel** (delay queue + weapon 1/2/super shot only; no items, movement, shield) | +9 d | 88 d | ~13–14 weeks → M3 holds |

Rework is additive: no story is `done`, so nothing is invalidated. No data migration (no database yet).

### Decisions

| Id | Effect |
|---|---|
| `OQ-19` | answered — combat model documented from the source (§ above); remaining numbers are ours, see `tunables.md` |
| `OQ-36` | **new** — which option (A/B/C) is approved, and does the contract date move |
| `OQ-18` | unchanged: mechanics are reimplemented, no assets/names/maps/audio from GunBound; mobile *names* and art stay ours or licensed |
| `ADR-0004` | unchanged (topology P2P star); delay queue lives in core, not in the transport |

### Gates

`G1` (requirements baseline) re-opens: the match rules in the brief change. `G2` re-opens when the reference layer is
rewritten. `G3`/`G4` unaffected.

## Decision

**Approved 2026-11-04 by the client (project owner): option B — full GunBound, "also its physics".**

In scope: the delay turn queue, three weapon slots per mobile, HP + shield + regen + defense, Inner/Mid/Outer blast
tiers, movement with energy and incline, the eleven items, capacity 4/6/8, the four modes (Solo / Score / Tag / Jewel),
the eight stage gimmicks, eleven maps, avatar stat bonuses, and a **GunBound-shaped physics replica** in our own
integrator (`ADR-0005`, `OQ-37`).

Schedule as re-estimated after the stories were written: 79 → **111 story-days** across 51 stories (85 % of a 130
dev-day capacity), i.e. **17 weeks**. `M1` stays week 4 (the offline shot demo), `M2` moves to week 11, `M3` to
**week 17**; the contract renegotiation is tracked in `OQ-25` and the new date is `OQ-36`'s answer.

Limits accepted with the approval: no GunBound names, art, audio, maps or data files (`OQ-18` stays open for the legal
sign-off), and no claim of numeric parity with GunBound — its physics was server-side and is not in the source.
