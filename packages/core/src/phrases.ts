/**
 * The preset chat catalogue (`US-MATCH-004`, `OQ-17`).
 *
 * Chat is preset-only: no free text crosses the wire, so there is no moderation surface and no keyboard over the
 * canvas. The ids live here rather than in the web app because the protocol validates them: a frame that names an id
 * outside this list is refused at the socket, not rendered as an empty banner on every receiver.
 *
 * The copy itself lives in the locale files (`match.phrase.<id>`, `match.emote.<id>`), so the two strings a player
 * sees are chosen by their own client, never by the sender's.
 */

export const PHRASE_IDS = [
  "phrase-01",
  "phrase-02",
  "phrase-03",
  "phrase-04",
  "phrase-05",
  "phrase-06",
  "phrase-07",
  "phrase-08",
  "phrase-09",
  "phrase-10",
  "phrase-11",
  "phrase-12",
] as const;

export const EMOTE_IDS = [
  "emote-01",
  "emote-02",
  "emote-03",
  "emote-04",
  "emote-05",
  "emote-06",
  "emote-07",
  "emote-08",
] as const;

export type PhraseId = (typeof PHRASE_IDS)[number];
export type EmoteId = (typeof EMOTE_IDS)[number];
export type ChatKind = "quick_phrase" | "emote";
export type ChatId = PhraseId | EmoteId;

export function isChatKind(value: unknown): value is ChatKind {
  return value === "quick_phrase" || value === "emote";
}

/** The kind decides which set an id belongs to: `phrase-01` is never a valid emote. */
export function isChatId(kind: ChatKind, id: unknown): id is ChatId {
  if (typeof id !== "string") return false;
  return kind === "quick_phrase" ? (PHRASE_IDS as readonly string[]).includes(id) : (EMOTE_IDS as readonly string[]).includes(id);
}
