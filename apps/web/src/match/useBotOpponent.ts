/**
 * The bot opponent (`US-MATCH-001`): think for a moment, then shoot.
 *
 * A guest seat also has `accountId: null`, so the opponent is identified by its slot, never by identity. The rules of
 * the turn live in `@gbw/core`'s `botTurn`; this hook only waits and applies.
 */
import { useEffect } from "react";
import { applyInput, botTurn, createRng, type MatchState } from "@gbw/core";
import { shotWaitMs } from "../game/flight";
import type { PlannedMatch } from "../lib/plan";
import type { CommitState, MatchWiring } from "./wiring";

export interface BotOpponentOptions {
  readonly plan: PlannedMatch | null;
  readonly state: MatchState | null;
  readonly commit: CommitState;
  readonly wiring: MatchWiring;
  /** When the previous seat's shell finishes on screen (`US-MATCH-012`); the bot never fires into an occupied sky. */
  readonly lockedUntil: number;
}

/** How long the bot thinks before it shoots. */
export const BOT_THINKING_MS = 1_400;

export function useBotOpponent(options: BotOpponentOptions): void {
  const { plan, state, commit, wiring, lockedUntil } = options;
  const { stateRef, seq } = wiring;

  useEffect(() => {
    if (!plan || plan.kind !== "bot" || !state || state.status !== "playing") return;
    const bot = state.players.find((player) => player.slot !== plan.localSlot);
    if (!bot || bot.eliminated || state.turn.activeSlot !== bot.slot) return;
    // `US-MATCH-012`: the delay is the thinking time, or the rest of the shell still in the air — whichever is longer.
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (!current) return;
      const rng = createRng(current.seed + current.turn.number * 7919);
      const input = botTurn(current, rng);
      if (!input) return;
      const result = applyInput(current, { ...input, seq: seq.current++ }, Date.now());
      commit(result.state, result.events);
    }, shotWaitMs(BOT_THINKING_MS, lockedUntil, Date.now()));
    return () => window.clearTimeout(timer);
  }, [state, plan, commit, stateRef, seq, lockedUntil]);
}
