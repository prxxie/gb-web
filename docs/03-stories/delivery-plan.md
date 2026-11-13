# Delivery plan

73 stories across ten epics, sequenced in dependency waves. Sizes use S = 1, M = 2.5, L = 4.5 story-days.

| Fact | Value |
|---|---|
| Backlog size | **141.5 story-days across 73 stories**: 123.5 across the 55 stories as first planned, plus **+18.0** across the nine `EPIC-09` stories added 2026-11-13 (§ Re-plan). Two of the original 55 are refactors queued after `M3`, § Deferred |
| Capacity assumption | 2 developers + a part-time reviewer ≈ 130 dev-days over 17 weeks (`OQ-15` is still open on team size) |
| Utilisation | 141.5 story-days against 130 dev-days before the 2026-11-13 re-plan; `EPIC-09` was added as post-`M3` work, so the `M1`–`M3` window still carries the original 123.5 and stays at ≈ 88 % (114.5 of 130) |
| Milestones | `M1` demo week 4 · `M2` UAT week 11 · `M3` go-live week 17 (`OQ-25`, `OQ-36`) |
| Scope basis | full GunBound package B (`CR-2026-11-04-gb-gameplay-fidelity`) |

Waves are groups of stories whose dependencies are satisfied by earlier waves; inside a wave the order is dependency
order, then priority. Each wave lists the **gates** — open questions that must be answered before it starts.

## Waves

| Wave | Weeks | Days | Stories | Gate |
|---|---|---|---|---|
| **W1** — skeleton | 1–3 | 11 | `US-FND-001`, `US-FND-002`, `US-FND-003`, `US-FND-004`, `US-AUTH-001` | none |
| **W2** — first shot (M1) | 2–4 | 19.5 | `US-CORE-001`, `US-CORE-007`, `US-CORE-006`, `US-ROOM-001`, `US-ROOM-002`, `US-MATCH-001`, `US-MATCH-002` | `OQ-04`, `OQ-37` accepted |
| **W3** — legal match | 4–6 | 18 | `US-CORE-002`, `US-CORE-003`, `US-CORE-004`, `US-ROOM-003`, `US-ROOM-007`, `US-MATCH-003`, `US-MATCH-005`, `US-MATCH-007`, `US-CORE-015` | — |
| **W4** — netplay + items | 6–9 | 19.5 | `US-CORE-008`, `US-CORE-009`, `US-ROOM-004`, `US-ROOM-005`, `US-ROOM-006`, `US-NET-001`, `US-NET-002` | `OQ-07` accepted |
| **W5** — full battles (M2) | 8–11 | 17 | `US-CORE-010`, `US-CORE-011`, `US-CORE-012`, `US-CORE-013`, `US-MATCH-006`, `US-NET-003`, `US-NET-004`, `US-AUTH-002`, `US-PWA-003` | `OQ-26` (Clerk app + privacy policy) |
| **W6** — identity + ranks | 10–13 | 14 | `US-AUTH-003`, `US-AUTH-004`, `US-CORE-005`, `US-MATCH-004`, `US-PWA-001`, `US-RANK-001`, `US-RANK-002`, `US-RANK-005` | — |
| **W7** — polish + go-live (M3) | 13–17 | 15.5 | `US-RANK-003`, `US-RANK-004`, `US-PWA-002`, `US-PWA-004`, `US-OPS-001`, `US-OPS-002`, `US-OPS-003`, `US-OPS-004` | `OQ-33` (load target) |
| **W8** — ballistics of the original | post-`M3` | 18 | `US-BAL-001` → `US-BAL-003` (6.0) · `US-BAL-004`, `US-BAL-008` (3.5) · `US-BAL-005`, `US-BAL-006` (5.0) · `US-BAL-007`, `US-BAL-009` (3.5) | none — the two forks were answered by the client on 2026-11-13 |

## Re-plan 2026-11-13 — the ballistics of the original (`EPIC-09`)

