import type { ModeId, PlayerState, Turn } from "./types.js";
import { TUNABLES, clamp } from "./tuning.js";

/**
 * Turn order is a **delay queue**, not an alternation (`tunables.md` § 3).
 *
 * Every player carries an accumulated `delay`; the lowest delay acts next; the action then adds its own
 * delay to that player. A cheap shot buys tempo, a super shot costs you the next turn — which is exactly
 * the pressure the genre is built on.
 */
/**
 * Queue order for a mode.
 *
 * `tag` groups a team's members together (the whole team acts, then the other team), everything else
 * sorts purely by accumulated delay — the delay queue that makes a cheap weapon buy a turn.
 */
export function queueOrderForMode(players: readonly PlayerState[], mode: ModeId): readonly PlayerState[] {
  const living = players.filter((player) => !player.eliminated).sort((a, b) => a.delay - b.delay || a.slot - b.slot);
  if (mode !== "tag") return living;
  return [...living].sort((a, b) => {
    if (a.team !== b.team) return a.team === "A" ? -1 : 1;
    return a.delay - b.delay || a.slot - b.slot;
  });
}

export function nextSlotForMode(players: readonly PlayerState[], activeSlot: number, mode: ModeId): number | null {
  const order = queueOrderForMode(players, mode);
  if (order.length === 0) return null;
  const index = order.findIndex((player) => player.slot === activeSlot);
  if (index === -1) return order[0]?.slot ?? null;
  return order[(index + 1) % order.length]?.slot ?? null;
}

export function queueOrder(players: readonly PlayerState[]): readonly PlayerState[] {
  return [...players]
    .filter((player) => !player.eliminated)
    .sort((a, b) => (a.delay === b.delay ? a.slot - b.slot : a.delay - b.delay));
}

/** The slot that acts next, or `null` when every mobile is down. */
export function nextSlot(players: readonly PlayerState[]): number | null {
  const [first] = queueOrder(players);
  return first ? first.slot : null;
}

/** Add queue weight to one player. Negative or non-finite input is a bug, not a rule. */
export function addDelay(
  players: readonly PlayerState[],
  slot: number,
  amount: number,
): readonly PlayerState[] {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError(`invalid delay ${amount}`);
  }
  return players.map((player) =>
    player.slot === slot ? { ...player, delay: clamp(player.delay + amount, 0, 100_000) } : player,
  );
}

/** Relative delay used by the roster strip: `delay − activeDelay`. */
export function relativeDelay(player: PlayerState, activeSlot: number, players: readonly PlayerState[]): number {
  const active = players.find((candidate) => candidate.slot === activeSlot);
  if (!active || player.slot === activeSlot) return Math.round(player.delay / 10);
  return Math.round((player.delay - active.delay) / 10);
}

export function createTurn(activeSlot: number, now: number): Turn {
  return {
    activeSlot,
    number: 1,
    round: 1,
    deadlineAt: now + TUNABLES.turnDurationMs,
    extended: false,
    actedSlots: [],
  };
}

export interface AdvanceResult {
  readonly turn: Turn;
  readonly roundCompleted: boolean;
}

/**
 * Close the current turn and open the next one.
 *
 * A **round** completes when every living slot has acted once — that boundary is when the weather rolls
 * (`US-CORE-015`). Slots that died earlier in the round do not hold it open.
 */
export function advanceTurn(
  turn: Turn,
  players: readonly PlayerState[],
  options: { readonly now: number; readonly activeSlot: number | null; readonly mode?: ModeId },
): AdvanceResult {
  const living = players.filter((player) => !player.eliminated).map((player) => player.slot);
  const acted = new Set(turn.actedSlots);
  acted.add(turn.activeSlot);
  const roundCompleted = living.length > 0 && living.every((slot) => acted.has(slot));
  const nextActed = roundCompleted ? [] : [...acted].filter((slot) => living.includes(slot));
  const slot =
    options.activeSlot ??
    (options.mode ? nextSlotForMode(players, turn.activeSlot, options.mode) : nextSlot(players)) ??
    turn.activeSlot;
  return {
    turn: {
      activeSlot: slot,
      number: turn.number + 1,
      round: turn.round + (roundCompleted ? 1 : 0),
      deadlineAt: options.now + TUNABLES.turnDurationMs,
      extended: false,
      actedSlots: nextActed,
    },
    roundCompleted,
  };
}

/** The 20 s clock ran out: one extension, then the turn passes with no shot (`US-CORE-002`). */
export function extendOrExpire(turn: Turn, now: number): { turn: Turn; expired: boolean } {
  if (!turn.extended) {
    return {
      turn: { ...turn, extended: true, deadlineAt: now + TUNABLES.turnGraceMs },
      expired: false,
    };
  }
  return { turn, expired: true };
}

/**
 * When the current turn began.
 *
 * The clock is stored as a deadline (the wire carries one number, not two), and a turn that was extended adds the grace
 * on top — so the start is the deadline minus whichever window is in force.
 */
export function turnStartedAt(turn: Turn): number {
  return turn.deadlineAt - (turn.extended ? TUNABLES.turnDurationMs + TUNABLES.turnGraceMs : TUNABLES.turnDurationMs);
}

/** `+10 delay per second spent deciding` (`tunables.md` § 2), capped at the turn's own length. */
export function thinkingDelay(turn: Turn, now: number): number {
  const elapsedMs = clamp(now - turnStartedAt(turn), 0, TUNABLES.turnDurationMs);
  return Math.floor(elapsedMs / 1000) * TUNABLES.thinkingDelayPerSecond;
}

export function isExpired(turn: Turn, now: number): boolean {
  return now >= turn.deadlineAt;
}
