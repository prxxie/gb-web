/**
 * The player's own inputs: walking, skipping and the item frame (`US-MATCH-002` AC7/AC8, `US-MATCH-004` AC1).
 *
 * Every one of them sends or applies exactly once, and only the host publishes: a peer's local move is not the
 * simulation anyone else sees (`US-NET-002`).
 */
import { useCallback } from "react";
import { applyInput, toSnapshot, type Mobile } from "@gbw/core";
import type { Dispatch, SetStateAction } from "react";
import type { PadAction } from "../components/DirectionPad";
import type { PlannedMatch } from "../lib/plan";
import { inputFrameOf } from "../net/input";
import type { CommitState, MatchWiring } from "./wiring";

export interface MatchInputsOptions {
  readonly plan: PlannedMatch | null;
  readonly mobile: Mobile;
  readonly commit: CommitState;
  readonly hosting: boolean;
  readonly wiring: MatchWiring;
  readonly setAimDelta: Dispatch<SetStateAction<number>>;
}

export interface MatchInputs {
  readonly onPad: (action: PadAction) => void;
  readonly onRepeat: (action: PadAction, times: number) => void;
  readonly onSkip: () => void;
}

export function useMatchInputs(options: MatchInputsOptions): MatchInputs {
  const { plan, mobile, commit, hosting, wiring, setAimDelta } = options;
  const { mesh, seq, stateRef, hostGeneration } = wiring;

  const onPad = useCallback(
    (action: PadAction) => {
      const current = stateRef.current;
      if (!current || !plan) return;
      if (action === "up") setAimDelta((value) => Math.min(mobile.angleMax - 45, value + 1));
      if (action === "down") setAimDelta((value) => Math.max(mobile.angleMin - 45, value - 1));
      if (action === "left" || action === "right") {
        const result = applyInput(
          current,
          { kind: "move", slot: plan.localSlot, dir: action === "left" ? -1 : 1, run: false, seq: seq.current++ },
          Date.now(),
        );
        commit(result.state, result.events);
        // Only the host publishes: a peer's local move is not the simulation anyone else sees (`US-NET-002`).
        if (hosting) mesh.current?.broadcast(toSnapshot(result.state, hostGeneration.current));
      }
    },
    [plan, mobile, commit, hosting, setAimDelta, mesh, seq, stateRef, hostGeneration],
  );

  const onRepeat = useCallback(
    (action: PadAction, times: number) => {
      for (let index = 0; index < times; index += 1) onPad(action);
    },
    [onPad],
  );

  // Skip is the same input the clock expiry sends, so the turn resolves exactly once (`US-MATCH-004` AC1).
  const onSkip = useCallback(() => {
    const current = stateRef.current;
    if (!current || !plan || current.turn.activeSlot !== plan.localSlot) return;
    const turn = current.turn.number;
    if (!hosting) {
      mesh.current?.sendControlAll(inputFrameOf({ kind: "skip" }, turn, seq.current++));
      return;
    }
    const result = applyInput(current, { kind: "skip", slot: plan.localSlot, seq: seq.current++ }, Date.now());
    commit(result.state, result.events);
    mesh.current?.broadcast(toSnapshot(result.state, hostGeneration.current));
  }, [plan, commit, hosting, mesh, seq, stateRef, hostGeneration]);

  return { onPad, onRepeat, onSkip };
}
