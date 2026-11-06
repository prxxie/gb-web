/**
 * Who advances the turn, and when (`US-ROOM-004` AC3, AC7).
 *
 * The host is the clock: everyone else only advances its *own* expired turn so a client in front of a
 * vanished host is never frozen. The rules live here rather than in `MatchPage` because the interesting
 * cases — a slot in `grace`, a slot the room already retired, a turn that expired while nobody was
 * looking — are cheaper to prove as a decision table than through a Phaser route.
 */

/** What the caller knows about the turn at this tick. */
export interface TurnAuthority {
  /** This client is the host of the room (`RoomState.hostPlayerId`), so it may advance anyone's turn. */
  readonly isHost: boolean;
  /** The slot this client plays. */
  readonly localSlot: number;
  /** `state.turn.activeSlot`. */
  readonly activeSlot: number;
  /** `state.turn.deadlineAt`, in epoch milliseconds. */
  readonly deadlineAt: number;
  /** Slots whose `connectionState` is not `connected` — `grace` and `disconnected` alike. */
  readonly absentSlots: readonly number[];
  /** The tick's clock. */
  readonly now: number;
}

export type TurnDecision =
  | { readonly kind: "wait" }
  | { readonly kind: "skip"; readonly reason: "clock" | "absent" };

/**
 * Decide what this tick should do about the turn.
 *
 * `absent` wins over `clock` for the host: a player who is not connected cannot press fire, so holding
 * the match for the rest of their clock only wastes everyone else's turn (`US-ROOM-004` AC7 — the turn
 * skips *while* the cellular blip lasts, not 20 s later).
 */
export function decideTurn(authority: TurnAuthority): TurnDecision {
  const expired = authority.now > authority.deadlineAt;
  // A client always advances its own expired turn, host or not: the host may be the one that went away,
  // and `passTurn` is idempotent on `seq`, so two clients doing it produces one turn change.
  if (expired && authority.activeSlot === authority.localSlot) return { kind: "skip", reason: "clock" };
  if (!authority.isHost) return { kind: "wait" };
  if (authority.absentSlots.includes(authority.activeSlot)) return { kind: "skip", reason: "absent" };
  // The host advances any expired turn, including a remote slot in a room where nobody is absent yet —
  // otherwise a hosted match waits forever on a peer that stopped sending.
  if (expired) return { kind: "skip", reason: "clock" };
  return { kind: "wait" };
}
