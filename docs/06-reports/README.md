# Reports

Status, weekly and sprint reports live here, written by `cpt-report`:

| File | Cadence | Audience |
|------|---------|----------|
| `weekly/YYYY-Www.xlsx` | Every Friday | Client project manager (Vietnamese, from the CPT weekly template) |
| `status-YYYY-MM-DD.md` | On request, and at each gate | Team + client |
| `slo-snapshots/YYYY-MM.md` | Monthly | Ops (feeds [`08-ops/slo.md`](../08-ops/slo.md) § 4) |

Reports are generated from the story backlog, open questions, change requests and git history — never written from
memory. A report that contradicts `03-stories/README.md` is a defect in the report.

Reported so far:

| File | What it records |
|------|-----------------|
| [`2026-11-05-implementation-status.md`](2026-11-05-implementation-status.md) | What the one-pass implementation built, and which checks needed an environment this machine did not have |
| [`status-2026-11-05-verification-pass.md`](status-2026-11-05-verification-pass.md) | Independent re-run of those claims, the evidence it produced under `05-quality/evidence/`, and the findings that keep stories at `ready` |
