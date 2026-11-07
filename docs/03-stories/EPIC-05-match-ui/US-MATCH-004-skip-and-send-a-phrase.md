---
id: US-MATCH-004
title: Skip a turn and send a preset phrase or emote
epic: EPIC-05-match-ui
status: done
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
| AC2 | Not the player's turn | Skip is tapped | The button is disabled and no message is sent (`TC-MATCH-905`) |
| AC3 | The phrase picker | A phrase is chosen | A `chat` frame carrying the id is sent on `control`, and the phrase appears above the **sender's** chip for 3 s in each receiver's own locale (`TC-MATCH-947`, `TC-MATCH-948`, `TC-MATCH-949`) |
| AC4 | Six phrases tapped within one second | They are sent | The third and later are dropped locally; the server would answer `rate-limited` above 2/s (`TC-MATCH-905`) |
| AC5 | A phrase sent in `vi` | An `en` client receives it | The receiver sees the English string for the same id — the id is translated, never the text (`TC-MATCH-947`, `TC-MATCH-949`, `TC-CORE-963`) |
| AC6 | An emote | It is chosen | It is shown beside the sender's chip for 1.5 s and nothing is stored after it fades (`TC-MATCH-947`, `TC-MATCH-948`, `TC-MATCH-949`) |
| AC7 | Any phrase message | It is inspected | It contains no free-text field and no user-supplied string: the parser refuses a `text` key and any id outside the catalogue (`TC-MATCH-947`, `TC-MATCH-949`, `TC-CORE-963`) |

## 4. Contract

`chat` (peer → host → peers, `control`, reliable). Three fields, and the parser refuses a fourth:

| Field | Type | Notes |
|-------|------|-------|
| `t` | `"chat"` | — |
| `kind` | `"quick_phrase" \| "emote"` | decides which set the id belongs to |
| `id` | `PhraseId \| EmoteId` | `phrase-01`…`phrase-12`, `emote-01`…`emote-08`, checked against `packages/core/src/phrases.ts` |

There is no `slot` field: the sender is attributed from the authenticated member on the host side
(`slotsByPlayer`), never from the frame, so a peer cannot speak as somebody else. There is no `text` field, so
the frame cannot carry prose (`AC7`, `OQ-17`).

Renderer: the receiver looks the id up in `match.phrase.<id>` / `match.emote.<id>` in its own locale; an id
outside the catalogue renders nothing and is reported once per id (`apps/web/src/net/chat.ts`).

## 5. Rules and edge cases

- The picker is a fixed 12-item grid; no customisation and no profanity filter needed (no free text).
- Chat is dropped when the room is not `playing`; the lobby has no chat in v1.
- Messages are never persisted, including in `lastSnapshot` (`NFR-24`).
- Skip is available only on the active player's own turn; a skip after the clock ran out is rejected as
  `unsupported-message` because the turn already resolved.
- The phrase set is deliberately neutral (greetings, "nice shot", "oops", "good game").

## 6. Implementation notes

- `apps/web/src/components/PhrasePicker.tsx` (2 rows × 6 behind `chat-toggle`) — the § 6 paths that named a
  `game/hud/` copy and a `ChatToasts.tsx` were wrong; the banner is part of the roster cell
  (`apps/web/src/components/Roster.tsx`, `chat` prop), so a phrase cannot outlive its seat.
- `apps/web/src/net/chat.ts` — the frame, the two durations (`PHRASE_TOAST_MS = 3000`,
  `EMOTE_TOAST_MS = 1500`), `isChatFrame`, and `chatText`, which refuses an id the catalogue does not know.
- `packages/core/src/phrases.ts` — the catalogue and `isChatId`; `packages/core/src/protocol.ts` validates the
  frame against it, and `apps/worker/src/room-do.ts` relays `{from, kind, id}` only.
- Chat is **not** a match input: it changes no state, spends no `seq`, and is never applied through `applyInput`.
  The host fans a peer's phrase out to the other peers and never back to the sender (`TC-MATCH-949`).
