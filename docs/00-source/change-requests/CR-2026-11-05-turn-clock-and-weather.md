# CR-2026-11-05 — 20 s turns and round-based weather on a 12-sector wind dial

- **Raised**: 2026-11-05 by the client
- **Status**: approved
- **Affects**: `02-reference/gameplay/tunables.md` § 1.1/§ 1.2/§ 1.3, `02-reference/screens/match.md`,
  `02-reference/data/room-state.md`, `02-reference/api/signaling.md`, `01-overview/{glossary,project-overview,workflow-state-machine}.md`,
  `03-stories/EPIC-03-match-core/{US-CORE-001,US-CORE-002,US-CORE-015}`, `03-stories/EPIC-05-match-ui/{US-MATCH-002,US-MATCH-003}`,
  `05-quality/test-cases.md`, `03-stories/delivery-plan.md`, `04-decisions/open-questions.md` (`OQ-03`, `OQ-41`)

## Request

> thời gian mỗi turn là 20s. sau mỗi turn của toàn bộ người chơi sẽ thay đổi thời tiết. gió từ 0 đến 26 và 360 độ chia
> làm 12 phần có tick để người chơi dễ dàng phân tích

Translated: **each turn lasts 20 s**; **the weather changes after every full round of all players**; **wind runs 0 to 26
with 360° divided into 12 ticked parts**, so the player can analyse direction easily.

## What changes

| Area | Before | After |
|---|---|---|
| Turn clock | 30 s (`OQ-03` default) | **20 s** — `turnDurationMs = 20000`, grace extension unchanged |
| Wind shape | `{ x, y }` on `−10…+10` per axis, `windMultiplier 0.08` (source spec) | **polar** `{ magnitude 0–26, directionDeg = sector × 30, sector 0–11 }` |
| Wind change | re-rolled every turn | **re-rolled once per round**, constant within the round, `weather.rolledAtRound` |
| Display | arrow + decimal value | **12-tick compass dial**, arrow at the sector, whole number `0–26`; `0` = hollow grey dial |
| Announcement | none | 1.5 s banner `match.weather.changed`, dismissible, never blocks input |
| Physics | `a = 110 × wind / mass` on both axes | `a = 42 × m × (cos θ, sin θ) / mass` — same tuned maximum push, now directed |
| Snapshot | `wind {x,y}`, `turn{activeSlot,number,deadlineAt}` | `weather {wind, rolledAtRound}`, `turn{activeSlot,number,round,deadlineAt}` |

## Why 12 sectors and why the coefficient changed

12 sectors of 30° is what the client asked for, and it matches how a player *uses* wind: a shot correction is one ruler
division per full wind, so ±15° of directional slop is inside the noise of the aim gesture anyway. `windCoefficient`
drops from `110` to **`42`** purely to keep the tuned maximum: `26 × 42 / 168 = 6.5 u/s²` is exactly the push the old
`±10` × `110` model produced, so no balance numbers moved — only the way the wind is expressed. At full wind a mid-mass
mobile lands ~**129 units** downwind, which is one ruler division at the default window — the measurement story and the
weather story now reinforce each other.

## Why once per round, not per turn

A per-turn wind is unplayable in an artillery game: a player plans while the previous player acts, and a wind that
changes under the plan wastes the shot. GunBound itself changes wind between rounds. The client's phrasing ("after every
turn of all players") is exactly that boundary, so `turn.round` increments when the delay queue wraps and the roll is
attached to it.

## Impact

- **One new story** `US-CORE-015` (S, P0, wave W3); `US-CORE-001`, `US-CORE-002`, `US-MATCH-002`, `US-MATCH-003` edited
  in place (no id or size change).
- Backlog 52 → **53 stories**, 113.5 → **114.5 story-days**, W3 17 → 18. Milestones unchanged.
- `OQ-03` and `OQ-41` answered; no story is blocked by them.
- Test cases: `TC-CORE-152` (20 s), **`TC-CORE-926`** (roll per round, replay determinism), **`TC-MATCH-923`** (dial,
  `m = 0`, banner).

## Alternatives rejected

- **Continuous 360° direction** — unreadable on a phone and it would let two players disagree about what the arrow means;
  12 ticks are the resolution a player can act on.
- **Wind re-rolled per turn** — destroys planning (see above).
- **Keep `−10…+10` per axis for compatibility** — it cannot express "magnitude 26 from the north-east", which is what the
  dial must show, and the diagonal case was already ambiguous in the source spec.
- **Scale the coefficient with the new range (26/10)** — would have tripled the wind push and invalidated every
  calibration number in `tunables.md`.
