---
name: cpt-release
description: Cut and deploy a release — gather what shipped since the last one, choose the version, run the release-readiness checks, write the release record in docs/07-release/, promote staging → production following deployment.md, record evidence, and roll back when the checks fail. Use when the user says "release", "deploy", "cut a version", "tag v1.2.0", "promote to prod", or "hotfix".
---

# cpt-release [<version> | --hotfix <US-…>]

`cpt-ship` ends at "reviewed, committed, merged". This skill starts there and ends at "running in an environment,
with evidence and a written way back". A release is a **record plus proof**, never a push plus a promise.

Read first: `AGENTS.md` § PROJECT (build/test/deploy commands, tier), `docs/01-overview/deployment.md` (environments,
pipeline, who may deploy), `docs/07-release/README.md` (last release), and the stories that shipped since it.

## 0. Tier and refusal

| Tier | Behaviour |
|------|-----------|
| `lite` | Release records are optional. If the project is deployed anywhere, write a one-page record; skip § 5 promotion when there is only one environment. |
| `standard` | Every deployment to a shared or production environment gets a record. |
| `full` | Every deployment gets a record, and production additionally needs `cpt-signoff` gate G4 before § 5. |

**Stop and report instead of deploying** when any of these is true — each has an owner, not a workaround:

- `deployment.md` is missing or still has `(planned)` steps for this environment → run `cpt-docs` for that file first.
- The rollback procedure is empty, untested, or requires a step nobody present can run.
- An included story is not `done`, or its DoD was graded against a different commit than the one you are shipping.
- A migration cannot be reversed and no backup/restore was verified.
- The only way forward requires a secret in the record, in a command line, or in the repo.
- Production, and `cpt-signoff` gate G4 is unsigned (full tier).

Never invent an environment, a command, or a URL. Reuse what `deployment.md` and `AGENTS.md` § PROJECT say, and if they
are stale, fix them in the same change (rule 03 D5).

## 1. Gather what shipped

1. Find the previous release: the newest record in `docs/07-release/` with `status: deployed`. Its `version` is
   `previous`; its `date` (or `commit`) is the baseline.
2. List the stories that closed the gap — do not guess from memory:
   - `git log <previous-commit>..HEAD --oneline --grep 'US-[A-Z]\{2,6\}-[0-9]\{3\}'` for the commits,
   - then confirm each story's frontmatter is `status: done` and the story is not already listed in an earlier record.
3. For each story, take the ⚠️ safety flags out of its review/commit messages: breaking contract, data migration,
   security-sensitive. These decide the version in § 2 and the order of § 3.
4. If nothing shipped, say so and stop. There is no empty release.

## 2. Choose the version

`<major>.<minor>.<patch>`, recorded in the record's frontmatter and in the tag. The change set decides it, not taste:

| Signal in the gathered set | Bump |
|----------------------------|------|
| A ⚠️ breaking change to a published contract (API response shape, CLI flag, DB column, exported signature) | **major** |
| Any new story, new endpoint, new screen, new capability | **minor** |
| Only `fix:` stories, refactors, docs, dependency patches | **patch** |

Pre-1.0 projects still bump minor for breaking changes and say so in the record's `## Changes` — an unpublished
contract breaking is not a major event for a project nobody depends on yet.

`--hotfix` always produces a patch. A hotfix that needs a minor or major bump is a release, not a hotfix: stop and run
the normal path on a branch.

## 3. Release-readiness gate — RR1–RR8

Run `.agents/rules/03-definition-of-ready-and-done.md` § 4 in full. Report each check with its evidence; a check with
no evidence is a failed check, not a note. Any failure stops the release — do not deploy "the parts that are ready".

## 4. Write the release record

`docs/07-release/REL-<nnn>-<slug>.md`, `nnn` continuing from the highest existing record (no gaps, no reuse), slug from
the theme or version. Fill `docs/07-release/README.md`'s `cpt:releases` block by running
`node .agents/scripts/verify-docs.mjs --fix` — never type the index by hand.

Copy `.agents/templates/release.md` and complete every section; `verify-docs.mjs` rejects a record with an empty
required section, an unknown story id, a `deployed` record without a commit, or a production record without an
approver.

- **Included stories** — table of `US-…` ids with title and epic. Only `done` stories.
- **Changes** — breaking ⚠️ first, then features, then fixes, in the user's words, not commit subjects.
- **Migrations** — forward, backfill, reverse; `none — <reason>` when there are none. Irreversible steps say ⚠️ and
  name the backup that makes them recoverable.
