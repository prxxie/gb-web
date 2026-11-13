// @vitest-environment jsdom
/**
 * The bot opponent's turn loop (`US-MATCH-001`, re-cut by `US-BAL-006`).
 *
 * The hook is the only place a bot match is *driven*: it waits, asks the core for the seat's inputs and applies them.
 * Three things can go wrong here and nowhere else — it can fire on the human's turn, it can fire twice, or it can keep
 * a landing the engine never accepted.
 */
import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBotMemory,
  createMatch,
  type BotMemory,
  type MatchEvent,
  type MatchState,
  type Seat,
} from "@gbw/core";
import { BOT_THINKING_MS, useBotOpponent } from "../src/match/useBotOpponent";
import type { PlannedMatch } from "../src/lib/plan";
import type { MatchWiring } from "../src/match/wiring";

const NOW = 1_700_000_000_000;

afterEach(() => {
  vi.useRealTimers();
});

const SEATS: readonly Seat[] = [
  { slot: 0, team: "A", accountId: null, displayName: "p0", mobileId: "mbl-01" },
  { slot: 1, team: "B", accountId: null, displayName: "p1", mobileId: "mbl-02" },
];

/** A flat field with the two hulls where `xs` puts them; slot 0 is the human, slot 1 the bot. */
function match(xs: readonly [number, number] = [300, 600]): MatchState {
  const state = createMatch({
    matchId: "m-1",
    roomCode: "ABC234",
    seed: 42,
    mode: "solo",
    mapId: "map-01",
    seats: SEATS,
    now: NOW,
  });
  return { ...state, players: state.players.map((player, index) => ({ ...player, x: xs[index] ?? player.x })) };
}

/** The bot's turn: slot 1 acts, whatever the seed rolled. */
function botToAct(state: MatchState, number = 3): MatchState {
  return { ...state, turn: { ...state.turn, activeSlot: 1, number } };
}

const PLAN: PlannedMatch = {
  kind: "bot",
  roomCode: "ABC234",
  localSlot: 0,
  playerId: "acc-a",
  seats: SEATS,
  seed: 42,
  mapId: "map-01",
  mode: "solo",
  maxPlayers: 2,
  hostPlayerId: "acc-a",
};

function wiring(state: MatchState, seq = 1): MatchWiring {
  return {
    stateRef: { current: state },
    battle: { current: null },
    mesh: { current: null },
    socket: { current: null },
    seq: { current: seq },
    appliedInputs: { current: new Map() },
    slotsByPlayer: { current: new Map() },
    lastSnapshotAt: { current: 0 },
    absent: { current: [] },
    hostGeneration: { current: 0 },
    hostPlayerId: { current: null },
  };
}

interface Committed {
  readonly state: MatchState;
  readonly events: readonly MatchEvent[];
}

describe("TC-BAL-143: the seat waits its thinking time, then fires once (US-BAL-006 AC4)", () => {
  it("holds the shot for the thinking time and fires after it", () => {
    vi.useFakeTimers();
    const state = botToAct(match());
    const commits: Committed[] = [];
    const wires = wiring(state);

    renderHook(() =>
      useBotOpponent({
        plan: PLAN,
        state,
        commit: (next, events) => commits.push({ state: next, events }),
        wiring: wires,
        lockedUntil: 0,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(BOT_THINKING_MS - 1);
    });
    expect(commits).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(commits).toHaveLength(1);
    // The engine accepted it: the state moved and the feed carries a shot, not a `reject`.
    expect(commits[0]!.state.seq).toBeGreaterThan(state.seq);
    expect(commits[0]!.events.some((event) => event.kind === "shot")).toBe(true);
    expect(commits[0]!.events.some((event) => event.kind === "reject")).toBe(false);
    // The caller stamped the wire's sequence, not the core (`US-BAL-006` AC1).
    expect(wires.seq.current).toBeGreaterThan(1);
  });

  it("does nothing at all while the human holds the turn", () => {
    vi.useFakeTimers();
    const state = match();
    const commits: unknown[] = [];
    const wires = wiring(state);

    renderHook(() =>
      useBotOpponent({ plan: PLAN, state, commit: (next) => commits.push(next), wiring: wires, lockedUntil: 0 }),
    );
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(commits).toHaveLength(0);
  });

  it("fires once, not once per render, under StrictMode", () => {
    vi.useFakeTimers();
    const state = botToAct(match());
    const commits: unknown[] = [];
    const wires = wiring(state);

    renderHook(
      () => useBotOpponent({ plan: PLAN, state, commit: (next) => commits.push(next), wiring: wires, lockedUntil: 0 }),
      { wrapper: StrictMode },
    );
    act(() => {
      vi.advanceTimersByTime(BOT_THINKING_MS * 3);
    });
    expect(commits).toHaveLength(1);
  });

  it("commits nothing once the match has ended", () => {
    vi.useFakeTimers();
    const ended: MatchState = { ...botToAct(match()), status: "ended", winnerTeam: "A" };
    const commits: unknown[] = [];
    const wires = wiring(ended);

    renderHook(() =>
      useBotOpponent({ plan: PLAN, state: ended, commit: (next) => commits.push(next), wiring: wires, lockedUntil: 0 }),
    );
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(commits).toHaveLength(0);
  });
});

describe("TC-BAL-148: a shot the engine refused is not remembered as a landing (US-BAL-006 AC3, AC5)", () => {
  it("keeps the impact memory empty when the input is rejected, and sets it when it lands", () => {
    vi.useFakeTimers();
    // A refused shot needs a counter that is behind the engine's: `lastInputSeq` 5 against a client at 0.
    const state: MatchState = { ...botToAct(match([300, 600])), lastInputSeq: 5 };
    const commits: Committed[] = [];
    const wires = wiring(state, 0);
    const memory = { current: createBotMemory() as BotMemory };

    renderHook(() =>
      useBotOpponent({
        plan: PLAN,
        state,
        commit: (next, events) => commits.push({ state: next, events }),
        wiring: wires,
        lockedUntil: 0,
        memory,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(BOT_THINKING_MS + 1);
    });
    // The shot was refused: the state did not move and nothing was remembered as landed.
    expect(commits).toHaveLength(1);
    expect(commits[0]!.state).toBe(state);
    expect(memory.current.impact).toBeNull();
    expect(commits[0]!.events.some((event) => event.kind === "reject")).toBe(true);
  });

  it("remembers the landing of a shot that did go through", () => {
    vi.useFakeTimers();
    const state = botToAct(match([300, 600]));
    const commits: Committed[] = [];
    const wires = wiring(state, 1);
    const memory = { current: createBotMemory() as BotMemory };

    renderHook(() =>
      useBotOpponent({
        plan: PLAN,
        state,
        commit: (next, events) => commits.push({ state: next, events }),
        wiring: wires,
        lockedUntil: 0,
        memory,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(BOT_THINKING_MS + 1);
    });
    expect(commits).toHaveLength(1);
    expect(memory.current.impact).not.toBeNull();
    expect(memory.current.impact?.turn).toBe(state.turn.number);
  });
});
