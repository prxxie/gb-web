# Stories

The backlog. One story is one vertical slice that `cpt-ship` can finish end to end: acceptance criteria a stranger can
decide, a contract that already exists in `02-reference/`, and tests that prove it.

## Backlog at a glance

<!-- cpt:stats -->
| Stories | Done | In progress | Ready | Blocked | Draft | Closed |
|---|---|---|---|---|---|---|
| 53 | 40 | 0 | 13 | 0 | 0 | 0 |

Open questions: **Open: 15 · Blocking: 0 · Answered: 26 · Withdrawn: 1**
<!-- /cpt:stats -->

## Epics

<!-- cpt:epics -->
| Epic | Code | Title | Stories | Done | Blocked |
|---|---|---|---|---|---|
| [EPIC-00-foundation](EPIC-00-foundation/README.md) | FND | Repository, tooling and delivery pipeline | 4 | 3 | 0 |
| [EPIC-01-accounts](EPIC-01-accounts/README.md) | AUTH | Identity, guest sessions and profiles | 4 | 4 | 0 |
| [EPIC-02-rooms](EPIC-02-rooms/README.md) | ROOM | Rooms, lobby, presence and host migration | 7 | 6 | 0 |
| [EPIC-03-match-core](EPIC-03-match-core/README.md) | CORE | Deterministic match simulation | 14 | 14 | 0 |
| [EPIC-04-netplay](EPIC-04-netplay/README.md) | NET | Peer-to-peer transport and host authority | 4 | 4 | 0 |
| [EPIC-05-match-ui](EPIC-05-match-ui/README.md) | MATCH | Match scene, touch aiming and HUD | 7 | 7 | 0 |
| [EPIC-06-ranked](EPIC-06-ranked/README.md) | RANK | Results, match records, Elo and leaderboard | 5 | 0 | 0 |
| [EPIC-07-pwa-i18n](EPIC-07-pwa-i18n/README.md) | PWA | Installable PWA, offline play, bilingual UI and accessibility | 4 | 2 | 0 |
| [EPIC-08-ops](EPIC-08-ops/README.md) | OPS | Observability, load evidence and release | 4 | 0 | 0 |
<!-- /cpt:epics -->

## Blocked stories

**None.** Every story is `ready`: the questions that used to gate work are answered (`OQ-25` schedule, `OQ-26`
account/PII, `OQ-18` no-decompilation basis), and the remaining open questions carry recorded defaults that each story
lists in `accepted_assumptions`. Two of them are still *delivery prerequisites* rather than story blockers — the Clerk
application and its privacy policy must exist before the M2 gate, and the load target (`OQ-33`) fixes the pass criteria of
`US-OPS-003`.

## How to read a story

| Section | What it gives you |
|---------|-------------------|
| § 2 Context | The two or three reference documents that define the contract |
| § 3 Acceptance criteria | `AC1…ACn` in given/when/then, each naming the test case that proves it |
| § 4 Contract | The message, payload or function the code must match exactly |
| § 5 Rules and edge cases | The boundaries that are easy to get wrong |
| § 6 Implementation notes | Where the code goes, which files already exist |
| § 8 Test notes | The `TC-…` ids and the red-first test |
| § 9 Open questions | Every OQ that touches the story, with the assumption it is built on |

## Suggested order

The [delivery plan](delivery-plan.md) groups the backlog into six waves with the gates that must be answered before each
one starts. The first three stories to ship are [US-FND-001](EPIC-00-foundation/US-FND-001-set-up-the-workspace.md),
[US-FND-002](EPIC-00-foundation/US-FND-002-worker-skeleton-and-health.md) and
[US-FND-003](EPIC-00-foundation/US-FND-003-web-shell.md).
