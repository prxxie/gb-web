/**
 * Preset chat (`US-MATCH-004`).
 *
 * A phrase carries an id, never a string the player typed (AC7), so every receiver renders it in its own locale (AC5).
 * It is not a match input: it changes no state, so it never spends a `seq`.
 */
import { useCallback, useEffect, useState } from "react";
import type { ChatId, ChatKind } from "@gbw/core";
import { chatFrame, toastMs } from "../net/chat";
import type { PlannedMatch } from "../lib/plan";
import type { MatchWiring } from "./wiring";

/** The phrase on screen, with the seat that said it: the banner belongs above that seat's chip (`AC3`). */
export interface MatchChatMessage {
  readonly slot: number;
  readonly kind: ChatKind;
  readonly id: string;
}

export interface MatchChatOptions {
  readonly plan: PlannedMatch | null;
  readonly wiring: MatchWiring;
}

export interface MatchChat {
  readonly chat: MatchChatMessage | null;
  /** Incoming frames and the local sender both land here. */
  readonly setChat: (chat: MatchChatMessage | null) => void;
  /** The phrase grid: its toggle is on the turn list, the grid itself opens above the bar. */
  readonly open: boolean;
  readonly toggleOpen: () => void;
  readonly send: (kind: ChatKind, id: ChatId) => void;
}

export function useMatchChat(options: MatchChatOptions): MatchChat {
  const { plan, wiring } = options;
  const { mesh } = wiring;
  const [chat, setChat] = useState<MatchChatMessage | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!chat) return;
    const timer = window.setTimeout(() => setChat(null), toastMs(chat.kind));
    return () => window.clearTimeout(timer);
  }, [chat]);

  // The chat sender the phrase grid calls (`US-MATCH-004`): only the id crosses the wire, never text.
  const send = useCallback(
    (kind: ChatKind, id: ChatId) => {
      if (!plan) return;
      setChat({ slot: plan.localSlot, kind, id });
      mesh.current?.sendControlAll(chatFrame(kind, id));
    },
    [plan, mesh],
  );

  const toggleOpen = useCallback(() => setOpen((was) => !was), []);

  return { chat, setChat, open, toggleOpen, send };
}
