/**
 * The turn clock (`US-ROOM-004` AC3/AC7, `US-MATCH-003` AC2).
 *
 * The host is the clock, and an absent player's turn is skipped rather than waited out. `decideTurn` owns the rules;
 * this hook applies the answer on a 500 ms tick and derives the number the top strip prints.
 */
import { useEffect, useState } from "react";
import { TUNABLES, applyInput, toSnapshot, type MatchState } from "@gbw/core";
import { clockSeconds } from "../lib/clock";
import { decideTurn } from "../net/host-clock";
import { toPackedSnapshot } from "../net/input";
import type { PlannedMatch } from "../lib/plan";
import type { CommitState, MatchWiring } from "./wiring";

export interface TurnClockOptions {
  readonly plan: PlannedMatch | null;
  readonly state: MatchState | null;
  /** Who runs the simulation right now — not who created the room (`US-NET-003` AC2). */
  readonly hosting: boolean;
  readonly commit: CommitState;
  readonly wiring: MatchWiring;
}

export function useTurnClock(options: TurnClockOptions): number {
  const { plan, state, hosting, commit, wiring } = options;
  const { stateRef, absent, hostGeneration, mesh, socket, seq } = wiring;

  useEffect(() => {
    if (!state || state.status !== "playing") return;
    const tick = window.setInterval(() => {
      const current = stateRef.current;
      if (!current || current.status !== "playing" || !plan) return;
      const decision = decideTurn({
        isHost: hosting,
        localSlot: plan.localSlot,
        activeSlot: current.turn.activeSlot,
        deadlineAt: current.turn.deadlineAt,
        absentSlots: absent.current,
        now: Date.now(),
      });
      if (decision.kind === "wait") return;
      const result = applyInput(current, { kind: "skip", slot: current.turn.activeSlot, seq: seq.current++ }, Date.now());
      commit(result.state, result.events);
      // A skip this client decided is the host's word: the peers resync from the snapshot, which carries
      // the new `deadlineAt`, so their clocks do not drift from the turn (`US-ROOM-004` § 5).
      if (hosting && plan.kind === "online") {
        const snapshot = toSnapshot(result.state, hostGeneration.current);
        mesh.current?.broadcast(snapshot);
        socket.current?.send({ t: "snapshot_push", snapshot: toPackedSnapshot(snapshot) });
      }
    }, 500);
    return () => window.clearInterval(tick);
  }, [state, plan, hosting, commit, stateRef, absent, hostGeneration, mesh, socket, seq]);

  // The clock is derived from `deadlineAt`, so it only moves when something renders. A one-second heartbeat is
  // what turns that derivation into a countdown the player can watch (`US-MATCH-003` AC2) — without it the readout
  // froze at the turn duration until a move, a shot or a skipped turn re-rendered the screen.
  const [, setSecond] = useState(0);
  useEffect(() => {
    if (state?.status !== "playing") return undefined;
    const timer = setInterval(() => setSecond((second) => second + 1), 1_000);
    return () => clearInterval(timer);
  }, [state?.status]);

  // The clock reads whole seconds from `deadlineAt` and never climbs above the turn duration (`AC2`).
  return state ? clockSeconds(state.turn.deadlineAt, Date.now(), TUNABLES.turnDurationMs) : 0;
}
