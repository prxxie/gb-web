/**
 * The mutable handles the match screen shares between its hooks (`US-MATCH-008`).
 *
 * A match is one long-lived session: the renderer, the peer mesh and the room socket are created once, and the
 * callbacks that write to them were captured at mount, so a React state value would be stale inside them. They are
 * refs for that reason, and they are created here so each hook receives them as a value instead of reaching into
 * another hook's closure.
 */
import { useRef, type RefObject } from "react";
import type { MatchEvent, MatchState } from "@gbw/core";
import type { BattleHandle } from "../game/scene";
import type { Mesh } from "../net/mesh";
import type { ReconnectingSocket } from "../net/reconnect";
import type { PlannedMatch } from "../lib/plan";

/** The screens the match route passes through; `reconnecting` and `ended` are the two that render (`US-MATCH-003`). */
export type MatchStatus = "connecting" | "live" | "reconnecting" | "ended";

/** The one writer of the match state (`useMatchEngine`'s `commit`): the next state, plus the events that produced it. */
export type CommitState = (next: MatchState, events?: readonly MatchEvent[]) => void;

/** A point in CSS pixels: where the renderer drew this client's mobile (`US-MATCH-003` AC11). */
export interface AimPoint {
  readonly x: number;
  readonly y: number;
}

export interface MatchWiring {
  /** The state the mount-time callbacks read; `state` itself never reaches them (`US-NET-002`). */
  readonly stateRef: RefObject<MatchState | null>;
  readonly battle: RefObject<BattleHandle | null>;
  readonly mesh: RefObject<Mesh | null>;
  readonly socket: RefObject<ReconnectingSocket | null>;
  /** Monotonic input counter, bumped once per input this client sends (`US-NET-002` AC4). */
  readonly seq: RefObject<number>;
  /** Last `seq` applied per `slot:turn`, so a resent input is dropped instead of applied twice (`US-NET-002` AC4). */
  readonly appliedInputs: RefObject<Map<string, number>>;
  /** `playerId → slot` from the last `room_state`, so a control frame can be attributed to a seat (`US-NET-002` AC1). */
  readonly slotsByPlayer: RefObject<Map<string, number>>;
  /** When the last snapshot arrived, for the 2 s watchdog (`US-NET-002` AC6). */
  readonly lastSnapshotAt: RefObject<number>;
  /** Slots the room reports as `grace` or `disconnected`: whose turn is skipped (`US-ROOM-004` AC3/AC7). */
  readonly absent: RefObject<readonly number[]>;
  /** Newest host election seen, so a snapshot from a superseded host is rejected (`US-NET-003` AC5). */
  readonly hostGeneration: RefObject<number>;
  /**
   * Who runs the simulation right now. Seeded from the lobby plan and moved by `host_changed`/`room_state`
   * (`US-NET-003` AC2): the plan is a photograph of the room as it was when the match started.
   */
  readonly hostPlayerId: RefObject<string | null>;
}

export function useMatchWiring(plan: PlannedMatch | null): MatchWiring {
  const stateRef = useRef<MatchState | null>(null);
  const battle = useRef<BattleHandle | null>(null);
  const mesh = useRef<Mesh | null>(null);
  const socket = useRef<ReconnectingSocket | null>(null);
  const seq = useRef(1);
  const appliedInputs = useRef(new Map<string, number>());
  const slotsByPlayer = useRef(new Map<string, number>());
  const lastSnapshotAt = useRef(0);
  const absent = useRef<readonly number[]>([]);
  const hostGeneration = useRef(0);
  const hostPlayerId = useRef<string | null>(plan?.hostPlayerId ?? null);

  return {
    stateRef,
    battle,
    mesh,
    socket,
    seq,
    appliedInputs,
    slotsByPlayer,
    lastSnapshotAt,
    absent,
    hostGeneration,
    hostPlayerId,
  };
}
