# Acceptance and stage-gate sign-off

Full-tier gate record. One row per gate; `cpt-signoff` fills the evidence and the signature, and nothing else writes
this file. Rows are never deleted — a re-opened gate keeps its history in `## History`.

Gate meanings, evidence requirements, and the waiver rules live in `.agents/skills/cpt-signoff/SKILL.md` § 1 and § 4.
`Status` is `pending`, `signed`, or `waived`. A `signed` row names the signer, the role, the date, and evidence that
resolves; a `waived` row names who accepted the risk, the compensating control, and the follow-up story in `Note`.

| Gate | Criterion | Evidence | Status | Signed by | Role | Date | Note |
|------|-----------|----------|--------|-----------|------|------|------|
| G1 | Requirements baseline agreed and planned | | pending | | | | |
| G2 | Contracts specified and checkable | | pending | | | | |
| G3 | Milestone accepted (UAT) | | pending | | | | |
| G4 | Cleared for production | | pending | | | | |

## History

| Date | Gate | Event | By | Reason |
|------|------|-------|----|--------|
| | | | | |
