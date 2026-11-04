# CR-2026-11-04 — Per-mobile angle windows and movement allowances

- **Raised**: 2026-11-04 by the client
- **Status**: approved
- **Affects**: `02-reference/data/mobiles.md`, `02-reference/gameplay/tunables.md` (§ 3, § 4.2, § 4.3),
  `01-overview/{glossary,project-overview}.md`, `US-CORE-001`, `US-CORE-007`, `US-CORE-008`, `05-quality/test-cases.md`

## Request

> các mobile cũng có range góc riêng và khả năng di chuyển trong 1 turn riêng

Translation: "mobiles also have their own angle range and their own ability to move within a turn."

## What changes

| Area | Before | After |
|---|---|---|
| Angle range | one envelope per trajectory profile | **every mobile declares its own `angleMin`/`angleMax`** inside the profile's band — Storm Falcon −20…25°, Jade Dragon −10…50°, Ash Behemoth 45…88° |
| Aim clamp | profile envelope | the mobile's window, applied client-side before the shot is sent (`TC-CORE-022`) |
| Movement | one global `moveDelay +10`, distance per mobile only | **per mobile**: `moveDistance` 60–110 px, `maxMovesPerTurn` 1–2, `runMultiplier` 1.5–1.9, `moveEnergy` 8–14 (×2 for a run), `moveDelay` +8…+14, `maxIncline` 22–44° |
| Movement model | prose | written out as rules and formulas in `tunables.md` § 4.3, with the GB action `0xc304` (direction + run flag) cited as the origin |
| Test | `TC-CORE-904` | same id, rewritten to cover both walk and run, the action cap and the per-mobile distances; `TC-CORE-905` now validates the new fields |

## Impact

- **No new story**: `US-CORE-007` (loader), `US-CORE-008` (movement) and `US-CORE-001` (aim) already own these paths; they
  gain fields and acceptance criteria. **111 story-days unchanged.**
- Balance principle stated: a wide aim window, a long move and a big energy budget never ship together — a mobile that
  moves twice pays either more energy per move or more queue delay.

## Alternatives rejected

- **Keep one global flight window** — refused: the client asked for per-mobile character, and the aim window is the
  cheapest place to express it without new art or new rules.
- **Cost movement by distance only** (no action cap) — refused: GunBound's turn permits a limited reposition (action
  `0xc304`), and an uncapped walk would let a fast mobile kite forever.