- **Pre-release gates** — RR1–RR8 with the evidence: commit sha, exact commands, result lines.
- **Deployment** — the exact steps per environment, in order, as commands from `deployment.md`. Not "run the pipeline".
- **Post-deploy checks** — the smoke path through each critical flow, the SLO/error-budget signal, and how long to watch.
- **Rollback** — trigger, steps, data implications, who runs it. Copy the commands, not a reference to another doc.
- **Notes** — known issues shipped anyway, follow-ups, related change requests and incidents.

The record is written **before** deploying (`status: planned`), updated **as** you deploy (evidence, sha), and finalized
(`status: deployed` or `rolled-back`) after § 6 — a record written from memory afterwards is a fiction.

## 5. Deploy

Promote in order; never skip an environment that `deployment.md` lists unless the record says why.

1. **Staging** (or the first non-production environment): deploy the exact commit you verified. Re-run the smoke path.
   If staging fails, fix on a story branch — do not "deploy again and hope".
2. **Production**: only with staging green, and (full tier) gate G4 signed. State in one line who is deploying, what
   changes for users, and what you will watch. Record that same person in `approved_by` — a production record without
   an approver is rejected by `verify-docs.mjs`, because "the release was approved" with no name on it is exactly the
   claim an auditor cannot check.
3. Record for each environment: environment, timestamp (UTC), commit sha, pipeline/run id or command, who ran it, result.
   Redact secrets — a token in a release record is a leaked token.

If a step in `deployment.md` turns out to be wrong, the doc is wrong: fix it in the same change and say so in the
report. The next release will trust it.

## 6. Verify after deploy

Run the post-deploy checks from the record, in the deployed environment, and paste the results:

- the smoke path for every critical flow the release touched (browser check where the tool has automation, per
  `cpt-ship` § 5);
- the health endpoint / readiness probe, with its expected response;
- the SLO or error-budget signal named in the record, watched for the recorded window;
- a rollback rehearsal for anything with a migration, on non-production data.

Green → `status: deployed`, `commit` and `deployed_at` filled. Red → § 7. Do not report a release as done on the
strength of a pipeline that turned green: a pipeline proves the artifact, not the behaviour.

## 7. Rollback

Execute the record's rollback procedure — it is written before deploying precisely so that nobody improvises it under
pressure.

1. Announce in one line: what is being rolled back, to which version, and what users should expect.
2. Run the steps as written. If a step is wrong, stop, note it, and take the next safest step — then fix the record.
3. Set the record `status: rolled-back` and fill the rollback outcome (what ran, how long, data state).
4. Open an incident with `cpt-ops` (SEV per impact). The release record links it; the incident owns the follow-up.
5. Do not re-release the same commit. Fix forward on a story branch, then a new record.

## 8. Hotfix path

`cpt-release --hotfix <US-…>` — a production defect that cannot wait for the next planned release.

1. There must be a `fix:` story (`rule 03 § 3`: a post-merge defect is a **new** story, not a reopened one). If none
   exists, create it with `cpt-plan` first — a hotfix with no story has no acceptance criterion and cannot be reviewed.
2. Branch from the **deployed tag**, not from the default branch, so the hotfix carries nothing unreleased.
3. Fast-track DoR to R1–R3 and run the full DoD for that one story; `cpt-review` still applies, with the diff scope
   limited to the fix.
4. Patch version, minimal record, staging smoke, production, § 6 checks — shortened, never skipped.
5. Back-merge the fix into the default branch the same day (`git merge --no-ff`), or the next release silently removes
   it. Say in the record that the back-merge happened.

## 9. Hand-off

```
Released REL-004 — 1.4.0 → production (commit 1a2b3c4)
Included: 5 stories (US-AUTH-003, US-CLAIM-002, …) · 1 ⚠️ migration
Verified: build ✅ · tests 412 passed ✅ · smoke 6/6 ✅ · error budget OK for 30 min
Rollback: written, rehearsed on staging · owner @ops
Docs: deployment.md, 07-release/README.md, CHANGELOG updated
Next: cpt-ops runbook/SLO refresh · cpt-report weekly includes REL-004
```

- Update the product changelog if the project has one (root `CHANGELOG.md`), newest version first.
- `cpt-report` reads release records for its "done in period" section — a release nobody recorded does not exist in
  the report.
- A change to `deployment.md` that this release proved wrong, or a new environment, is `cpt-docs` work: record it now.

## 10. Things this skill never does

- Deploy an unverified commit, or a commit other than the one the record names.
- Delete or rewrite a record to hide a failed release; `rolled-back` is a normal, honest status.
- Put a secret, token, password, or customer data in a record, a command line, or a commit.
- Move a story back to `in-progress` because its release failed — the story is still done; the release failed.
- Skip the rollback section because "the deploy is simple".
