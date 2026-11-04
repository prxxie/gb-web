---
id: US-OPS-004
title: Cut the release and go live with evidence for every gate
epic: EPIC-08-ops
status: ready
priority: P0
size: M
depends_on: [US-FND-004, US-OPS-002, US-OPS-003, US-PWA-001]
open_questions: []
accepted_assumptions: []
refs: [07-release/README.md, 05-quality/acceptance-signoff.md, 01-overview/deployment.md]
---

# US-OPS-004 — Cut the release and go live with evidence for every gate

## 1. Story

**As the** tech lead with the client
**I want** one rehearsed release with the two-phone matrix, the load report and the rollback drill attached
**so that** go-live is a decision backed by evidence rather than a date.

## 2. Context

Release readiness RR1–RR8 and the G1–G4 gates require evidence; this story produces the M1 demo build, the M2 UAT build
and the M3 production release with a release record each, following `cpt-release` and `docs/07-release/README.md`.

| Topic | Reference |
|-------|-----------|
| Release record shape | [07-release/README.md](../../07-release/README.md) |
| Gate evidence and signatures | [acceptance-signoff.md](../../05-quality/acceptance-signoff.md) |
| Environments and rollback | [deployment.md](../../01-overview/deployment.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A release candidate | `cpt-release` runs | `docs/07-release/REL-<yyyy.mm.dd>-<n>.md` exists with scope, evidence links, rollback plan and the deployed versions (`TC-OPS-902`) |
| AC2 | The two-phone matrix | It is executed in landscape | A 1v1, a 2v2 and an 8-player room each play to a winner, with Wi-Fi ↔ cellular switches and one host kill (`TC-OPS-180`, `TC-OPS-183`, `TC-OPS-184`) |
| AC3 | The rollback plan | It is rehearsed on the preview environment | It restores the previous worker and Pages build within 5 minutes, and the rehearsal is recorded |
| AC4 | Production after deploy | `GET /api/v1/health` is called | It returns the released sha, the leaderboard loads, and one live match completes on two devices |
| AC5 | The sign-off sheet | It is completed | Each gate row cites evidence that existed before the signature; an unsigned gate stays `pending` |
| AC6 | A failed readiness check | The release is attempted | It stops before production, and the failed check and its cause are recorded in the release record |

## 4. Contract

Release record frontmatter/sections per `07-release/README.md`; one line appended to its `cpt:releases` block
(`- REL-… — <summary> — <date>`). Evidence artefacts: load report (`US-OPS-003`), SLO snapshot of the day
(`US-OPS-002`), two-phone matrix table, rollback rehearsal log, `verify-docs` output.

## 5. Rules and edge cases

- No release without a green `verify-docs` and a green e2e job on the candidate commit.
- A hotfix follows the same record with `type: hotfix` and still needs the two-phone check for the touched path.
- No third-party implementation, asset or data file is part of the basis (`OQ-18`, closed): the release record states
  that the game is an original implementation of genre rules, so nothing about the demo or the launch waits on a rights
  holder.
- The release record never contains a secret or a credential, including a TURN key id.
- A migration that cannot be reversed is named in the rollback plan with its D1 export.

## 6. Implementation notes

- Follow `.agents/skills/cpt-release/SKILL.md`; keep the record short (scope, evidence, rollback, verification).
- The two-phone matrix template lives in `docs/05-quality/test-cases.md` (manual rows) and is copied into the record.

## 7. Out of scope

- Marketing launch, store submission, support staffing.

## 8. Test notes

`TC-OPS-902` (record completeness), `TC-OPS-180`, `TC-OPS-183`, `TC-OPS-184` (device matrix). All manual, with artefacts.

## 9. Open questions

- **OQ-25** (open) — the 13-week schedule and the M1/M2/M3 commitments are still being negotiated with the client; this
  story cannot be committed to a date until that answer lands.
- **OQ-18** (answered) — no decompilation, asset or data file is used; the client confirmed nothing else is needed, so
  the constraint on this story is gone.
- **OQ-15** (accepted assumption) — two developers plus a part-time reviewer is the capacity the plan assumes; a single
  developer moves M3 by roughly four weeks (see the delivery plan).

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**in-progress.** the release record, the rollback rehearsal and the go-live sign-off cannot happen before `FND-004` and a Cloudflare account are in place.
