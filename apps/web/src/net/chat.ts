/**
 * Preset chat on the wire (`US-MATCH-004` AC3, AC5, AC6, AC7).
 *
 * Only an id crosses: the catalogue is `@gbw/core`'s `phrases.ts`, and the words are the receiver's own locale. The
 * `text` field an earlier version of the protocol allowed is gone, so nothing a player types can reach another
 * screen (`OQ-17`).
 */
import { isChatId, isChatKind, type ChatId, type ChatKind } from "@gbw/core";
import type { Translator } from "../i18n";

/** A phrase stays up long enough to read; an emote is a reaction and gets half as long (AC3, AC6). */
export const PHRASE_TOAST_MS = 3000;
export const EMOTE_TOAST_MS = 1500;

export interface ChatFrame {
  readonly t: "chat";
  readonly kind: ChatKind;
  readonly id: ChatId;
}

export function chatFrame(kind: ChatKind, id: ChatId): ChatFrame {
  return { t: "chat", kind, id };
}

export function toastMs(kind: ChatKind): number {
  return kind === "emote" ? EMOTE_TOAST_MS : PHRASE_TOAST_MS;
}

export function isChatFrame(value: unknown): value is ChatFrame {
  if (typeof value !== "object" || value === null) return false;
  const frame = value as Record<string, unknown>;
  if (Object.keys(frame).length !== 3) return false;
  return frame["t"] === "chat" && isChatKind(frame["kind"]) && isChatId(frame["kind"], frame["id"]);
}

/** Ids already reported, so a hostile or buggy peer cannot flood the console with one warning per frame. */
const reported = new Set<string>();

/**
 * The receiver's string for an id, or `null` when the catalogue does not know it — an unknown id renders nothing
 * (`US-MATCH-004` § 4) and is reported once.
 */
export function chatText(t: Translator, kind: ChatKind, id: string): string | null {
  if (!isChatId(kind, id)) {
    if (!reported.has(id)) {
      reported.add(id);
      console.warn(`unknown chat id "${id}" for kind "${kind}"`);
    }
    return null;
  }
  return t(kind === "emote" ? `match.emote.${id}` : `match.phrase.${id}`);
}
