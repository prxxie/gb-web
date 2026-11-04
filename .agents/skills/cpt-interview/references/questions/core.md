# Core question bank

Each question names the brief section it fills. **[lite]** marks questions asked in the lite tier. Suggested defaults
are starting points — adapt them to what you already know.

This bank is a **coverage checklist**: each question must end up answered, inferred (and stated to the user), or
not applicable. Ask only what you cannot infer, ≤4 per round (see SKILL.md § How to ask). Questions marked
**(infer)** are usually answerable from earlier answers — state your inference rather than asking.

## Answer quality

A row is `answered` only when the answer can be written as a fact. These are the ways a core answer usually stays
unusable — ask once more instead of writing it down:

| # | Unusable | Ask for, then record |
|---|----------|----------------------|
| C1 | "an app for claims" | what people do today instead, with which tool, and what it costs them |
| C3 | "users are happy" | a number and the moment it is measured: "claim submitted in <2 min, three months after launch" |
| C4 | a list with no edge | the capabilities whose absence would make release one a failure — everything else is C5 |
| C5 | "no particular exclusions" | one thing deliberately not built in release one, and why |
| C6 | "normal constraints" | deadline, people and skills, mandated stack, compliance — each a value or "none" |
| C7 | "a website" | the kind of thing from the type list, plus where it runs |

An answer that is still vague after one follow-up becomes an open question with a stated assumption — not a fact in the
brief, and not a silent guess.

## Round 1 — Core (all tiers)

| # | Question | Fills | Notes / default |
|---|----------|-------|-----------------|
| C1 | **[lite]** What problem does this solve, and for whom? What do they do today instead? | 1. Problem | Push for a concrete current workaround |
| C2 | **[lite]** (infer) Who are the users? List each kind of user and what they need to get done. | 2. Users | Becomes actors and roles |
| C3 | **[lite]** What does success look like? How would you measure it 3 months after launch? | 3. Goals | One measurable outcome minimum |
| C4 | **[lite]** What must the first release do? List the capabilities you'd be unhappy to ship without. | 4. Scope | Becomes the MVP epics |
| C5 | **[lite]** What is explicitly out of scope for the first release? | 4. Scope | Default: everything not in C4 |
| C6 | **[lite]** Constraints: deadline, team size and skills, budget, mandated technology, compliance (GDPR, HIPAA, PCI, internal policy)? | 5. Constraints | |
| C7 | **[lite]** (infer) What kind of thing is it — web app, API, mobile app, CLI, library, data/ML pipeline, integration/automation, desktop app? | Frontmatter `project_types` | Infer, then confirm |
| C8 | **[lite]** (infer) Who is this for and how long will it live — prototype, team product, or client delivery? | Frontmatter `tier` | See tiers.md |

## Round 3 — Cross-cutting

| # | Question | Fills | Notes / default |
|---|----------|-------|-----------------|
| X1 | **[lite]** What are the main things (entities) the system stores or handles? How do they relate? | 7. Data | Sketch, not a schema |
| X2 | Where does the data come from, how much of it is there, and how long must it be kept? | 7. Data | Volume and retention drive storage choice |
| X3 | Is there personal, financial, health, or otherwise sensitive data? Any data residency rule? | 7. Data, 9. NFR | Triggers security flags |
| X4 | **[lite]** How do users sign in? Which roles exist and what can each do? | 8. Identity and roles | Default: no auth for internal CLI/library; email+password or SSO for apps |
| X5 | Which external systems does it talk to (APIs, SSO, payment, email, storage, legacy systems)? Who owns them and is there documentation or a sandbox? | 10. Integrations | Each unknown → open question |
| X6 | (infer) Does any entity move through statuses (draft → approved → …)? Who can trigger each transition? | 7. Data | Generates the state machine doc |
| X7 | Performance and scale: expected users / requests / data size; acceptable response time; peak periods? | 9. NFR | Default: sensible for type, recorded as assumption |
| X8 | Availability, backup, audit logging, accessibility, localization (languages, time zones, currencies)? | 9. NFR | |
| X9 | **[lite]** Where will it run — local, a server, a specific cloud, app stores, a package registry? Which environments (dev, staging, prod)? | 11. Environments | |
| X10 | **[lite]** Any preferred or mandated languages, frameworks, databases, hosting? What does the team already know well? | 6. Tech stack | If none, propose and record as assumption |
| X11 | Testing expectations: required coverage, end-to-end tests, manual QA, user acceptance testing? | 12. Quality | Default: rule 05-testing.md |

## Round 4 — Delivery (standard and full)

| # | Question | Fills | Notes / default |
|---|----------|-------|-----------------|
| D1 | Are there milestones or fixed dates (demo, pilot, launch)? | 13. Delivery | |
| D2 | Who is on the team and in which roles? Who answers product questions? Who approves changes? | 13. Delivery | Source-of-truth owner for open questions |
| D3 | How do you work — sprints (length?), continuous flow, fixed-scope contract? | 13. Delivery | Default: 2-week sprints in full tier |
| D4 | Who receives status reports, how often, and in what format? (full) | 13. Delivery | Drives `cpt-report` |
| D4b | Which language should client-facing reports be written in? (If it differs from the docs' language, say so — docs stay English, reports get a translation.) | 13. Delivery | Default: `en` (English) unless the user names another language; record the code (`en`, `vi`, …) |
| D5 | Anything a story must satisfy beyond the default Definition of Done (sign-off, demo, security scan)? | 12. Quality | |
| D6 | Where does the code live (Git host), and is there an existing CI/CD pipeline? | 11. Environments | |
