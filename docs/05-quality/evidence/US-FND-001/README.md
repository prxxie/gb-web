# US-FND-001 — workspace commands, local run

- Ran: 2026-11-05, Linux, Node v22.22.2, pnpm 10.33.0, clean working tree at `6a89506`
- Commands and results:
  - `npx tsc -b` → exit 0, three projects, no diagnostics
  - `npx eslint .` → exit 0, no findings
  - `npx vitest run` → `Test Files 12 passed (12)`, `Tests 102 passed (102)`, 2.50 s
  - `node .agents/scripts/verify-docs.mjs` → `0 error(s), 0 warning(s)`
- Proves AC2 (three commands green) and AC3 by inspection: no `phaser`/DOM/network import appears in `packages/core/src`
- Not proven: AC1 (no clean-checkout run), AC4 (`pnpm build` not re-run in this pass), AC5 (`.env.example` does not exist),
  AC6 (no GitHub remote, so no CI), AC7 (markers are gone from `AGENTS.md` but `environment-setup.md` was not re-read)
- Findings raised in the same pass: the documented test layout `tests/{core,worker,web}` does not match the repository
  (`packages/core/tests`, `apps/worker/tests`, `apps/web/tests`), and 65 oracle test files named across `docs/` do not
  exist. See `docs/06-reports/2026-11-05-verification-pass.md`.
