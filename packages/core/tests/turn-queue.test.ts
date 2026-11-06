import { describe, expect, it } from "vitest";
import { ITEMS_BY_ID } from "../src/data/items.js";
import { getMobile } from "../src/data/mobiles.js";
import { applyInput, createMatch, passTurn, type Seat } from "../src/match.js";
import {
  addDelay,
  advanceTurn,
  createTurn,
  extendOrExpire,
  isExpired,
  nextSlot,
  nextSlotForMode,
  queueOrder,
} from "../src/turn.js";
import { TUNABLES } from "../src/tuning.js";
import type { MatchState, PlayerState } from "../src/types.js";

const NOW = 1_700_000_000_000;

function seat(slot: number, team: "A" | "B", loadout: Record<string, number> = {}): Seat {
  return { slot, team, accountId: `acc-${slot}`, displayName: `P${slot}`, mobileId: "mbl-01", loadout };
}

/** Four `mbl-01` seats (`baseDelay 100`) in one solo match. */
function four(loadout: Record<string, number> = {}): MatchState {
  return createMatch({
    matchId: "match-queue",
    roomCode: "ABC234",
    seed: 7,
    mode: "solo",
    mapId: "map-01",
    seats: [seat(0, "A", loadout), seat(1, "B"), seat(2, "A"), seat(3, "B")],
    now: NOW,
  });
}

function withDelays(state: MatchState, delays: readonly number[]): MatchState {
  return {
    ...state,
    players: state.players.map((player) => ({ ...player, delay: delays[player.slot] ?? player.delay })),
  };
}

const slots = (players: readonly PlayerState[]): number[] => players.map((player) => player.slot);

function skip(state: MatchState, seq = state.seq): MatchState {
  return applyInput(state, { kind: "skip", slot: state.turn.activeSlot, seq }, NOW + 1).state;
}

describe("TC-CORE-943: the shield refills on its owner's turn (US-CORE-003 AC3)", () => {
  const shieldOf = (state: MatchState, slot: number): number => {
    const player = state.players.find((candidate) => candidate.slot === slot);
    if (!player) throw new Error(`no slot ${slot}`);
    return player.shield;
  };
  const withShield = (state: MatchState, slot: number, shield: number): MatchState => ({
    ...state,
    players: state.players.map((player) => (player.slot === slot ? { ...player, shield } : player)),
  });

  it("adds shieldRegen at the start of the turn, capped at maxShield", () => {
    // mbl-01 is Stone Sentinel: shieldRegen 20, maxShield 150 (`mobiles.md`).
    const state = withShield(four(), 1, 10);
    const next = skip(state);
    expect(next.turn.activeSlot).toBe(1);
    expect(shieldOf(next, 1)).toBe(30);

    const nearlyFull = skip(withShield(state, 1, 145));
    expect(shieldOf(nearlyFull, 1)).toBe(150);
  });

  it("never regenerates a slot that is not starting its turn", () => {
    const state = withShield(four(), 2, 10);
    const next = skip(state);
    expect(shieldOf(next, 2)).toBe(10);
  });
});

