# CR-2026-11-04 — Twenty original mobiles

- **Raised**: 2026-11-04 by the client
- **Status**: approved
- **Affects**: `02-reference/data/mobiles.md`, `02-reference/screens/lobby.md`, `01-overview/project-overview.md`,
  `00-source/brief.md`, `US-CORE-007`, `US-ROOM-007`, `05-quality/test-cases.md`

## Request

> tôi muốn 20 mobile với các đặc điểm tương tự gunbound nhưng khác tên, khác hình. có thể tham khảo các linh thú của
> các nền văn minh. tên tiếng anh

Translation: "I want 20 mobiles with characteristics similar to GunBound but different names and different art. You may
take inspiration from the sacred beasts of various civilizations. English names."

## What changes

| Area | Before | After |
|---|---|---|
| Roster size | 8 mobiles | **20** |
| Naming | GB-shaped personal names | **original English names**, each echoing a real-world mythical beast (megalithic guardian, world-bearing turtle, thunder bird, lunar hare, oriental dragon, solar lion, feathered serpent, frost hydra, …) |
| Art | unspecified | **art brief per mobile**: mythic motif, silhouette hook, three-value palette, both team tints, readable at 64 px |
| Balance | informal | **two mobiles per archetype** (balanced, tank, sniper, bombardier, bouncer, support, glass, all-rounder, zoner, trickster); every mobile has a **unique weapon-class triple**; the two mobiles of each archetype sit within **±10 %** of each other on damage per delay |
| Selection | none described | mobile chosen in the lobby, fixed for the match, duplicates allowed (`US-ROOM-007` AC7, `TC-ROOM-153`) |
| New test | — | `TC-CORE-923` (balance band), `TC-ROOM-153` (picker + reconnect) |

## Impact

- **No new story, no new dependency, no size change.** `US-CORE-007` and `US-ROOM-007` already own the loader and the
  lobby loadout step; this CR widens their data and adds one acceptance criterion, so the schedule in
  `03-stories/delivery-plan.md` is unchanged (111 story-days).
- Legal: names, silhouettes and palettes are ours, which strengthens the `OQ-18` position — nothing is copied from
  GunBound or from any existing game or film.
- Data only: `packages/core/src/data/mobiles.json` grows from 8 to 20 records, plus `mobiles.balance.csv` and
  `scripts/balance-report.mjs` (`NFR-29` keeps values out of code).

## Alternatives rejected

- **Keep 8 and add palette variants** — cheapest, but the client asked for breadth and a screen full of distinct
  creatures is a marketing asset for a competitive audience.
- **Reuse GunBound archetype names** (e.g. "bombardier-class Bigfoot") — refused: `OQ-18` and the client's own
  "khác tên" (different names).
- **Ship 20 without balance bands** — refused: more units means more chance of a dominant pick; the ±10 % within-archetype
  band plus the explicit archetype spread (0.21–0.32 damage per delay, paid for in HP, shield and defense) is what keeps
  the queue fair.
