---
name: cpt-ingest
description: Read existing specs, requirement documents, designs, or notes placed in docs/00-source/ and extract facts, conflicts, and gaps into a draft brief and an ingest report, so the interview only asks about what is missing. Use when the user provides a spec, PRD, design document, or "here are the requirements", before cpt-interview.
---

# cpt-ingest

Extract what existing material already says, so nobody is asked a question the spec answers.

## Inputs

- Every file in `docs/00-source/` except `brief.md`, `ingest-report.md`, and `change-requests/`. If the user
  attached or pasted material elsewhere, ask them to place it in `docs/00-source/` (or save pasted text there as
  `<topic>.md`) — sources must stay in the repo for traceability.
- Supported: Markdown, text, HTML, PDF, Word, spreadsheets, images of designs — whatever your tools can read. If a
  file cannot be read, list it in the report as unread; do not guess its content.

## Outputs

- `docs/00-source/ingest-report.md` (structure below).
- `docs/00-source/brief.md` from `.agents/templates/brief.md`, `status: draft`, filled only with facts found in the
  sources, each tagged `[spec: <file>#<section or page>]`. If a brief already exists, add to it; never overwrite
  `[user]` facts — record a conflict instead.

**Never modify the source files.**

## Procedure

**Delegate the reading where the tool allows it** — a fast, read-only explorer subagent can do steps 1–2 and return
facts per source with their `<file>#<section or page>` locations; conflicts, gaps, and the report (steps 3–6) stay
with you. Without one, do steps 1–2 yourself.

1. List the source files with type and size. For large sets, read the most authoritative first (latest version by
   date or version number; a document that says it supersedes another wins).
2. For each file, extract facts per brief section (1–14). Note version/date of the source.
3. Detect **conflicts**: two sources (or two versions) disagree. Record both with locations; do not choose silently.
   Newer version of the same document wins by default — record it as an assumption.
4. Detect **gaps**: walk `.agents/skills/cpt-interview/references/questions/core.md` and the module for each likely
   project type; every question the sources do not answer is a gap.
5. Detect **vague requirements**: "fast", "secure", "user-friendly", "etc.", TBD markers, undefined terms. Each is a
   gap with a suggested concrete version.
6. Write the report and the draft brief. Hand off: "Run `cpt-interview` — it will ask only about the N gaps and M
   conflicts."

## ingest-report.md structure

```markdown
# Ingest report — YYYY-MM-DD

## Sources
| File | Type | Version / date | Read | Notes |

## Summary
<5 lines: what the material describes, how complete it is, likely project types and tier.>

## Conflicts
| # | Topic | Source A says | Source B says | Default taken |

## Gaps
| # | Brief section | Question (from question bank id) | Why it matters |

## Vague requirements
| # | Quote and location | Suggested concrete version |

## Glossary candidates
| Term (as in source) | Probable meaning | Source |
```

Source documents in another language: keep original terms in the glossary candidates with an English rendering; the
brief is written in English.
