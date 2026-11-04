---
id: US-MATCH-004
title: Skip a turn and send a preset phrase or emote
epic: EPIC-05-match-ui
status: ready
priority: P2
size: S
depends_on: [US-MATCH-003, US-NET-002]
open_questions: []
accepted_assumptions: [OQ-17]
refs: [02-reference/api/signaling.md, 02-reference/screens/match.md, 01-overview/glossary.md]
---

# US-MATCH-004 — Skip a turn and send a preset phrase or emote

## 1. Story

**As a** player
**I want** to pass my turn and to say something short without typing
**so that** I can play faster and still react to a good shot.

## 2. Context

Chat is preset phrases and emotes only (`OQ-17`): no free text, so no moderation surface, no unicode abuse and no
keyboard covering the canvas. Skip resolves the turn immediately as a miss.

| Topic | Reference |
|-------|-----------|
| `input kind: skip`, `chat` messages, rate limits | [api/signaling.md](../../02-reference/api/signaling.md) |
| Controls and overlays | [screens/match.md](../../02-reference/screens/match.md) |
| `quickPhraseId`, `emoteId` | [glossary.md](../../01-overview/glossary.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | The player's turn | Skip is tapped | `input {kind:"skip"}` is sent, the turn resolves with no projectile, and the next player becomes active (`TC-MATCH-905`) |
| AC2 | Not the player's turn | Skip is tapped | The button is disabled and no message is sent |
| AC3 | The phrase picker | A phrase is chosen | A `chat` message with `quickPhraseId` is sent and rendered above the sender's chip for 3 s in the receiver's locale |
| AC4 | Six phrases tapped within one second | They are sent | The third and later are dropped locally; the server would answer `rate-limited` above 2/s (`TC-MATCH-905`) |
| AC5 | A phrase sent in `vi` | An `en` client receives it | The receiver sees the English string for the same `quickPhraseId` — the id is translated, never the text |
| AC6 | An emote | It is chosen | The emote sprite is shown beside the sender's chip for 1.5 s and nothing is stored after it fades |
| AC7 | Any phrase message | It is inspected | It contains no free-text field and no user-supplied string |

## 4. Contract

`chat` (peer → host → peers, `control`, reliable):

| Field | Type | Notes |
|-------|------|-------|
| `t` | `"chat"` | — |
| `kind` | `"phrase" \| "emote"` | — |
| `id` | string | `phrase-01`…`phrase-12`, `emote-01`…`emote-08` |
| `slot` | integer | Sender, filled by the host from the authenticated member |

Renderer: phrase text from `match.phrase.<id>` in the receiver's locale; an unknown id renders nothing and logs once.

## 5. Rules and edge cases

- The picker is a fixed 12-item grid; no customisation and no profanity filter needed (no free text).
- Chat is dropped when the room is not `playing`; the lobby has no chat in v1.
- Messages are never persisted, including in `lastSnapshot` (`NFR-24`).
- Skip is available only on the active player's own turn; a skip after the clock ran out is rejected as
  `unsupported-message` because the turn already resolved.
- The phrase set is deliberately neutral (greetings, "nice shot", "oops", "good game").

## 6. Implementation notes

- `apps/web/src/game/hud/PhrasePicker.tsx` (2 rows × 6) and `ChatToasts.tsx`.
- Phrases live in the locale files, not in the host's state — only ids cross the wire.

## 7. Out of scope

- Free-text chat, voice, emote animation beyond a sprite swap.
- Chat history or moderation tooling.

## 8. Test notes

`TC-MATCH-905` (skip and the phrase rate limit), plus `tests/web/phrases.test.ts` for id→string translation in both
locales.

## 9. Open questions

- **OQ-17** (accepted assumption) — preset-only chat keeps the age-rating question out of scope; the client still owes a
  rating answer before any store submission, which v1 does not do.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**in-progress.** skip and the preset phrases are implemented in the scene and the core (`passTurn`); covered by `TC-CORE-902` at the engine level.
