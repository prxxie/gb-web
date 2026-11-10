# GBW — Game Bắn Súng Đạn Đạo Theo Lượt

A turn-based artillery game for mobile browsers: two teams, wind and gravity, one shot per turn, delivered as an
installable PWA. Players create a room, share a 6-character code, pick teams and play in landscape; a Cloudflare backend
only pairs them and records results, while the match itself runs peer-to-peer from the host's simulation. Registered
players climb an Elo ladder; guests and a bot mode need no account.

## Facts

| Field | Value |
|-------|-------|
| Tier | `full` (client contract, gates M1/M2/M3) |
| Project types | `web-app` (PWA frontend + thin API/WebSocket backend) |
| Stack | Phaser 4.2 + React 19 + Vite 8 + TypeScript 5; Cloudflare Workers + Durable Objects + D1; Clerk (auth); Cloudflare TURN; Cloudflare Pages |
| Stack packs | `react-vite`, `api`, `browser-verify` |
| Source spec | [`00-source/gbw-spec.md`](00-source/gbw-spec.md) · brief: [`00-source/brief.md`](00-source/brief.md) |
| Languages | vi (default) + en |

<!-- cpt:stats -->
| Stories | Done | In progress | Ready | Blocked | Draft | Closed |
|---|---|---|---|---|---|---|
| 56 | 49 | 0 | 7 | 0 | 0 | 0 |

Open questions: **Open: 13 · Blocking: 0 · Answered: 29 · Withdrawn: 1**
<!-- /cpt:stats -->

## Start here

| You are… | Read |
|----------|------|
| New to the project | [`01-overview/project-overview.md`](01-overview/project-overview.md), then [`01-overview/architecture.md`](01-overview/architecture.md) |
| Setting up a machine | [`01-overview/environment-setup.md`](01-overview/environment-setup.md) |
| Working on the game simulation, physics or netcode | [`02-reference/data/room-state.md`](02-reference/data/room-state.md), [`02-reference/api/signaling.md`](02-reference/api/signaling.md), [`01-overview/workflow-state-machine.md`](01-overview/workflow-state-machine.md) |
| Working on the backend (Worker, DO, D1) | [`01-overview/architecture.md`](01-overview/architecture.md), [`02-reference/api/README.md`](02-reference/api/README.md), [`02-reference/data/README.md`](02-reference/data/README.md) |
| Working on the frontend (routes, HUD, i18n) | [`02-reference/screens/README.md`](02-reference/screens/README.md), [`01-overview/conventions.md`](01-overview/conventions.md) |
| Testing / QA | [`05-quality/test-cases.md`](05-quality/test-cases.md), [`05-quality/test-plan-status.md`](05-quality/test-plan-status.md), [`01-overview/environment-setup.md`](01-overview/environment-setup.md) § 6–7 |
| PM / BA / client-facing | [`01-overview/project-overview.md`](01-overview/project-overview.md), [`04-decisions/open-questions.md`](04-decisions/open-questions.md), [`05-quality/acceptance-signoff.md`](05-quality/acceptance-signoff.md) |
| Shipping a release | [`07-release/README.md`](07-release/README.md), [`01-overview/deployment.md`](01-overview/deployment.md) |
| On call / operations | [`08-ops/runbook.md`](08-ops/runbook.md), [`08-ops/slo.md`](08-ops/slo.md) |
| Generating or reviewing the art | [`02-reference/art/sprite-brief.md`](02-reference/art/sprite-brief.md) — sizes, anchors, palette, prompts; gated by `OQ-20` and [`ADR-0006`](04-decisions/adr/ADR-0006-vector-renderer-until-after-m2.md) |
| Picking up work | [`03-stories/README.md`](03-stories/README.md) — the backlog, then [`03-stories/delivery-plan.md`](03-stories/delivery-plan.md) |
| Using an AI agent on this repo | [`../AGENTS.md`](../AGENTS.md) — the working agreement lives there and in `.agents/rules/` |

The "picking up work" row (→ `03-stories/README.md`) is added by `cpt-plan` once the backlog exists.

## Layout

```
docs/
├─ 00-source/      the original spec, the brief, the ingest report; change requests
├─ 01-overview/    project overview, architecture, glossary, NFRs, conventions,
│                  roles and permissions, workflow state machines, environment setup, deployment
├─ 02-reference/   api/ (README, rooms, accounts, matches, signaling), data/ (README, accounts, matches, room-state),
│                  screens/ (README, main, sign-in, profile, leaderboard, lobby, match, results),
│                  art/ (sprite-brief.md — the hand-off package for generating the art), gameplay/ (tunables, modes)
├─ 03-stories/     backlog: epics and user stories (created by cpt-plan)
├─ 04-decisions/   open-questions.md, adr/ (ADR-0001…ADR-0006)
├─ 05-quality/     test-cases.md, acceptance-signoff.md (gates G1–G4)
├─ 06-reports/     status, weekly and sprint reports; SLO snapshots
├─ 07-release/     release index and REL-… records
└─ 08-ops/         runbook.md, slo.md, incidents/
```

## Blocking open questions

No story is blocked: one question (`OQ-02`) is an accepted assumption inside the damage stories, and every other open
question carries a recorded default (see [`04-decisions/open-questions.md`](04-decisions/open-questions.md)).

| Id | Question | Effect |
|----|----------|--------|
| `OQ-02` | HP scale and the blast-damage curve, friendly fire on | Balance tuning inside `US-CORE-003`; the recorded default (1,000 scale, friendly fire on) is what ships unless the client changes it |
| `OQ-33` | What load must the system carry at launch? | `US-OPS-003` passes on the recorded target (50 rooms ≈ 400 players) |

Questions a story builds on are listed as `accepted_assumptions` in that story, so work does not stop for them (`OQ-04`,
`OQ-07`, `OQ-17`, `OQ-28`…`OQ-35`).
