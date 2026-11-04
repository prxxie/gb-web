# Comparing options

Use when a decision has **three or more** plausible answers: epic splits, story slicing, architecture, library or
storage choice, ADR alternatives. With two options, say which is better and why — a full comparison is overhead.

## Why not to score them one by one

Reading options in order and giving each a mark hides two biases that decide the outcome as much as the options do: the
first option read gets the benefit of the doubt, and the marks drift as you go, because the second option is measured
against the first instead of against the bar. Comparing **pairs** removes both: each option is seen once as the
candidate and once as the reference.

## Procedure

1. **Name the criteria first**, before looking at the options — two or three, narrow, each decidable from the option's
   own text. For a plan: *slice integrity*, *gate soundness*, *criterion decidability* (below). For a technical choice:
   the brief's constraints (deadline, team skills, mandated stack), *operability*, *cost to reverse*. Write down what
   you are ignoring (formatting, naming, order inside a wave) so it cannot creep in.
2. **Compare in a ring**: with three options A-B, B-C, C-A; with more, each against the next and the next but one.
   Each pair is one criterion at a time — "does A or B do this better, or neither?" — with a one-line reason. No points.
3. **Report a ranking with its pivot**: the winner, the option it beat in the closest pair, and the criterion that
   decided that pair. A tie means the criteria cannot tell the options apart: say so and decide on the constraint that
   matters most, not on a coin flip.
4. **Record what a later reader will need**: a costly-to-reverse choice goes to `cpt-decide` as an ADR with the rejected
   alternatives and why each lost. A split goes in the epic README.
5. **"Keep the current structure" is a valid outcome.** If nothing beats the incumbent, say that instead of inventing a
   change that has to be paid for.

## The three criteria for a plan

| Criterion | High | Low |
|-----------|------|-----|
| **Slice integrity** | Each story delivers observable behavior end to end; something can be demonstrated after it | A layer, a chore, or "refactor X" with nothing to observe |
| **Gate soundness** | Every dependency is satisfied by an earlier wave, no cycles, and each wave's gates can be answered before it starts | A story depends on a later wave, or a gate can only be answered by building it |
| **Criterion decidability** | Each acceptance criterion has a given/when/then or an observable result, and a stranger with only the story and the repository can say pass or fail | A criterion a reviewer has to interpret, or one that restates the story title |

Ignore formatting, ordering inside a wave, and wording: they are not criteria, and grading them hides the criterion that
actually fails.
