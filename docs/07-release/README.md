# Releases

One record per release: what shipped, which story ids, the evidence collected, and the rollback target. Records are
written by `cpt-release` from `.agents/templates/release.md`; the table below is generated from them — never type in it.

A release is cut from `main` only after the production workflow's smoke checks pass
([deployment.md](../01-overview/deployment.md) § 5). Gate signatures for `M1`, `M2`, `M3` live in
[acceptance-signoff.md](../05-quality/acceptance-signoff.md), not here.

<!-- cpt:releases -->
| Release | Version | Date | Environment | Status | Stories |
|---|---|---|---|---|---|
<!-- /cpt:releases -->