`CR-2026-11-13` replaced the physics basis and the framing rule: the original formula and its parameter table, a roster of
seventeen reference machines, a map of 2.5 màn, and a view of exactly one màn with measured zoom that snaps back and cannot
fire. `ADR-0005` is superseded by `ADR-0007`.

| Effect | Where |
|---|---|
| Nine new stories, four sub-waves, 18.0 story-days | `EPIC-09-ballistics` (wave `W8`, after `M3`) |
| Physics constants, the power scale and the step | `US-BAL-004` supersedes the constants section of `US-CORE-001` |
| Camera framing (both mobiles in one window) | `US-BAL-002` supersedes `US-MATCH-007` and `TC-MATCH-918` |
| Roster, per-machine gravity and wind | `US-BAL-005` supersedes the stat-table part of `US-CORE-007` |
| Bot reading the whole state | `US-BAL-006` supersedes the decision in `US-CORE-005` |
| Aim aid drawing past the screen | `US-BAL-003` supersedes the aid's acceptance criteria in `US-MATCH-002` |
| Replays, snapshots, calibration fixtures | invalid under ruleset `2026-11-13`; the loader refuses them by name |
| Public launch | a fresh legal read is now required — recorded in the release gate, not a blocker for the private demo |

Order matters only between `US-BAL-004` and `US-BAL-005`: the calibration in `US-BAL-004` needs `weight`/`windDrag`, so the
two land in the same review. Everything else can be picked in the order listed.

## Deferred, and why

| Item | Decision | Effect |
|------|----------|--------|
| Art pass — sprites, map tilesets, SFX | `ADR-0006`: the vector renderer ships through `M2`; the art wave runs weeks 11–13, and it cannot start while `OQ-20` (AI-asset policy, disclosure, provenance) is unanswered | `M1` and `M2` are judged on gameplay and readability, not art; `OQ-20` is a **release blocker for `M3`** |
| Two refactors: `US-MATCH-008` (the match page) and `US-ROOM-008` (the room object) | the 2026-11-08 review recorded them as debt, not defects: both files work and are commented, but they are where the next feature hurts | queued after `M3`; they change no contract and their acceptance criterion is "the existing suite passes unchanged", so they can be scheduled in any quiet week |

## Critical path

`US-FND-001 → US-FND-002 → US-ROOM-001 → US-ROOM-002 → US-ROOM-006 → US-NET-001 → US-NET-002 → US-RANK-001 →
US-RANK-005` = **22.5 story-days**. The combat track runs in parallel until W3 and joins at `US-CORE-004`: `US-CORE-001 →
US-CORE-007 → US-CORE-006 → US-CORE-004 → US-NET-003 → US-MATCH-001 → US-MATCH-005`.

## Milestones

| Milestone | Week | What must exist | Evidence |
|---|---|---|---|
| `M1` demo | 4 | offline shot with a real trajectory, crater, one mobile and two weapons, the zoomable window and its ruler, on a phone | recorded two-phone demo, `TC-CORE-020`, `TC-MATCH-918`, `TC-MATCH-920` |
| `M2` UAT | 11 | four modes, items, movement, accounts, migration, public rooms | `docs/05-quality/acceptance-signoff.md` G2/G3 signed |
| `M3` go-live | 17 | ranks, PWA install, both locales, a11y, load test, rollback drill | G4 signed, release record in `docs/07-release/` |

## First three stories

1. `US-FND-001` — the workspace builds, lints, typechecks and tests with the commands in `AGENTS.md`.
2. `US-CORE-001` — the GunBound-shaped integrator with the golden-shot test.
3. `US-ROOM-001` — a room with a shareable code, so the demo has a doorway.

## If the date moves

Cut in this order (each row is the saving, measured in story-days): English UI −2.5 · maps 11 → 4 −5 · stage gimmicks
−4.5 · modes 4 → 1 −2.5 · items 11 → 5 −2.5 · ranks post-launch −9.5 · accounts post-launch −4.5. Cutting the physics
replica is not on the list: it is the product (`ADR-0005`).
