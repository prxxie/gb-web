---
id: ADR-0006
title: Ship the vector renderer through M1 and M2; the art pass is its own wave after M2
status: accepted
date: 2026-11-07
supersedes: []
---

# ADR-0006 — Ship the vector renderer through M1 and M2; the art pass is its own wave after M2

## Context

The match screen draws everything with `Phaser.GameObjects.Graphics` — mobiles, treads, turrets, projectiles, terrain,
the aim ring and the blast circle are shape and path calls in `apps/web/src/game/scene.ts`. `apps/web/public` holds the
PWA icons and `manifest.webmanifest` and nothing else: there is no sprite sheet, no tileset and no audio in the build.

The asset source is decided (`OQ-12`, answered): AI-generated sprites, maps and SFX, curated in-house. What is not
decided is the client's policy on that content (`OQ-20`, open): where the disclosure line lives, who approves a
generated asset for brand use, and what provenance has to be kept. `US-MATCH-001` carries the assumption that makes the
current look acceptable in the meantime — "the shipped art is AI-generated placeholder art with a licence note in
`assets/CREDITS.md`; replacing it later must not change coordinates or the asset manifest contract".

The schedule is the third input: `M1` (demo) is week 4, `M2` (UAT) week 11, `M3` (go-live) week 17, and 11 stories are
still `ready` against a 114.5 story-day backlog (`docs/03-stories/delivery-plan.md`).

## Decision

Keep the vector renderer for `M1` and `M2`. Do not open an art story, and do not add binary assets to the build, until
`OQ-20` is answered. The art pass becomes its own wave after `M2` (weeks 11–13), before the `M3` go-live wave.

Two constraints bind that future wave, and they are recorded here so the art pass cannot quietly break them:

- **Coordinates do not move.** Sprite frames are drawn inside the collision footprint the physics already uses
  (`packages/core` owns positions, radii, `hull` geometry); an art change must not require a tunable change.
- **`US-MATCH-001` AC1 stays satisfied.** It asks for a battlefield whose units and terrain are drawn — it does not ask
  for a particular medium, so the vector renderer meets it today and a sprite renderer must meet it again when it lands.

## Options considered

| Option | Why not |
|--------|---------|
| Open the art story now, in parallel with `M1` | `OQ-20` blocks the content stories and the credits screen; an unapproved asset set is work that may be thrown away, and it competes with the 11 ready stories |
| A no-asset visual polish story now | Still worth doing, but it is a polish story (palette, typography, HUD contrast), not art, and it does not need this decision to proceed |
| Defer art to after `M3` | The client should see the real look during `M2` UAT, not after go-live; weeks 11–13 leave room before the release wave |

## Consequences

- The look at `M1` and `M2` is the vector one; the demo and the UAT are judged on gameplay, readability and frame rate,
  not on art.
- `OQ-20` becomes a **release blocker for `M3`**, not merely a content-story gate: without an answered policy there is no
  approved asset set and no credits line.
- The asset manifest contract (`docs/01-overview/conventions.md`, `US-MATCH-001` § 4) is unaffected today because nothing
  loads from a manifest yet; the art wave is what introduces it.
