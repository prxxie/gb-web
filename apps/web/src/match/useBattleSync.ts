/**
 * Mirroring the screen's state into the renderer (`US-MATCH-002` AC7/AC8, `US-MATCH-005` AC2, `US-MATCH-006`).
 *
 * The scene draws what it is given and decides nothing: these four effects are the whole of the hand-over — the state
 * itself, whether this client may aim, the pad's nudge and the trajectory aid.
 */
import { useEffect, type RefObject } from "react";
import type { MatchEvent, MatchState } from "@gbw/core";
import { canAim } from "../game/aim";
import { writeAimAid } from "./aimAid";
import type { MatchWiring } from "./wiring";

export interface BattleSyncOptions {
  readonly wiring: MatchWiring;
  readonly state: MatchState | null;
  readonly localSlot: number;
  /** The step's events, handed to the renderer once so the shell follows the resolved path. */
  readonly pendingEvents: RefObject<readonly MatchEvent[]>;
  readonly aimDelta: number;
  readonly aimDeltaRef: RefObject<number>;
  readonly aimAid: boolean;
  readonly lockedTurn: number | null;
}

export function useBattleSync(options: BattleSyncOptions): void {
  const { wiring, state, localSlot, pendingEvents, aimDelta, aimDeltaRef, aimAid, lockedTurn } = options;
  const { battle } = wiring;

  // The aim aid draws the angle the shot will carry, so the scene needs the pad's nudge (`US-MATCH-006`).
  useEffect(() => {
    aimDeltaRef.current = aimDelta;
    battle.current?.setAimDelta(aimDelta);
  }, [aimDelta, aimDeltaRef, battle]);

  useEffect(() => {
    if (battle.current && state) {
      battle.current.setState(state, localSlot, pendingEvents.current);
      pendingEvents.current = [];
    }
  }, [state, localSlot, battle, pendingEvents]);

  // The scene draws the ring and the preview only while this client may shoot (`US-MATCH-002` AC7/AC8).
  useEffect(() => {
    if (!state) return;
    const own = state.players.find((player) => player.slot === localSlot);
    battle.current?.setAimAllowed(
      canAim({
        status: state.status,
        activeSlot: state.turn.activeSlot,
        localSlot,
        eliminated: own?.eliminated ?? false,
        lockedTurn,
        turnNumber: state.turn.number,
      }),
    );
  }, [state, localSlot, lockedTurn, battle]);

  // The trajectory aid is opt-in (`US-MATCH-005` AC2): the scene keeps it off until the player asks, and the choice
  // survives a reload because re-learning an arc every session is not the point.
  useEffect(() => {
    battle.current?.setAimAid(aimAid);
    writeAimAid(aimAid);
  }, [aimAid, battle]);
}
