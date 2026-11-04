---
id: EPIC-05-match-ui
code: MATCH
title: Match scene, touch aiming and HUD
---

# EPIC-05 — Match scene, touch aiming and HUD

The Phaser 4 scene that draws the battlefield and turns a thumb drag into a shot, plus the DOM HUD above it: HP, wind,
turn clock, roster, skip, phrases and emotes. The scene renders state and forwards input — it never simulates
([conventions.md § 5](../../01-overview/conventions.md)).

## Goal

A player can see the battlefield, aim by dragging, feel the shot leave on release, read every number that affects the
next shot without lifting their thumb, and play the whole match without the HUD covering the action.

## Stories

Generated from story frontmatter — run `node .agents/scripts/verify-docs.mjs --fix`; do not edit by hand.

<!-- cpt:epic-stories -->
| Id | Title | Priority | Size | Status | Depends on |
|---|---|---|---|---|---|
| [US-MATCH-001](US-MATCH-001-render-the-battlefield.md) | Render the battlefield, units and camera in Phaser | P0 | M | ready | US-FND-003, US-CORE-001 |
| [US-MATCH-002](US-MATCH-002-aim-and-fire-by-touch.md) | Pull power with one finger and fire on release | P0 | M | ready | US-MATCH-001, US-CORE-002 |
| [US-MATCH-003](US-MATCH-003-show-the-hud.md) | Show HP, wind, the turn clock and the roster in the HUD | P0 | S | ready | US-MATCH-001 |
| [US-MATCH-004](US-MATCH-004-skip-and-send-a-phrase.md) | Skip a turn and send a preset phrase or emote | P2 | S | ready | US-MATCH-003, US-NET-002 |
| [US-MATCH-005](US-MATCH-005-pick-a-weapon-and-use-items.md) | Pick a weapon slot and use items | P0 | M | ready | US-MATCH-001, US-CORE-007, US-CORE-009 |
| [US-MATCH-006](US-MATCH-006-move-with-touch-controls.md) | Move and angle with the four-way pad | P1 | S | ready | US-MATCH-002, US-CORE-008 |
| [US-MATCH-007](US-MATCH-007-zoom-and-pan-the-battlefield.md) | Fullscreen window with pinch zoom and a measuring ruler | P0 | M | ready | US-MATCH-001 |
<!-- /cpt:epic-stories -->

## Out of scope

- Physics and rules — EPIC-03; transport — EPIC-04.
- Art production: the scene ships with the AI-generated placeholder set (`OQ-12`).
- Any game mode other than the one map in v1.
