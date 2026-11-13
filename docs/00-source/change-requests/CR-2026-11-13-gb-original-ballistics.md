# CR-2026-11-13 — the ballistics are the original formula, and the screen is one screen

- **Raised**: 2026-11-13 by the client
- **Status**: approved
- **Supersedes**: the provenance constraint of `CR-2026-11-05-no-decompile.md` **for the ballistics parameters only**
  (see § Scope of the reversal)
- **Affects**: `02-reference/gameplay/tunables.md`, `02-reference/gameplay/reference-gunbound.md` § 10,
  `02-reference/data/mobiles.md`, `02-reference/screens/match.md` § 5, `04-decisions/adr/ADR-0005-gb-physics-replica.md`
  (superseded), `04-decisions/adr/ADR-0007-original-gb-ballistics.md` (new), `03-stories/EPIC-09-ballistics/*`,
  `03-stories/delivery-plan.md`

## Request

> Chỉ cần đúng công thức gốc gb, 1 màn hình = 8 bar, 1 map có thể hơn 2mh, người chơi chỉ được nhìn trong 1mh, ngoài 1mh
> sẽ phải tính và bắn mù, game có thể zoom để đo nhưng sau đó sẽ tự động kéo về kích thước 1mh chuẩn.

and, on the source of the numbers:

> Đây là tham chiếu trích xuất từ gb thật.

and, on the two forks this CR settles:

> 1 - A, 2 - để 17 xe khớp

(`A` = adopt the extracted parameter table as the basis; `2` = the roster becomes the seventeen machines of the
reference, dropping our own extras.)

## What changed

| Area | Before (`CR-2026-11-05`) | After |
|---|---|---|
| Provenance of the physics constants | **our own model**, constants chosen by us and fixed by calibration and playtest; the extraction was not part of the basis | the **original formula and its parameter table** are the basis and are cited as such |
| Distance unit | world units, no user-facing unit; the ruler was decorative | **1 màn = 8 phần = 800 u**; 1 phần = 100 u |
| Map and view | view window was half the map (1 000 × 600 u) and grew with the screen aspect | the view is **exactly one màn wide**; the map stays 2 000 u = **2.5 màn**; a wider canvas buys height, never width |
| Who can see the target | `windowOnBoth` framed both mobiles, so the opponent was always on screen | the frame follows the shooter; anything past one màn is **blind fire**, by design |
| Zoom | pan/zoom for framing, freely usable | zoom out to measure, then **snap back** to one màn; **firing is refused while zoomed** |
| Roster | twenty machines, our own | **seventeen**, matching the reference; three dropped |
| Power | per-mobile `maxPower` (92–120 of an arbitrary 100) | **0–4 bar for every machine** |
| Gravity | one value for the roster | **per machine**, `390 × weight / 5.78` |
| Wind | flat, horizontal, `1.0 × magnitude` for everyone | **per machine**: `k = 0.222 / windDrag`, `windEff = magnitude × 0.95` |
| Flight step | 50 ms | **25 ms** (at the new speeds a 50 ms step is half a blast radius) |

## Scope of the reversal

`CR-2026-11-05` removed decompilation from the basis **unconditionally** and made the physics "our own model". This CR
reverses that for exactly one thing: the **numeric parameter table and the algebraic form of the ballistics**
(gravity per machine, the per-bar muzzle constant, the per-machine wind coefficient, the weight/drag table, the split-shot
milestones). Everything else stands: no code, no assets, no binary, no tables of the other product's own format enter the
build; the geometry of our maps, the roster's names and stats, the UI, the netcode and the server are still ours.

The two decisions this reverses were the client's own, recorded, and are now the client's own again — that is why this is
a change request and not an edit to a done story.

## Risks accepted

1. **Rights-holder exposure returns for the public demo.** `CR-2026-11-05` closed `OQ-18` on the argument that nothing
   was copied; adopting a parameter table weakens that argument. The client accepted this trade knowingly on 2026-11-13.
   The demo stays private/unlisted, and a public launch now needs a fresh legal read — recorded in the release gate.
2. **Replays and ranked seeds are invalidated.** The ruleset version changes; every stored match record, snapshot and
   leaderboard entry produced by the old ruleset is out of scope for comparison. Ranked has not been live (Clerk dev
   instance), so the practical loss is the local replay corpus and the calibration fixtures.
3. **The feel changes under the players' feet**: at four bar and 45° a shell now flies 2 214 u in 3.37 s instead of
   2 290 u in 5.49 s. Every tuning value documented in `tunables.md` § 1 and every calibration sentence in
   `reference-gunbound.md` § 10 is rewritten by `US-BAL-004`.

## Alternatives rejected

- **Keep our model and calibrate to match the reference's behaviour** (offered as option B) — rejected by the client:
  the request is the original formula, not an imitation of it.
- **Keep twenty machines and map their physics onto the seventeen reference weights** — rejected: the roster is part of
  what "khớp" means, and three of our rows duplicated a profile that another row already had.
- **Make the one-screen rule a game-mode option** — rejected: it is the game, not a modifier.

## Consequences

- Nine stories in `EPIC-09-ballistics`, four waves, 18.0 story-days.
- `ADR-0005` is superseded by `ADR-0007`; its history stays readable, nothing is deleted.
- `US-MATCH-007`, `US-CORE-001`, `US-CORE-005`, `US-CORE-007`, `US-MATCH-002` (AC on the aim aid) and `TC-MATCH-918` are
  superseded in place by the stories below, each in its own commit.
