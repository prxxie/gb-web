# CR-2026-11-04 — adopt GunBound's recovered constant-acceleration model

> **Amended 2026-11-05** — the citations this CR gathered were removed from the basis by
> [`CR-2026-11-05-no-decompile`](CR-2026-11-05-no-decompile.md). The decisions here stand: the values were already ours,
> only the provenance wording changed. This file is kept as the record of how the decision was reached.


- **Raised**: 2026-11-04 by the client
- **Status**: approved
- **Affects**: `02-reference/gameplay/{tunables,reference-gunbound}.md`, `02-reference/data/mobiles.md`,
  `01-overview/{glossary,project-overview}.md`, `04-decisions/{adr/ADR-0005-…,open-questions.md}`,
  `03-stories/EPIC-03-match-core/{US-CORE-001,US-CORE-007}`, `05-quality/test-cases.md`

## Request

> https://github.com/agasready/Gunbound_aimbot tham khảo

Translation: "use this as a reference." The repository is a GunBound power/angle calculator that reads the live client's
memory and solves the *inverse* ballistic problem — which means it carries a fitted model of the game's projectile motion.

## What the reference actually contains

`bot_w8_v79.py` (115 KB, single file) plus `mobile_constants.txt`. The physics is a **pure constant-acceleration
parabola**:

```
g_eff = g − wind·sin(dir)/mass        a_x = wind·cos(dir)/mass
vx += a_x·dt;  vy −= g_eff·dt;  x += vx·dt;  y += vy·dt
```

with **no drag term anywhere**, a per-mobile `g` (0.433–0.9295) and `mass` (90–169), the game's power bar `0–4.0`, and
`1 part = 100 px` (8 × 6 parts across the 800 × 600 screen). The inverse solution is derived analytically from the same
equations, so the fit is self-consistent. Four parameter families exist (ICE / ICO / TRICO / TURTLE), i.e. GB mobiles
never shared one physics table; Turtle even has wind-dependent mass.

## What changes in our docs

| Area | Before | After |
|---|---|---|
| Drag | linear drag `0.08 / density` | **removed** — the recovered model has none |
| Shell weight | per-weapon `density` 0.80–1.40 | **per-mobile `mass` 118–169**, dividing the wind |
| Gravity | one value (100 u/s²) + per-profile multiplier | **per-mobile `gravity` 84–128 u/s²** |
| Launch law | `speedK` 4.40–6.00 per trajectory profile | **one law, `speedK = 4.55`**, as in GB |
| Trajectory profile | launch law + gravity multiplier + band | **aim band only** (the arc now comes from `g`/`mass`) |
| Vertical wind | absent | `a_y = −gravity + 110 × wind.y / mass` — wind fights gravity, as in the recovered model |
| Calibration | force 100 → 1,854 units / 6.6 s | force 98 → **1,988 units / 6.3 s**; drift 121–191 units at wind +10 |
| Verification | `TC-CORE-020/023/924` | same ids re-scaled, plus **`TC-CORE-925`** (mass is the only wind term) |

## Why it is a change and not a silent edit

It deletes data (`density` on 60 weapons), rewrites the integrator's contract and changes every documented number. Every
place that quoted the old figures was updated in the same commit, and the two earlier CRs keep their historical wording —
they record what was decided then, this one records why it moved.

## Impact

- No story added, **no size change** (111 story-days): `US-CORE-001` owns the integrator, `US-CORE-007` the loader.
- `mobiles.md` § 1 gained `gravity` and `mass` columns; § 3 lost `ρ`; § 4 is re-simulated from the new integrator.
- Honesty preserved: the aimbot's constants are empirical fits in its own `parts/tick` frame, so `reference-gunbound.md`
  § 10 states plainly that we reuse the **structure and per-mobile ratios**, and fix the absolute scale ourselves.

## Alternatives rejected

- **Keep drag and `density`** — the model we are trying to imitate has neither; keeping drag would make our shells fall
  short of GB's arcs at exactly the ranges players judge fidelity by.
- **Copy the aimbot's absolute constants verbatim** — they are fitted in a `parts/tick` frame whose relation to real time
  is not documented; adopting them literally would give 0.5-second flights. We keep the ratios, calibrate our own scale.
- **Give each mobile a different `speedK`** — GB gives every mobile the same power bar law; the variety comes from `g`
  and `mass`. Per-mobile `speedK` would double-count the difference.
