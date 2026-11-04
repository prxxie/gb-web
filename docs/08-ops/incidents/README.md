# Incidents

One record per SEV-1 or SEV-2 incident, written by `cpt-ops` from `.agents/templates/incident.md` and closed with a
postmortem within 3 working days of resolution.

| Field | Rule |
|-------|------|
| Id | `INC-YYYYMMDD-<slug>` |
| Root cause | How the failure was *possible*, not who was on shift |
| Actions | Each one is a story id, an open-question id, or an accepted risk with an owner |
| Link | The alert (from [`../runbook.md`](../runbook.md) § 4), the affected SLO in [`../slo.md`](../slo.md), and the release id if one is implicated |

No incidents recorded yet.
