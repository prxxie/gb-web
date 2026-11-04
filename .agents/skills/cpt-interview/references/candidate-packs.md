# Candidate packs

Read when the interview reaches the tech stack (Round 3), and again when the brief is summarized in Round 5.

A candidate pack is a **hint for the next step**, not a decision: the stack ADR is written by `cpt-docs`, and `cpt-pack`
installs only what that ADR justifies. The interview's job is to make sure the user hears the options while it is still
cheap to change their mind — a project that discovers at the first UI story that it cannot see its own screen has already
paid for the omission.

## How to propose

1. Resolve the catalog: `$CPT_SCAFFOLD_PATH`, else `scaffold_path` in `.agents/cpt.json`, else skip the step and say why.
   Read `<scaffold>/packs/README.md` (the table) — never a hard-coded list, because a pack that is renamed must stop
   being proposed.
2. Keep **at most three**, and only ones the brief already justifies. A pack with no signal in the brief is a suggestion
   to add scope, which is not the interview's call.
3. One line each, in the shape `cpt-pack` will later use:

```
cpt-stack-fastapi   → backend        brief § 6 says Python + a REST API   status: unverified
cpt-stack-browser-verify → review    brief § 12 says screens are reviewed in a browser   status: unverified
```

4. Say what each one buys, in the catalog's own words, and what is lost without it. Quote the catalog description rather
   than writing a new one: two descriptions of one pack drift apart.
5. Name the layer with no pack, when there is one — "no pack covers your queue; `conventions.md` will carry it".

## What signals a pack

| Signal in the brief | Candidate | Why it is not optional in that case |
|---------------------|-----------|-------------------------------------|
| Screens, HTML output, client-side routes (§ 2, § 4, § 12) | `browser-verify` | A review cannot prove a screen works from unit tests; without the pack the review does a manual pass and nothing is kept |
| React front end | `react-vite` | Component, routing, state and test conventions the team would otherwise invent |
| Python REST API | `fastapi`, `api` | Framework conventions plus the API contract layer |
| TypeScript/Node REST API | `nestjs`, `api` | Same, for the other ecosystem |
| A relational store with real entities (§ 7) | `data` | Schema, migration and query conventions — without it every story invents its own |
| A model in the product, or an agent | `langgraph` | Graph state, tools and a run you can inspect |
| Evaluation of model output (§ 12) | `llm-eval` | A judged set, a threshold and a recorded score |
| Containers, or a deployment the brief already fixes (§ 11) | `docker` | One image contract, one local dev story |
| GitLab as the CI host (§ 11) | `gitlab-ci` | Pipeline conventions that match the host |
| `cli-tool`, `library` | usually none | Say so: no pack covers it, `conventions.md` decides — a proposal here would be noise |

Two packs can point at the same layer (`fastapi` and `nestjs` for "an API"). Pick by the language the brief names; if it
names none, the interview asks (that is a Round 3 question), it does not guess.

## Where it goes

Brief § 6, one line under the stack table:

```
**Candidate packs**: fastapi (Python REST API), data (claims + policies), browser-verify (agent console), declared [assumption: OQ-04]
```

Drop the section for a project with no pack-shaped layer — an empty table is better than a table of "no". `cpt-pack`
treats these as its opening proposal and still requires the ADR before installing anything.
