# Weekly email template

The covering email for the weekly workbook. It is written **from the same filled JSON** after the workbook is built, so
the two cannot disagree. Save it as `docs/06-reports/email-draft-YYYYMMDD.md` (the period's last day). Never send it:
a human chooses the recipient, fills the placeholders and deletes the sender notes.

## Where each part comes from

| Email part | JSON source |
|------------|-------------|
| Subject: period, decisions count, nearest date | `meta.period`, `risks[]` that are not `Resolved` |
| Progress this week | `progress[].current`, `tasks[]` with status `Done` |
| Stories done | the *tasks complete* value the generator printed |
| Quality table | `metrics[]` — the rows a client cares about, same numbers |
| Team this week | `people[]` — one row per member |
| Next week | `progress[].next` |
| Schedule change | `meta.overallStatus`, `capacityNote` — only if a date moved |
| Decisions needed | `risks[]` with severity `Critical` or `High`, ordered by `due` |
| Thank-you line | `risks[]` with severity `Resolved` |

## Rules

1. **One screen.** Progress, quality, team, next week, any schedule change, and each decision as **one line**: the ref,
   what is needed, the date, and what happens if nothing arrives. Detail stays in the workbook's *Risks & Open
   Questions* sheet; the email points at it.
2. **Every number is the workbook's.** Copy from the JSON, never from last week's email — an old test count or
   coverage figure travels with a copied email and the client cannot tell.
3. **A passed date is stated as passed**, with its default outcome. Softening it teaches the reader that dates are
   decorative.
4. **Do not ask again for something the client deferred in writing.** A deferral is a decision; mention it once in the
   thank-you line if at all.
5. **End with what answers became.** A resolved question that turned into a shipped story is the reason the next
   answer arrives.
6. Client audience: no file paths, no code terms beyond story and OQ ids. Write in the report's language (SKILL.md § 4).

## Template

```markdown
# Weekly report email — YYYY.MM.DD (<week label>)

Placeholders to fill: `[Client contact]`, `[Your name]`.
Attachment: `<project>_Weekly Report_YYYYMMDD~YYYYMMDD.xlsx`

---

**Subject:** <Project> Weekly Report <d Mon> – <d Mon> — <n> decision(s) needed by <weekday d Mon>

---

Dear [Client contact],

Please find attached the weekly report for <period>, <week label>.

**Progress this week**

- <one bullet per epic or workstream that moved, naming the story ids and what a user can now do>
- **<done> of <total> user stories are done.**

**Quality**

| | |
|---|---|
| <metric> | <result> (target <target>) |

<One sentence on anything below target and what is being done about it.>

**Team this week**

| Name | Delivered | Next week |
|------|-----------|-----------|
| <name> | <story ids and one-line outcomes> | <story ids> |

**Next week (<period>)**

<Two or three sentences from progress[].next.>

**Schedule change** <!-- only when a date moved; otherwise delete this section -->

<What moved, from when to when, and the measured reason.>

**Decisions needed — details in the "Risks & Open Questions" sheet**

1. **<OQ-nn>, <what is needed> — by <date>** (or **— overdue**, was <date>). If we hear nothing: <default outcome>.

Thank you for <the answers received this week> — <what each became>.

Best regards,
[Your name]

---

## Notes for the sender (delete before sending)

- <anything the sender must check or decide before sending, e.g. who to copy, a line not to soften>
```
