/**
 * Skip and preset chat (`US-MATCH-004` AC1–AC4, AC7).
 *
 * There is no free-text field (AC7): a fixed 12-phrase grid and an emote row, so only ids leave the
 * component. Skip is disabled outside the player's own turn (AC2). Six taps inside a second lose the
 * third onward locally (AC4); the host still enforces its own limit.
 */
import { useRef } from "react";
import type { JSX } from "react";

export type ChatKind = "quick_phrase" | "emote";

export interface PhrasePickerLabels {
  readonly skip: string;
  readonly phrases: string;
  readonly emotes: string;
}

export interface PhrasePickerProps {
  readonly skipEnabled: boolean;
  readonly phraseIds: readonly string[];
  readonly emoteIds: readonly string[];
  readonly labels: PhrasePickerLabels;
  readonly phraseText: (id: string) => string;
  readonly emoteText: (id: string) => string;
  readonly onSkip: () => void;
  readonly onChat: (kind: ChatKind, id: string) => void;
}

/** Local copy of the client-side chat budget: two sends per rolling second (`US-MATCH-004` AC4). */
const CHAT_WINDOW_MS = 1000;
const CHAT_PER_WINDOW = 2;

export function PhrasePicker({
  skipEnabled,
  phraseIds,
  emoteIds,
  labels,
  phraseText,
  emoteText,
  onSkip,
  onChat,
}: PhrasePickerProps): JSX.Element {
  const sent = useRef<number[]>([]);

  const chat = (kind: ChatKind, id: string): void => {
    const now = Date.now();
    sent.current = sent.current.filter((at) => now - at < CHAT_WINDOW_MS);
    if (sent.current.length >= CHAT_PER_WINDOW) return;
    sent.current.push(now);
    onChat(kind, id);
  };

  return (
    <div className="match__actions">
      <button
        type="button"
        className="match__skip"
        data-testid="match-skip"
        disabled={!skipEnabled}
        onClick={onSkip}
      >
        {labels.skip}
      </button>
      <div className="match__phrases" role="group" aria-label={labels.phrases}>
        {phraseIds.map((id) => (
          <button key={id} type="button" data-testid={`phrase-${id}`} onClick={() => chat("quick_phrase", id)}>
            {phraseText(id)}
          </button>
        ))}
      </div>
      <div className="match__phrases" role="group" aria-label={labels.emotes}>
        {emoteIds.map((id) => (
          <button key={id} type="button" data-testid={`emote-${id}`} onClick={() => chat("emote", id)}>
            {emoteText(id)}
          </button>
        ))}
      </div>
    </div>
  );
}
