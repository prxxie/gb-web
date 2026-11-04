# Rule 05 — Testing

Stack-specific commands and frameworks are in `AGENTS.md` § PROJECT and `docs/01-overview/conventions.md`. This rule
is what holds regardless of stack.

## 1. Tests first

For every story and bug fix:

1. Write a failing test that encodes one acceptance criterion (or the bug).
2. Run it and confirm it fails **for the expected reason**.
3. Write the minimum code to make it pass.
4. Refactor with the suite green.
5. Repeat for the next criterion.

**Batching.** For foundation/tooling stories (epic `FND`) and stories with many small, similar criteria, you may write
the tests for all criteria first, run them once (red), then implement. State that you batched.

**What counts as red.** A test must fail because the behavior is missing: an assertion failure, or a 404/405 for a
route that does not exist yet. An `ImportError` or collection error counts as red **only** for code that does not
exist at all yet (greenfield); once the module exists, create the minimal stub so the test fails on its assertion.

Exceptions — pure configuration, documentation, or spikes the user marked as throwaway — must be stated in the report.

**Record the red run.** The story's § 8 carries one line starting `Red:` that names the test which failed before the fix,
as an id — `tests/test_x.py::Class.test_method`, or `tests/x.test.mjs::case_name` once a project tests itself on
Node; several ids allowed. A story that genuinely has no failing test (prose,
a recorded run, a walk-through) writes `Red: none — <why>`, and the reason names the oracle instead. `verify-docs.mjs`
reads those lines: it reports a finished story with no `Red:` line, an id whose file, class or method does not exist, and
a bare `none` with no reason. It does not re-run the test — the line records a run that happened, and the verifier keeps
the record honest about *what* was run.

## 2. What to test

| Level | Covers | Required |
|-------|--------|----------|
| Unit | Functions, domain rules, validation, edge cases | Always |
| Integration | Boundaries: API endpoints, database, queues, external services (faked at the network edge) | When the story crosses a boundary |
| End-to-end | Critical user journeys named in the docs | When the story completes or changes such a journey |

- Name tests after behavior: `rejects_expired_token`, not `test_auth_2`.
- Arrange–Act–Assert. One behavior per test.
- Cover the unhappy paths the acceptance criteria imply: invalid input, missing permission, not found, conflict.
- Coverage target: the project's configured threshold, or 80% of changed lines if none is set.

## 3. Test hygiene

- Tests are deterministic: no real network, wall clock, or randomness without a seed or fake.
- Tests are independent: no order dependence, no shared mutable state. A test that changes shared infrastructure
  (schema migrations up/down, global config) runs against its own throwaway resource, never the shared test database.
- Never weaken, skip, or delete a failing test to get green. Fix the code, or — if the test is wrong — say why.
- Never mark a story done on a test run you did not execute in this session.