describe("turn queue (US-CORE-002)", () => {
  it("TC-CORE-901: the lowest accumulated delay acts first and ties keep slot order", () => {
    const state = four();
    const skewed = withDelays(state, [140, 100, 160, 120]);

    expect(slots(queueOrder(skewed.players))).toEqual([1, 3, 0, 2]);
    expect(nextSlot(skewed.players)).toBe(1);
    expect(nextSlotForMode(skewed.players, 1, "solo")).toBe(3);
    // The pointer wraps at the end of the order instead of rescanning from slot 0.
    expect(nextSlotForMode(skewed.players, 2, "solo")).toBe(1);
    expect(nextSlotForMode(skewed.players, 0, "solo")).toBe(2);

    // Equal delays: the pointer walks 0 → 1 → 2 → 3 and never re-offers a slot that already acted.
    let current = state;
    expect(current.turn.activeSlot).toBe(0);
    for (const expected of [1, 2, 3]) {
      current = skip(current);
      expect(current.turn.activeSlot).toBe(expected);
      expect(current.turn.round).toBe(1);
      expect(current.turn.actedSlots).not.toContain(expected);
    }

    // Acting once each closes the round: the next round is entered with nobody skipped.
    current = skip(current);
    expect(current.turn.round).toBe(2);
    expect(current.turn.actedSlots).toEqual([]);
    expect(current.turn.activeSlot).toBe(0);
  });

  it("TC-CORE-901: the super shot adds its 200 delay and pushes the shooter behind the others", () => {
    const state = four();
    const superDelay = getMobile("mbl-01").weapons[2].delay;
    expect(superDelay).toBe(200);

    const onSlot3: MatchState = { ...state, turn: { ...state.turn, activeSlot: 3 } };
    const fired = applyInput(onSlot3, { kind: "fire", slot: 3, weaponSlot: 2, angle: 45, force: 50, seq: 0 }, NOW + 1_000);

    expect(fired.events.some((event) => event.kind === "shot")).toBe(true);
    expect(fired.state.players[3]!.delay).toBe(100 + superDelay);
    expect(fired.state.players.filter((player) => player.slot !== 3).every((player) => player.delay === 100)).toBe(true);
    expect(slots(queueOrder(fired.state.players))).toEqual([0, 1, 2, 3]);
    expect(fired.state.turn.activeSlot).toBe(0);
    expect(fired.state.turn.number).toBe(onSlot3.turn.number + 1);
  });

  it("TC-CORE-901: an item's delay cost is added before sorting, so it can cost the next turn", () => {
    const state = withDelays(four({ "itm-team-teleport": 1 }), [100, 120, 120, 120]);
    const item = ITEMS_BY_ID.get("itm-team-teleport");
    expect(item?.delayCost).toBe(40);

    const used = applyInput(state, { kind: "item", slot: 0, itemId: "itm-team-teleport", seq: 0 }, NOW + 500);
    expect(used.state.players[0]!.delay).toBe(140);
    expect(used.state.turn.activeSlot).toBe(0);
    // Already last in the queue before the shot resolves.
    expect(slots(queueOrder(used.state.players))).toEqual([1, 2, 3, 0]);

    const fired = applyInput(
      used.state,
      { kind: "fire", slot: 0, weaponSlot: 0, angle: 45, force: 60, seq: used.state.seq },
      NOW + 1_000,
    );
    expect(fired.state.players[0]!.delay).toBe(240);
    expect(fired.state.turn.activeSlot).toBe(1);
  });

  it("TC-CORE-152: the turn clock runs 20 s and expires after exactly one grace period", () => {
    const turn = createTurn(2, NOW);
    expect(TUNABLES.turnDurationMs).toBe(20_000);
    expect(TUNABLES.turnGraceMs).toBe(20_000);
    expect(turn.deadlineAt).toBe(NOW + TUNABLES.turnDurationMs);
    expect(turn.extended).toBe(false);

    expect(isExpired(turn, NOW + TUNABLES.turnDurationMs - 1)).toBe(false);
    expect(isExpired(turn, NOW + TUNABLES.turnDurationMs)).toBe(true);

    const grace = extendOrExpire(turn, NOW + TUNABLES.turnDurationMs);
    expect(grace.expired).toBe(false);
    expect(grace.turn.extended).toBe(true);
    expect(grace.turn.deadlineAt).toBe(NOW + TUNABLES.turnDurationMs + TUNABLES.turnGraceMs);

    const expired = extendOrExpire(grace.turn, grace.turn.deadlineAt);
    expect(expired.expired).toBe(true);
    expect(expired.turn).toEqual(grace.turn);
  });

  it("TC-CORE-152: when the clock expires the turn is skipped once and the queue advances one slot", () => {
    const state = four();
    expect(state.turn.activeSlot).toBe(0);
    const grace = extendOrExpire(state.turn, NOW + TUNABLES.turnDurationMs);
    const expired = extendOrExpire(grace.turn, grace.turn.deadlineAt);
    expect(expired.expired).toBe(true);

    const skipped = passTurn(state, expired.turn.deadlineAt);
    expect(skipped.state.turn.number).toBe(state.turn.number + 1);
    expect(skipped.state.turn.activeSlot).toBe(1);
    expect(skipped.state.turn.actedSlots).toEqual([0]);
    expect(skipped.state.turn.round).toBe(state.turn.round);
    expect(skipped.state.turn.deadlineAt).toBe(expired.turn.deadlineAt + TUNABLES.turnDurationMs);
    // Exactly one turn event: the timeout does not bounce the queue twice.
    expect(skipped.events.filter((event) => event.kind === "turn")).toHaveLength(1);
    expect(skipped.state.players[0]!.shotsFired).toBe(0);
  });

  it("TC-CORE-027 / TC-CORE-936: an eliminated slot is skipped but keeps its accumulated delay", () => {
    const state = four();
    const dead: MatchState = {
      ...state,
      players: state.players.map((player) =>
        player.slot === 0 ? { ...player, eliminated: true, delay: 40 } : player,
      ),
    };
    expect(slots(queueOrder(dead.players))).toEqual([1, 2, 3]);
    expect(nextSlot(dead.players)).toBe(1);

    const carried = addDelay(dead.players, 0, 25);
    expect(carried[0]!.delay).toBe(65);

    // A dead slot never holds the round open, even when it never acted.
    const closing: MatchState = { ...dead, turn: { ...dead.turn, activeSlot: 3, actedSlots: [1, 2] } };
    const { turn, roundCompleted } = advanceTurn(closing.turn, closing.players, {
      now: NOW,
      activeSlot: null,
      mode: "solo",
    });
    expect(roundCompleted).toBe(true);
    expect(turn.round).toBe(2);
    expect(turn.activeSlot).toBe(1);
    expect(turn.actedSlots).toEqual([]);
  });

  it("TC-CORE-045: a stale seq is dropped so only the newest input counts", () => {
    let state = four();
    const fired = applyInput(state, { kind: "fire", slot: 0, weaponSlot: 0, angle: 45, force: 60, seq: 5 }, NOW + 1);
    expect(fired.state.players[0]!.shotsFired).toBe(1);
    state = fired.state;

    // Let the queue come back round to slot 0; seq 5 is still its newest input.
    expect(state.turn.activeSlot).toBe(1);
    // Each skip needs its own, strictly newer `seq`: reusing 6 is the duplicate the guard exists to drop.
    let seq = 6;
    for (const expected of [2, 3, 0]) {
      const before = state.turn.activeSlot;
      state = skip(state, seq);
      seq += 1;
      expect(state.turn.activeSlot).toBe(expected);
      expect(before).not.toBe(expected);
    }
    expect(state.turn.round).toBe(2);

    const stale = applyInput(state, { kind: "fire", slot: 0, weaponSlot: 0, angle: 45, force: 60, seq: 5 }, NOW + 2);
    expect(stale.state.players[0]!.shotsFired).toBe(1);
    expect(stale.events[0]).toMatchObject({ kind: "reject" });
  });
});
