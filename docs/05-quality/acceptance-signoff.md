# Acceptance and stage-gate sign-off

Full-tier gate record. One row per gate; `cpt-signoff` fills the evidence and the signature, and nothing else writes
this file. Rows are never deleted — a re-opened gate keeps its history in `## History`.

Gate meanings, evidence requirements, and the waiver rules live in `.agents/skills/cpt-signoff/SKILL.md` § 1 and § 4.
`Status` is `pending`, `signed`, or `waived`. A `signed` row names the signer, the role, the date, and evidence that
resolves; a `waived` row names who accepted the risk, the compensating control, and the follow-up story in `Note`.

| Gate | Criterion | Evidence | Status | Signed by | Role | Date | Note |
|------|-----------|----------|--------|-----------|------|------|------|
| G1 | Requirements baseline agreed and planned | [`00-source/brief.md`](../00-source/brief.md) `status: confirmed` (2026-11-04) · [`03-stories/delivery-plan.md`](../03-stories/delivery-plan.md) names M1/M2/M3 and sizes 55 stories · [`04-decisions/open-questions.md`](../04-decisions/open-questions.md): every open question carries a recorded assumption, and OQ-27/OQ-31/OQ-35 were answered on 2026-11-08 | signed | Chung Pham | Product Owner | 2026-11-08 | Signed after the implementation wave: the baseline frozen here is the brief plus the delivery plan as they stand. `OQ-30` (anti-cheat) stays open and accepted; it is re-confirmed before `M3` |
| G2 | Contracts specified and checkable | [`01-overview/architecture.md`](../01-overview/architecture.md) and all of [`02-reference/`](../02-reference/) · every contract table names its oracle, with no empty cell (`pnpm verify:docs`, [`05-quality/test-plan-status.md`](test-plan-status.md)) · `NFR-01`…`NFR-29` measurable ([`nonfunctional-requirements.md`](../01-overview/nonfunctional-requirements.md)), plus the `pnpm budget` ratchet behind `NFR-03` · six ADRs in [`04-decisions/adr/`](../04-decisions/adr/) · [`06-reports/2026-11-08-independent-review.md`](../06-reports/2026-11-08-independent-review.md) | signed | Chung Pham | Product Owner | 2026-11-08 | The five browser oracles the tables named but the repository lacked were written on 2026-11-08 (`errors`, `focus`, `profile`, `privacy`, `reconnect`); `prod-smoke.spec.ts` moved to the release stage (`cpt-release` RR7). The gaps that remain are listed in `test-plan-status.md` § 3 |
| G3 | Milestone accepted (UAT) | | pending | | | | 46 of 55 stories `done`, 9 `ready`; no UAT run yet |
| G4 | Cleared for production | | pending | | | | `cpt-release` has not run; no release record and no production credentials on this machine (`US-FND-004`) |

## History

| Date | Gate | Event | By | Reason |
|------|------|-------|----|--------|
| 2026-11-08 | G1 | signed | Chung Pham (Product Owner) | Requirements baseline frozen after the implementation wave; `OQ-27`/`OQ-31`/`OQ-35` answered the same day, so no open question is left without a recorded assumption |
| 2026-11-08 | G2 | signed | Chung Pham (Product Owner) | Contracts complete and checkable; the last five browser oracles were written and green (`pnpm e2e` 73 passed) before the signature |
