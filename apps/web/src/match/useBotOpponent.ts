/**
 * The bot opponent (`US-MATCH-001`): think for a moment, then shoot — from what it can see (`US-BAL-006`).
 *
 * A guest seat also has `accountId: null`, so the opponent is identified by its slot, never by identity. The rules of
 * the turn live in `@gbw/core`; this hook only waits, builds the seat's `Senses` from **its own** window, and applies
 * the inputs.
 */
import { type RefObject, useEffect, useRef, useState } from "react";
import {
  applyInput,
  botTurn,
  createBotMemory,
  createRng,
  DEFAULT_BOT,
  DEFAULT_DIFFICULTY,
  sensesFor,
  windowForSeat,
  type BotMemory,
  type MatchEvent,
  type MatchState,
} from "@gbw/core";
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
  /** The seat's memory, when the caller wants to hold it itself; otherwise the hook owns one per match. */
  readonly memory?: RefObject<BotMemory>;
}

/** How long the bot thinks before it shoots. */
export const BOT_THINKING_MS = 1_400;

/** How soon it looks again when it is waiting for its own screen to stop measuring, and how often at most. */
const RETRY_MS = 250;
const RETRY_LIMIT = 40;

export function useBotOpponent(options: BotOpponentOptions): void {
  const { plan, state, commit, wiring, lockedUntil, memory: given } = options;
  const { stateRef, seq } = wiring;
  /** The seat's memory across turns: what it saw, and where its own last shell came down. */
  const owned = useRef<BotMemory>(createBotMemory());
  const memory = given ?? owned;
  const rememberedMatch = useRef<string | null>(null);
  /** Bumped when the bot had nothing to do, so the effect runs again instead of leaving the seat idle. */
  const [retry, setRetry] = useState(0);
  /** The turn the retry counter belongs to: a new turn starts at the thinking delay again, not at the retry one. */
  const retriedTurn = useRef(-1);

  useEffect(() => {
    if (!plan || plan.kind !== "bot" || !state || state.status !== "playing") return;
    const bot = state.players.find((player) => player.slot !== plan.localSlot);
    if (!bot || bot.eliminated || state.turn.activeSlot !== bot.slot) return;
    if (retriedTurn.current !== state.turn.number) {
      retriedTurn.current = state.turn.number;
      if (retry !== 0) {
        setRetry(0);
        return;
      }
    }
    // `US-MATCH-012`: the delay is the thinking time, or the rest of the shell still in the air — whichever is longer.
    let retryTimer: number | undefined;
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (!current || current.status !== "playing") return;
      const seat = current.players.find((player) => player.slot === bot.slot);
      if (!seat || seat.eliminated || current.turn.activeSlot !== seat.slot) return;
      if (rememberedMatch.current !== current.matchId) {
        memory.current = createBotMemory();
        rememberedMatch.current = current.matchId;
      }
      const rng = createRng(current.seed + current.turn.number * 7919);
      // What the memory held before this decision, so a rejected shot does not become a remembered landing.
      const before = memory.current.impact;
      const inputs = botTurn(
        sensesFor(current, seat.slot, windowForSeat(current, seat.slot), memory.current),
        rng,
        DEFAULT_DIFFICULTY,
        { ...DEFAULT_BOT, memory: memory.current },
      );
      if (inputs.length === 0) {
        // AC4: nothing is aimed at while the window measures. Unreachable today — `windowForSeat` is always one screen
        // wide, so the seat's own window never measures (`TC-BAL-143` pins that) — but a producer that can measure must
        // not leave the seat idle for its whole turn, so look again shortly instead of thinking the full delay again.
        if (retry < RETRY_LIMIT) retryTimer = window.setTimeout(() => setRetry((count) => count + 1), RETRY_MS);
        return;
      }
      let next = current;
      const events: MatchEvent[] = [];
      for (const input of inputs) {
        const result = applyInput(next, { ...input, seq: seq.current++ }, Date.now());
        next = result.state;
        events.push(...result.events);
      }
      // A rejected input means the shot never happened, so the bot must not remember landing it.
      if (next === current) memory.current.impact = before;
      commit(next, events);
      // The thinking delay belongs to the first look; a re-look only waits the short retry.
    }, retry === 0 ? shotWaitMs(BOT_THINKING_MS, lockedUntil, Date.now()) : RETRY_MS);
    return () => {
      window.clearTimeout(timer);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [state, plan, commit, stateRef, seq, lockedUntil, retry]);
}
