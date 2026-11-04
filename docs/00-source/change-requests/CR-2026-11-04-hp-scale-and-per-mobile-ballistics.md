# CR-2026-11-04 — 1,000-point health scale and per-mobile ballistics

> **Amended 2026-11-05** — the citations this CR gathered were removed from the basis by
> [`CR-2026-11-05-no-decompile`](CR-2026-11-05-no-decompile.md). The decisions here stand: the values were already ours,
> only the provenance wording changed. This file is kept as the record of how the decision was reached.


- **Raised**: 2026-11-04 by the client
- **Status**: approved
- **Affects**: `02-reference/gameplay/tunables.md`, `02-reference/gameplay/reference-gunbound.md`,
  `02-reference/data/mobiles.md`, `01-overview/{glossary,project-overview}.md`, `04-decisions/adr/ADR-0005-…`,
  `US-CORE-001`, `US-CORE-003`, `US-CORE-007`, `05-quality/test-cases.md`, `00-source/brief.md`

## Request

> HP dao động từ 900 đến 1200. các mobile có quỹ đạo đạn riêng. trong lượng của đạn cũng khác. nói chung tôi muốn các
> thông số hay phương trình vật lý giống gb nhất có thể

Translation: "HP should range from 900 to 1200. Each mobile has its own projectile trajectory. Bullet weight differs too.
In general I want the parameters and physics equations as close to GB as possible."

## What changes

| Area | Before | After |
|---|---|---|
| HP scale | 80–140 | **900–1,200** (shield 0–300, regen 0–40, Inner-hit damage 180–580) — the size of GunBound's own health bars |
| Step | 16 ms | **50 ms**, GunBound's recovered battle tick `` |
| Gravity | `0.35` units (source value, inconsistent with the map) | **100 u/s²** default, 85–120 per map × profile `1.00–1.15`; the inconsistency is documented in `tunables.md` § 1.1 instead of hidden |
| Launch law | one `arc` formula for everyone | **five trajectory profiles** (`standard`, `direct`, `lobber`, `mortar`, `skimmer`) — each fixes `speedK` 4.40–6.00 and the angle envelope |
| Shell mass | 3 fixed densities | **per-weapon `density` 0.80–1.40**, dividing wind push, drag and bounce energy: heavy shells drift less (174 vs 258 units at wind +10) and fly further |
| Physics equations | prose sketch | **written out** (launch, per-step integration, drag, impact, blast rings, shield absorption) with a calibration point: force 100 at 45° → 1,854 units in 6.6 s |
| Verification | `TC-CORE-020/023/026/903/905` | same ids, re-scaled, plus **`TC-CORE-924`** (per-mobile flight sample) |

## Impact

- **No story added, no size change** (111 story-days): `US-CORE-001` owns the integrator, `US-CORE-003` the damage
  pipeline, `US-CORE-007` the mobile loader — all three gain acceptance criteria or re-scaled ones.
- Every number is data (`mobiles.json`, `tunables.json`, `maps.json`), so balance stays a JSON edit (`NFR-29`).
- Honesty preserved: nothing here is presented as recovered from GunBound. The tables in
  `reference-gunbound.md` § 9 now list, per quantity, what GB had, what we chose and why.

## Alternatives rejected

- **Keep the 80–140 scale and multiply only at render time** — cheapest, but a 1,000-scale bar is what a GB player expects
  to see, and a display-only scale would desynchronise the numbers in logs, replays and balance sheets.
- **One global trajectory formula with per-mobile tuning knobs** — refused: GunBound's mobiles differ *qualitatively*
  (direct-fire vs lobbing vs bouncy), which one parabola plus speed tweaks cannot reproduce.
- **Copy the source's `gravity 0.35` literally** — refused: with `force × 512/100` it puts a full-force shot 18× past the
  map edge; the inconsistency is recorded in `tunables.md` § 1.1 rather than silently corrected.
