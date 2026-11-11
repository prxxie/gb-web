/**
 * The match state itself (`US-MATCH-001`).
 *
 * One `createMatch` per plan, and one `commit` that is the only writer: the step's events are kept so the renderer
 * can animate the shell the engine resolved, and a state that comes back `ended` is handed to the recorder there
 * rather than from each caller.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createMatch, type MatchEvent, type MatchState } from "@gbw/core";
import { shotLockUntil } from "../game/flight";
import type { PlannedMatch } from "../lib/plan";
import type { MatchStatus, MatchWiring } from "./wiring";

export interface MatchEngineOptions {
  readonly plan: PlannedMatch | null;
  readonly finish: (final: MatchState) => void;
  readonly setStatus: (status: MatchStatus) => void;
  readonly wiring: MatchWiring;
}

export interface MatchEngine {
  readonly state: MatchState | null;
  /** The last six events, for the live region (`US-MATCH-003` AC10). */
  readonly feed: readonly MatchEvent[];
  /** The events of the step that produced the current state, handed to the renderer once (`shot` carries the path). */
  readonly pendingEvents: RefObject<readonly MatchEvent[]>;
  readonly commit: (next: MatchState, events?: readonly MatchEvent[]) => void;
  /**
   * When the shell this step launched has finished on screen, or `0` when nothing is in the air (`US-MATCH-012`). The
   * engine resolves a shot instantly, so this is the only thing that says "the sky is still busy".
   */
  readonly lockedUntil: number;
  /** True while `lockedUntil` is in the future: no seat may fire and no bot may answer. */
  readonly cinematic: boolean;
}

export function useMatchEngine(options: MatchEngineOptions): MatchEngine {
  const { plan, finish, setStatus, wiring } = options;
  const { stateRef } = wiring;
  const [state, setState] = useState<MatchState | null>(null);
  const [feed, setFeed] = useState<readonly MatchEvent[]>([]);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [cinematic, setCinematic] = useState(false);
  const pendingEvents = useRef<readonly MatchEvent[]>([]);

  stateRef.current = state;

  const commit = useCallback(
    (next: MatchState, events: readonly MatchEvent[] = []) => {
      stateRef.current = next;
      pendingEvents.current = events;
      setState(next);
      if (events.length > 0) setFeed((previous) => [...previous, ...events].slice(-6));
      // A shot blocks the sky for as long as the renderer will animate it: the turn has already moved on, and without
      // this the next seat fires into a screen that still holds the previous shell (`US-MATCH-012`).
      const until = shotLockUntil(events, Date.now());
      if (until > 0) {
        setLockedUntil(until);
        setCinematic(true);
      }
      if (next.status === "ended") finish(next);
    },
    [finish],
  );

  // One timer per shot: when it fires, the sky is clear again and the next seat may act.
  useEffect(() => {
    if (!cinematic) return;
    const wait = Math.max(0, lockedUntil - Date.now());
    const timer = window.setTimeout(() => {
      setCinematic(false);
      setLockedUntil(0);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [cinematic, lockedUntil]);

  // Create the match once, then mount the renderer.
  useEffect(() => {
    if (!plan) return;
    const match = createMatch({
      matchId: `m-${plan.seed}`,
      roomCode: plan.roomCode,
      seed: plan.seed,
      mode: plan.mode,
      mapId: plan.mapId,
      seats: plan.seats,
      now: Date.now(),
      // The room's start time, not this device's: the record's id is `${roomCode}-${startedAt}` from the
      // room's clock (`room-do.ts` § recordMatch), and a result screen can only resubmit that id if the
      // payload carries the same number (`US-RANK-005` AC6). Kept apart from `now`, because a reload into a
      // live match must not hand the opening turn a deadline that already passed.
      startedAt: plan.startedAt,
    });
    setState(match);
    setStatus("live");
  }, [plan, setStatus]);

  return { state, feed, pendingEvents, commit, lockedUntil, cinematic };
}
