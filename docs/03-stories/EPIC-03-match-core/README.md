---
id: EPIC-03-match-core
code: CORE
title: Deterministic match simulation
---

# EPIC-03 — Deterministic match simulation

The pure TypeScript core every client runs: tunables, ballistics with wind and gravity, the turn engine and its 30-second
clock, blast damage and the win condition, the snapshot codec, and the bot that plays offline. It imports no Phaser, no
DOM and no network ([NFR-22](../../01-overview/nonfunctional-requirements.md)).

## Goal

Provide the full GunBound combat model — delay turn queue, three weapon slots, HP/shield/defense, Inner/Mid/Outer
blast tiers, terrain carving, movement with energy, eleven items, four modes, stage gimmicks and eleven maps — as pure,
data-driven, deterministic TypeScript.

Given a seed, a ruleset and a sequence of inputs, two devices produce byte-identical state — so the host's snapshot and
a peer's simulation never disagree, and the offline bot match uses exactly the same rules as an online one.

## Stories

Generated from story frontmatter — run `node .agents/scripts/verify-docs.mjs --fix`; do not edit by hand.

<!-- cpt:epic-stories -->
| Id | Title | Priority | Size | Status | Depends on |
|---|---|---|---|---|---|
| [US-CORE-001](US-CORE-001-simulate-a-shot.md) | Simulate a shot with the GunBound-shaped integrator | P0 | L | done | US-FND-001 |
| [US-CORE-002](US-CORE-002-resolve-turns-and-the-clock.md) | Resolve turns with the delay queue | P0 | M | done | US-FND-001 |
| [US-CORE-003](US-CORE-003-apply-damage-with-shield-and-defense.md) | Apply damage with shield, defense and blast tiers | P0 | M | ready | US-CORE-001 |
| [US-CORE-004](US-CORE-004-encode-and-apply-snapshots.md) | Encode and apply snapshots | P0 | M | ready | US-CORE-002, US-CORE-003 |
| [US-CORE-005](US-CORE-005-play-against-a-bot.md) | Play against a bot that uses the real rules | P1 | M | ready | US-CORE-003, US-CORE-004, US-CORE-007 |
| [US-CORE-006](US-CORE-006-carve-terrain-on-impact.md) | Carve terrain and collide with it | P0 | M | ready | US-CORE-001 |
| [US-CORE-007](US-CORE-007-load-mobile-stats-and-weapons.md) | Load mobile stats and resolve the three weapon slots | P0 | M | done | US-FND-001 |
| [US-CORE-008](US-CORE-008-move-with-energy.md) | Move with energy, distance and incline limits | P1 | M | ready | US-CORE-006, US-CORE-007 |
| [US-CORE-009](US-CORE-009-apply-item-effects.md) | Apply the eleven item effects | P1 | L | ready | US-CORE-003, US-CORE-008 |
| [US-CORE-010](US-CORE-010-score-the-four-modes.md) | Score the four game modes | P1 | M | ready | US-CORE-003 |
| [US-CORE-011](US-CORE-011-apply-stage-gimmicks.md) | Apply the per-map stage gimmicks | P1 | L | ready | US-CORE-001, US-CORE-006 |
| [US-CORE-012](US-CORE-012-load-the-eleven-maps.md) | Load the eleven maps | P1 | M | ready | US-CORE-006, US-CORE-011 |
| [US-CORE-013](US-CORE-013-apply-avatar-stat-bonuses.md) | Apply avatar stat bonuses | P2 | S | ready | US-CORE-007, US-AUTH-003 |
| [US-CORE-015](US-CORE-015-roll-the-weather-each-round.md) | Re-roll the weather every round | P0 | S | ready | US-CORE-002 |
<!-- /cpt:epic-stories -->

## Out of scope

- Rendering, input gestures and HUD — EPIC-05.
- Transport and authority — EPIC-04.
- Matchmaking or ratings — EPIC-06.
