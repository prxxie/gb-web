---
name: cpt-decide
description: Manage open questions and architecture decision records in docs/04-decisions — raise a question, record an answer and propagate it to blocked stories and docs, list what is blocking, or write an ADR. Use when something is unknown and cannot be guessed, when the user or client answers a question, or when a significant technical decision is made.
---

# cpt-decide

Format of questions and ADRs: `.agents/rules/02-docs-navigation.md` § 3 and § 5. Templates:
`.agents/templates/open-questions.md`, `.agents/templates/adr.md`.

## Raise a question

Only for genuine unknowns that nobody present can answer. If the user says "you decide", that is a decision: apply
the recommended default, tag it `[user: delegated]`, and write an ADR if it is a technical choice — no question.

1. Check `docs/04-decisions/open-questions.md` for an existing question on the same topic — reuse it if found.
2. Add a section with the next free `OQ-nn`. Write the question so the person answering needs no other context:
   include options and a recommended option in **Context**.
3. Fill all five fields (Status, Raised, Blocks, Assumption, Answer `—`).
4. Set **Blocks** to the affected story ids. For each story: if the answer could change its acceptance criteria and
   the user does not accept building on the default, add the OQ to `open_questions` and set `status: blocked`;
   if the user accepts the default, add the OQ to `accepted_assumptions` instead.
5. If work continues on a default, fill **Assumption** and tag the affected doc text `[assumption: OQ-nn]`
   (rule 02 § 7).
6. If a delivery plan exists, add the question as a **gate** of the earliest wave containing a blocked story.
7. Run `node .agents/scripts/verify-docs.mjs --fix` — it regenerates the summary at the top of the file.

## Record an answer

1. Set **Status** `answered` and **Answer** with date, who answered, and the decision verbatim or closely paraphrased.
2. **Propagate** — this is the important part:
   - Find every carrier with `grep -rn "assumption: OQ-nn" docs/` and replace each tagged statement with the decided
     fact (the verifier warns about any tag left behind).
   - For each story listing the question in `open_questions` **or** `accepted_assumptions`: update acceptance
     criteria and contract to match the answer, and remove the OQ from the list. A blocked story with no open
     questions left becomes `ready` (or `draft` if it still lacks criteria). If an accepted assumption turned out
     wrong for a story already `done`, create a fix story (rule 03 § 3).
   - Delivery plan: remove the question from its wave's gates; if the wave's last gate is gone, say so in the
     report.
   - If the answer changes scope, run `cpt-change` instead of editing scope here.
   - If the answer is a significant technical decision, also write an ADR.
3. Run `node .agents/scripts/verify-docs.mjs --fix` — this regenerates every count and index table (open
   questions, backlog index, epic tables, docs/README stats). Fix every error.
4. Report: stories unblocked, docs changed, any new questions the answer raised.

Answers for several questions at once (e.g. a client reply email): process each, then report once.

## Write an ADR

Use for decisions that are costly to reverse: architecture style, stack, data storage, auth approach, integration
pattern, significant trade-offs. Not for routine choices.

1. Next free `ADR-nnnn`; file `docs/04-decisions/adr/ADR-nnnn-<slug>.md` from the template.
2. With three or more alternatives, compare them pairwise per
   [../cpt-plan/references/comparing-options.md](../cpt-plan/references/comparing-options.md) and record each rejected
   one with the reason it lost — an ADR that lists alternatives without saying why they lost cannot be revisited.
   Quality bar: [../cpt-docs/references/doc-specs.md](../cpt-docs/references/doc-specs.md) § Quality criteria, ADR row.
3. Status `proposed` until the user (or decision owner) accepts; `accepted` when they have.
4. **Diagram** — a decision that has a shape (style, storage, auth, integration, deployment) gets one, from
   [cpt-visual](../cpt-visual/SKILL.md): the chosen option, committed under the diagram home, linked from `## Diagram`;
   a rejected option only where its shape differs in a way the options table cannot show. No archify in the project →
   the Mermaid fallback, same section, with the one-line reason. Delete the section for a decision with no shape.
5. Superseding: new ADR lists the old id in `supersedes`; set the old one's status to `superseded`.

## List

"What is blocking?" → table of open questions with Blocks, sorted by number of blocked stories, plus which delivery
wave each gates if a delivery plan exists.
