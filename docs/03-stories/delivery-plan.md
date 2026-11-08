# Delivery plan

55 stories across nine epics, sequenced in dependency waves. Sizes use S = 1, M = 2.5, L = 4.5 story-days.

| Fact | Value |
|---|---|
| Backlog size | 123.5 story-days across 55 stories (two of them refactors queued after `M3`, § Deferred) |
| Capacity assumption | 2 developers + a part-time reviewer ≈ 130 dev-days over 17 weeks (`OQ-15` is still open on team size) |
| Utilisation | ≈ 88 % (114.5 of 130 dev-days) — the remaining 12 % covers review, the two-phone matrix and the gates |
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
