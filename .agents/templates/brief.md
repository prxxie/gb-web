---
name: <project name>
tier: standard            # lite | standard | full
project_types: []         # web-app | api-service | mobile-app | cli-tool | library | data-ml | integration | desktop-app
status: draft             # draft | confirmed
updated: YYYY-MM-DD
---

# Project brief — <project name>

> Written by `cpt-interview`. Source of truth for `cpt-docs` and `cpt-plan`.
> Every fact carries a source tag: `[user]`, `[user: delegated]`, `[spec: <file>#<section>]`, `[inferred]`, or
> `[assumption: OQ-nn]`. A section with nothing to say reads `_not applicable_ — <reason>`.

## 1. Problem

<What problem, for whom, and what they do today instead.>

## 2. Users

| User type | Needs to get done | Notes |
|-----------|-------------------|-------|
| | | |

## 3. Goals and success measures

| Goal | Measure | Target |
|------|---------|--------|
| | | |

## 4. Scope

**In scope (first release)**

- <capability> [user]

**Out of scope**

- <item> [user]

## 5. Constraints

- **Deadline**:
- **Team**:
- **Budget**:
- **Mandated technology**:
- **Compliance**:

## 6. Tech stack

| Layer | Choice | Source | Rationale |
|-------|--------|--------|-----------|
| | | | |

**Candidate packs**: <pack (why), …> — a hint for `cpt-pack`, which installs nothing until the stack ADR justifies it

## 7. Data

<Main entities and relationships, sources, volume, retention, sensitive data, entities with statuses.>

## 8. Identity and roles

| Role | Can do | Cannot do |
|------|--------|-----------|
| | | |

Authentication method:

## 9. Non-functional requirements

| Area | Requirement | Source |
|------|-------------|--------|
| Performance | | |
| Availability | | |
| Security / privacy | | |
| Accessibility | | |
| Localization | | |
| Audit / logging | | |

## 10. Integrations

| System | Direction | Purpose | Auth | Docs / sandbox | Owner |
|--------|-----------|---------|------|----------------|-------|
| | | | | | |

## 11. Environments and deployment

- **Environments**:
- **Hosting / distribution**:
- **Code hosting and CI/CD**:

## 12. Quality expectations

- **Testing**:
- **Definition of Done extras**:

## 13. Delivery

- **Milestones**:
- **Team and roles**:
- **Product owner (answers open questions)**:
- **Cadence**:
- **Reporting**:
- **Reporting language**: <code, default en; e.g. vi> — client-facing reports; docs stay English

## 14. Type-specific

<One `### <type>` subsection per project type, filled from its question module.>

## 15. Assumptions and open questions

As of the interview only — later questions live in `docs/04-decisions/open-questions.md`.

| Id | Topic | Assumption in use |
|----|-------|-------------------|
| | | |
