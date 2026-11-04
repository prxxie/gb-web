# Rule 04 — Git and pull requests

## 1. Branches

- One branch per story: `<type>/<STORY-ID>-<short-slug>`, e.g. `feat/US-AUTH-001-email-sign-in`.
- Docs-only work: `docs/<short-slug>`. Change requests: `docs/CR-<YYYY-MM-DD>-<slug>`.
- Never commit directly to the default branch, except the initial commits in § 4.

## 2. Commits

Conventional commits, with the story id in the subject when there is one:

```
<type>(<scope>): <description> [<STORY-ID>]

<optional body: why, not what>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.

- One logical change per commit. Code and the docs it changes go in the **same** commit.
- Never commit secrets, `.env` files, generated build output, or large binaries.
- Commit only when the user asked for it or the active skill's instructions say to.

## 3. Pull requests

- Title: same format as a commit subject.
- Body: story link, summary of changes, how it was verified (commands run and results), safety flags (⚠️ breaking
  change, migration, security-sensitive), and follow-ups.
- Run `cpt-review` on the branch before opening the PR.

## 4. Local repository without a remote

When there is no remote (typical at project start):

1. `git init`; the first commit on the default branch is the scaffold (`chore: add CPT scaffold`), the second the
   generated docs (`docs: add brief, doc set, and backlog`) — the user's go-ahead to run the workflow covers these.
2. Each story still gets its own branch.
3. "Opening a PR" becomes: run `cpt-review` on the branch. With APPROVE (or APPROVE WITH NITS), merge locally:
   `git switch <default> && git merge --no-ff <branch>`; then delete the branch.
4. When a remote is added later, switch to the PR flow above.
5. Commit under the user's own git identity. Never set `user.name` / `user.email`, `--author`, or `GIT_AUTHOR_*` /
   `GIT_COMMITTER_*` yourself; if git reports no identity, stop and ask the user to configure it. An invented identity
   cannot be told apart from a real teammate in the history or in a report built from it.

## 5. Tags

A release is tagged on the commit it was deployed from, annotated with the release id:

```bash
git tag -a v1.4.0 -m "REL-004 — <one line>" <sha>
```

- Tag names follow `v<major>.<minor>.<patch>` from the release record; the record's `commit` and the tag point at the
  same sha, and a mismatch is a bug worth stopping for.
- Tag after the deploy is verified, not before — a tag on a failed release forces everyone who pulls it onto a
  version that never ran.
- Never move or delete a published tag. A wrong release gets a new patch version, or `status: rolled-back` on the
  existing record when nothing shipped.
- A hotfix branches from the deployed tag (`cpt-release` § 8), so tags are the only way back to what production runs.

## 6. Never without explicit permission

Force-push, rewrite published history, delete branches, change remotes, or push to a shared branch.
