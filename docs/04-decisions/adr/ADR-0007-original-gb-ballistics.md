---
id: ADR-0007
title: The ballistics are the original formula, quadratically integrated at 25 ms, and the screen is one screen
status: accepted
date: 2026-11-13
supersedes: [ADR-0005]
---

## Context

`ADR-0005` decided that `packages/core` owns a *replica* of the genre's physics: our own model, one gravity for the whole
roster, `v0 = force × 5.9`, wind `1.0 × magnitude` with no mass term, a 50 ms step, and the framing decision that the
camera shows both duelists. That was written under `CR-2026-11-05-no-decompile`, which removed extracted data from the
basis and closed `OQ-18` on the argument that nothing was copied.

On 2026-11-13 the client reversed that for the ballistics alone (`CR-2026-11-13`): the original formula and its parameter
table are the basis, the roster is the reference's seventeen machines, and the match is played inside one screen.

## Decision

1. **Units and distance.** `1 màn = 8 phần = 800 world units`; `1 phần = 100 u`. The map stays 2 000 × 1 200 u, which is
   **2.5 màn** wide. Nothing user-visible is expressed in pixels.
2. **Muzzle.** `v0 = bar × 232.335 u/s` for every machine, `bar ∈ [0, 4]`. There is no per-machine power cap and no
   `force` scale: the bar *is* the input.
3. **Gravity is per machine**: `g = 390 × weight / 5.78 u/s²` over the reference weight table (4.20 … 7.50).
4. **Wind is per machine**: `k = 0.222 × windDrag / 0.046²`, effective magnitude `windEff = magnitude × 0.95`,
   `aₓ = k · windEff · cos φ`, `a_y = g − k · windEff · sin φ`. In play `φ ∈ {0°, 180°}` — the genre's wind is horizontal —
   so the vertical term is zero; the general form stays so a map gimmick can use it.
5. **Integration**: fixed **25 ms** step, semi-implicit, rendered by interpolation. At 4 bar the muzzle is 929 u/s, so a
   50 ms step would advance 46 u — half a blast radius — and turn aiming into luck.
6. **Terrain, bounce, cluster, carving are unchanged**: the reference's closed-form solution only holds on a flat plane,
   and our shells must interact with a heightmap. The closed form is therefore an *oracle* for the integrator
   (`US-BAL-008`), not its replacement.
7. **One screen is the whole information budget.** The resting camera window is exactly one màn wide; the canvas aspect
   buys height, never width. Zooming out to measure is allowed and must snap back; firing while zoomed out is refused,
   otherwise the zoom is an aim aid. After a release the camera follows the shell to its impact.
8. **The roster is the reference's seventeen.** Three of our own machines duplicated a profile another row already had and
   are dropped; the remaining seventeen keep their names, stats and weapons, and take their physics from the reference
   row they map to.

## Calibration target

The reference's own worked example, in our units: the middle machine (weight 5.78 → `g = 390 u/s²`), four bar at 45° with
no wind, must land **2 214 ± 20 u** from the muzzle after **3.37 ± 0.05 s** — 2.77 màn, i.e. a full-power shot clears the
map's width and the aimed band sits well inside the bar.

## Consequences

- Every stored replay, snapshot and calibration fixture from ruleset `2026-11-09` is invalid; the ruleset id is bumped and
  carried by snapshots (`US-BAL-004`).
- `tunables.md` § 1, `reference-gunbound.md` § 10, `mobiles.md` § 1–§ 3 and `screens/match.md` § 5 are rewritten with the
  stories that change the code.
- The bot can no longer read an opponent it cannot see (`US-BAL-006`); a bot that aims perfectly while the player fires
  blind is not a fair match.
- `ADR-0005` is superseded, not deleted: its reasoning is the record of why the previous model looked the way it did.
