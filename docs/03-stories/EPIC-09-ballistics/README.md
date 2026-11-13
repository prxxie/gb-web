---
id: EPIC-09-ballistics
code: BAL
title: Ballistics of the original, played inside one screen
---

# EPIC-09 — Ballistics of the original, played inside one screen

The client replaced the physics basis and the framing rule on 2026-11-13 (`CR-2026-11-13`): the original artillery
formula and its parameter table, a roster of seventeen reference machines, a map wider than two screens, and a view that
shows exactly one — everything past that is measured and fired blind.

## Goal

A player fires the original trajectory with the original numbers, measures distance in parts of a screen, sees one screen
at a time, may zoom out to measure but not to aim, and plays the seventeen machines of the reference. The opponent and the
bot obey the same information limit.

## Stories

Generated from story frontmatter — run `node .agents/scripts/verify-docs.mjs --fix`; do not edit by hand.

<!-- cpt:epic-stories -->
| Id | Title | Priority | Size | Status | Depends on |
|---|---|---|---|---|---|
| [US-BAL-001](US-BAL-001-measure-the-map-in-parts-of-a-screen.md) | Measure the map in parts of a screen | P0 | M | done | US-CORE-007 |
| [US-BAL-002](US-BAL-002-see-one-screen-and-fire-the-rest-blind.md) | See one screen and fire the rest blind | P0 | M | done | US-MATCH-007, US-BAL-001 |
| [US-BAL-003](US-BAL-003-show-the-truth-only-inside-your-screen.md) | Show the truth only inside your screen | P0 | S | ready | US-MATCH-002, US-BAL-002 |
| [US-BAL-004](US-BAL-004-fly-the-original-trajectory.md) | Fly the original trajectory | P0 | M | ready | US-CORE-001 |
| [US-BAL-005](US-BAL-005-field-the-seventeen-reference-machines.md) | Field the seventeen reference machines | P1 | M | ready | US-BAL-004, US-CORE-007 |
| [US-BAL-006](US-BAL-006-let-the-bot-fire-blind-too.md) | Let the bot fire blind too | P1 | M | ready | US-BAL-002, US-CORE-005 |
| [US-BAL-007](US-BAL-007-solve-the-shot-with-the-original-algebra.md) | Solve the shot with the original algebra | P1 | S | ready | US-BAL-004 |
| [US-BAL-008](US-BAL-008-check-the-integrator-against-the-algebra.md) | Check the integrator against the algebra | P2 | S | ready | US-BAL-004, US-BAL-007 |
| [US-BAL-009](US-BAL-009-split-a-shot-on-the-reference-milestones.md) | Split a shot on the reference milestones | P2 | M | ready | US-BAL-004, US-CORE-009 |
<!-- /cpt:epic-stories -->

## Out of scope

- The engine's terrain, bounce, cluster and carving rules — unchanged by this epic (`EPIC-03`).
- Split-shot timing milestones (`US-BAL-009`) ship last and can slip without touching anything else.
- Art, audio and the practice route's visual design.