- Phrases live in the locale files, not in the host's state — only ids cross the wire.

## 7. Out of scope

- Free-text chat, voice, emote animation beyond a sprite swap.
- Chat history or moderation tooling.

## 8. Test notes

`TC-MATCH-905` (skip and the phrase rate limit, `apps/web/tests/match-controls.test.tsx`), `TC-MATCH-947`
(`apps/web/tests/chat.test.tsx`), `TC-MATCH-948` (`apps/web/tests/roster.test.tsx`), `TC-MATCH-949`
(`apps/web/tests/chat-wiring.test.tsx`), `TC-CORE-963` (`packages/core/tests/phrases.test.ts`).

```text
Red: tests/web/chat-wiring.test.tsx
```

The red run named the defect that mattered: before `apps/web/src/net/chat.ts` existed, a phrase was applied
locally with `applyInput` and shown in the viewer's own corner — `sendControlAll` was never called, so the other
players saw nothing.

## 9. Open questions

- **OQ-17** (accepted assumption) — preset-only chat keeps the age-rating question out of scope; the client still owes a
  rating answer before any store submission, which v1 does not do.

<!-- delivery:2026-11-07 -->

## Delivery status — 2026-11-07

**done.** Verification: `pnpm test` (118 files / 947 cases), `pnpm e2e` (49 cases), `pnpm lint`, `pnpm typecheck`.

| AC | Evidence |
|----|----------|
| AC1 | `TC-MATCH-905` — skip sends one `skip` input; the engine resolves it (`TC-CORE-902`) |
| AC2 | `TC-MATCH-905` — the button is disabled outside the turn |
| AC3 | `TC-MATCH-947`, `TC-MATCH-948`, `TC-MATCH-949` — the id crosses, the banner lands on the speaker's chip |
| AC4 | `TC-MATCH-905` — the third tap inside one second is dropped; the worker answers `rate-limited` above 2/s (`TC-ROOM-065`) |
| AC5 | `TC-MATCH-947`, `TC-MATCH-949`, `TC-CORE-963` — same id, each receiver's own locale |
| AC6 | `TC-MATCH-947` (1.5 s), `TC-MATCH-948` (gone after it fades) |
| AC7 | `TC-MATCH-947`, `TC-MATCH-949`, `TC-CORE-963` — no `text` key reaches the parser |

What this pass changed, and what it found:

- **A phrase never left the client.** `onChat` applied a `chat` input locally and showed a bubble in the viewer's
  corner; `sendControlAll` was not called from anywhere in `apps/web/src`, so no other player ever saw a phrase,
  and the banner named whoever was looking rather than whoever spoke.
- **Free text crossed the wire.** The `chat` frame still accepted up to 120 characters of player-written `text`
  and the DO relayed it to every other socket — the opposite of `AC7` and `OQ-17`. The parser now refuses the
  key, and the frame carries `{kind, id}` validated against the catalogue.
- **The client could not type the frame the DO sent.** `ServerFrame` had no `chat` member at all.

Deviations, recorded rather than hidden:

- **AC6 says "emote sprite"; the build renders the emote's labelled text in an italic chip.** There is no emote
  art in `apps/web/public`, and inventing an asset pipeline here would have been a story of its own. The
  behaviour `AC6` is really about — appears beside the sender's chip for 1.5 s, nothing kept afterwards — is
  tested; the sprite is owed to the art pass.
- **The `chat` frame travels peer → host → peers over `control`, not through the DO.** The DO still relays
  `chat` for the socket path (rate-limited at 2/s), but the client sends over the mesh, so the 2/s refusal is not
  in the client's path today; the local budget (`CHAT_PER_WINDOW = 2`) is what a player meets. Wiring the socket
  path as well would double-send; it needs a decision, not a patch, and is fair for `US-OPS-004` to pick up if
  abuse ever needs the server-side limit.
- `TC-MATCH-905` was registered as `e2e` while its cases live in `apps/web/tests/match-controls.test.tsx`; the
  row now says `web`.
