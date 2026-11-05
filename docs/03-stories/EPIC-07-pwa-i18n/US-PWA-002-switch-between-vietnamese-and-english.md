---
id: US-PWA-002
title: Switch between Vietnamese and English with no missing string
epic: EPIC-07-pwa-i18n
status: ready
priority: P2
size: M
depends_on: [US-FND-003]
open_questions: []
accepted_assumptions: []
refs: [01-overview/nonfunctional-requirements.md, 01-overview/conventions.md, 02-reference/screens/README.md]
---

# US-PWA-002 — Switch between Vietnamese and English with no missing string

## 1. Story

**As an** English-speaking player
**I want** every screen, error and result in English
**so that** I can play without translating Vietnamese in my head.

## 2. Context

Both locales ship in one bundle as JSON tables; the switch lives in the top bar and persists in `localStorage`. This
is the first feature the client would cut under schedule pressure, so the implementation must be a data change, not a
code change, if English is dropped.

| Topic | Reference |
|-------|-----------|
| NFR-18 i18n | [nonfunctional-requirements.md](../../01-overview/nonfunctional-requirements.md) |
| Key naming `screen.element.state` | [conventions.md](../../01-overview/conventions.md) |
| Screen copy keys | [screens/README.md](../../02-reference/screens/README.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | An `en` player | They walk all seven routes and one match | No Vietnamese text appears outside user-generated names (`TC-PWA-130`) |
| AC2 | The same walk in `vi` | It is repeated | No English text appears except product nouns documented in the glossary |
| AC3 | The two locale files | They are compared | The key sets are identical; a missing key fails CI |
| AC4 | The toggle | It is used mid-match | Only DOM HUD text changes; the canvas is untouched and the match is not interrupted |
| AC5 | A 30 % longer English string | It is rendered | No button, chip or HUD field is clipped; layout uses flexible widths  (`TC-PWA-162`) |
| AC6 | A server error (`problem+json`) | It is displayed | The screen shows the translated message for `type` and falls back to `title` for an unknown type |
| AC7 | The phrase picker | A phrase is sent | The receiver sees their own locale's string for the same `quickPhraseId` |

## 4. Contract

`apps/web/src/i18n/{vi,en}.json` — flat keys: `common.*`, `main.*`, `signIn.*`, `profile.*`, `leaderboard.*`,
`lobby.*`, `match.*`, `results.*`, `errors.*`.

Error mapping: `errors.<type-suffix>` where the suffix is the part after the last `/` of the problem `type`
(`errors.validation`, `errors.room-full`, …). Unknown → `errors.generic` with the `title` as a subtitle.

`t(key, vars)` interpolates `{count}` style placeholders; plural counts use `Intl.PluralRules`.

## 5. Rules and edge cases

- No string concatenation to build a sentence; whole sentences are keys, word order differs between the languages.
- Dates and numbers use `Intl.DateTimeFormat`/`Intl.NumberFormat` with the active locale, not a hand-rolled format.
- The locale is independent of the UI language of the OS after the first explicit choice.
- A guest's chosen locale survives the session; it is not stored on an account in v1.
- Dropping English must be a deletion of `en.json` plus a manifest change, not an if-statement.

## 6. Implementation notes

- `apps/web/tests/i18n.test.ts` compares key sets and fails on an unused key in both files.
- The Phaser scene draws no text, so no canvas i18n is needed — a deliberate simplification recorded in `conventions.md`.

## 7. Out of scope

- Localised server responses (the API returns `type` ids only).
- More languages, RTL, machine translation.

## 8. Test notes

`TC-PWA-130` (route walk in both locales, e2e). Plus the key-parity unit test.

## 9. Open questions

None.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**in-progress.** both tables, the provider and the toggle are implemented; table parity is unit-tested, the in-app switch needs a browser.
