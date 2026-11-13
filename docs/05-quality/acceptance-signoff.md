# Acceptance and stage-gate sign-off

Full-tier gate record. One row per gate; `cpt-signoff` fills the evidence and the signature, and nothing else writes
this file. Rows are never deleted — a re-opened gate keeps its history in `## History`.

Gate meanings, evidence requirements, and the waiver rules live in `.agents/skills/cpt-signoff/SKILL.md` § 1 and § 4.
`Status` is `pending`, `signed`, or `waived`. A `signed` row names the signer, the role, the date, and evidence that
resolves; a `waived` row names who accepted the risk, the compensating control, and the follow-up story in `Note`.

| Gate | Criterion | Evidence | Status | Signed by | Role | Date | Note |
|------|-----------|----------|--------|-----------|------|------|------|
| G1 | Requirements baseline agreed and planned | [`00-source/brief.md`](../00-source/brief.md) `status: confirmed` (2026-11-04) · [`03-stories/delivery-plan.md`](../03-stories/delivery-plan.md) names M1/M2/M3 and sizes 55 stories · [`04-decisions/open-questions.md`](../04-decisions/open-questions.md): every open question carries a recorded assumption, and OQ-27/OQ-31/OQ-35 were answered on 2026-11-08 | pending | | | | Re-opened 2026-11-14 by `CR-2026-11-14-practice-solver-screen`: the signed baseline named 73 stories and 141.5 story-days; the backlog is now **143.0** (`US-BAL-007` S → M for the practice screen). Re-signs when the Product Owner accepts the new size. Earlier signature: Chung Pham (Product Owner), 2026-11-08 — the baseline frozen here is the brief plus the delivery plan as they stand; `OQ-30` (anti-cheat) stays open and accepted, re-confirmed before `M3` |
| G2 | Contracts specified and checkable | [`01-overview/architecture.md`](../01-overview/architecture.md) and all of [`02-reference/`](../02-reference/) · every contract table names its oracle, with no empty cell (`pnpm verify:docs`, [`05-quality/test-plan-status.md`](test-plan-status.md)) · `NFR-01`…`NFR-29` measurable ([`nonfunctional-requirements.md`](../01-overview/nonfunctional-requirements.md)), plus the `pnpm budget` ratchet behind `NFR-03` · six ADRs in [`04-decisions/adr/`](../04-decisions/adr/) · [`06-reports/2026-11-08-independent-review.md`](../06-reports/2026-11-08-independent-review.md) | pending | | | | Re-opened 2026-11-14 by `CR-2026-11-14-practice-solver-screen`: `02-reference/screens/practice.md` and the `/practice` route are new contracts, so the set the 2026-11-08 signature covered is no longer the whole set. Re-signs after the screen ships and its oracle table resolves. Earlier signature: Chung Pham (Product Owner), 2026-11-08 — the five browser oracles the tables named but the repository lacked were written on 2026-11-08 (`errors`, `focus`, `profile`, `privacy`, `reconnect`); `prod-smoke.spec.ts` moved to the release stage (`cpt-release` RR7). The gaps that remain are listed in `test-plan-status.md` § 3 |
| G3 | Milestone accepted (UAT) | | pending | | | | 60 of 73 stories `done`, 13 `ready` (as of 2026-11-13); no UAT run yet |
| G4 | Cleared for production | | pending | | | | `cpt-release` has not run; no release record and no production credentials on this machine (`US-FND-004`) |

## History

| Date | Gate | Event | By | Reason |
|------|------|-------|----|--------|
| 2026-11-08 | G1 | signed | Chung Pham (Product Owner) | Requirements baseline frozen after the implementation wave; `OQ-27`/`OQ-31`/`OQ-35` answered the same day, so no open question is left without a recorded assumption |
| 2026-11-08 | G2 | signed | Chung Pham (Product Owner) | Contracts complete and checkable; the last five browser oracles were written and green (`pnpm e2e` 73 passed) before the signature |
| 2026-11-14 | G1 | re-opened | CR-2026-11-14-practice-solver-screen | The practice screen turned `US-BAL-007` from S into M (141.5 → 143.0 story-days) and added `02-reference/screens/practice.md`, so the frozen baseline and the signed contract set both moved. Both re-sign after `US-BAL-007` ships |
| 2026-11-14 | G2 | re-opened | CR-2026-11-14-practice-solver-screen | Same change: a new screen contract (`/practice`) with its own oracle table, which the 2026-11-08 signature did not cover |
