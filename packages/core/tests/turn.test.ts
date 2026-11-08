import { describe, expect, it } from "vitest";
import { ITEMS_BY_ID } from "../src/data/items.js";
import { getMobile } from "../src/data/mobiles.js";
import type { PlayerState, Turn } from "../src/types.js";
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

const NOW = 1_700_000_000_000;

function player(slot: number, overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    slot,
    accountId: `acc-${slot}`,
    displayName: `P${slot}`,
    mobileId: "mbl-01",
    team: slot % 2 === 0 ? "A" : "B",
    x: 200 + slot * 100,
    y: 820,
    facing: 1,
    hp: 1_050,
    shield: 150,
    energy: 105,
    delay: 100,
    eliminated: false,
    attack: 1,
    damageDealt: 0,
    shotsFired: 0,
    hits: 0,
    superShotUsed: false,
    items: {},
    ...overrides,
  };
}

/** A four-player roster (`mbl-01`, `baseDelay 100`) with per-slot accumulated delay. */
function roster(delays: readonly number[] = [100, 100, 100, 100]): readonly PlayerState[] {
  return delays.map((delay, slot) => player(slot, { delay }));
}

const slots = (players: readonly PlayerState[]): number[] => players.map((entry) => entry.slot);

describe("turn queue (US-CORE-002)", () => {
  it("TC-CORE-901: four equal base delays keep slot order and the lowest delay acts next", () => {
    const players = roster();
    expect(slots(queueOrder(players))).toEqual([0, 1, 2, 3]);
    expect(nextSlot(players)).toBe(0);
    expect(nextSlotForMode(players, 0, "solo")).toBe(1);

    const { turn, roundCompleted } = advanceTurn(createTurn(0, NOW), players, {
      now: NOW,
      activeSlot: null,
      mode: "solo",
    });
    expect(roundCompleted).toBe(false);
    expect(turn.activeSlot).toBe(1);
    expect(turn.number).toBe(2);
    expect(turn.round).toBe(1);
    expect(turn.actedSlots).toEqual([0]);

    // A lower accumulated delay wins even when its slot index is higher.
    const skewed = roster([140, 100, 160, 120]);
    expect(nextSlot(skewed)).toBe(1);
    expect(nextSlotForMode(skewed, 1, "solo")).toBe(3);
    expect(slots(queueOrder(skewed))).toEqual([1, 3, 0, 2]);
  });

  it("TC-CORE-901: a super shot adds its 200 delay and pushes the shooter behind the others", () => {
    const players = roster();
    const superDelay = getMobile("mbl-01").weapons[2].delay;
    expect(superDelay).toBe(200);

    const fired = addDelay(players, 3, superDelay);
    expect(fired[3]?.delay).toBe(300);
    expect(slots(queueOrder(fired))).toEqual([0, 1, 2, 3]);

    const { turn } = advanceTurn(createTurn(3, NOW), fired, { now: NOW, activeSlot: null, mode: "solo" });
    expect(turn.activeSlot).toBe(0);
    expect(turn.number).toBe(2);
  });

  it("TC-CORE-901: an item's delay cost is added before sorting, so it can cost the next turn", () => {
    const players = roster();
    const teleport = ITEMS_BY_ID.get("itm-team-teleport");
    // GB's Team Teleport is a cheap item (50) next to Dual (600): the queue still feels it.
    expect(teleport?.delayCost).toBe(50);

    const afterItem = addDelay(players, 2, teleport?.delayCost ?? 0);
    expect(afterItem[2]?.delay).toBe(150);
    expect(slots(queueOrder(afterItem))).toEqual([0, 1, 3, 2]);
    expect(nextSlotForMode(afterItem, 1, "solo")).toBe(3);
    expect(nextSlot(afterItem)).toBe(0);

    // A move pays `moveDelay` into the same queue.
    const moved = addDelay(players, 0, getMobile("mbl-01").moveDelay);
    expect(nextSlot(moved)).toBe(1);
  });

  it("TC-CORE-152: the 20 s clock expires after one extension and the queue advances once", () => {
    const turn = createTurn(0, NOW);
    expect(turn.deadlineAt - NOW).toBe(20_000);
    expect(TUNABLES.turnDurationMs).toBe(20_000);
    expect(isExpired(turn, NOW + TUNABLES.turnDurationMs - 1)).toBe(false);
    expect(isExpired(turn, NOW + TUNABLES.turnDurationMs)).toBe(true);

    const first = extendOrExpire(turn, NOW + TUNABLES.turnDurationMs);
    expect(first.expired).toBe(false);
    expect(first.turn.extended).toBe(true);
    expect(first.turn.deadlineAt - (NOW + TUNABLES.turnDurationMs)).toBe(TUNABLES.turnGraceMs);

    const second = extendOrExpire(first.turn, NOW + TUNABLES.turnDurationMs + TUNABLES.turnGraceMs);
    expect(second.expired).toBe(true);
    expect(second.turn).toBe(first.turn);

    const { turn: next, roundCompleted } = advanceTurn(first.turn, roster(), {
      now: second.turn.deadlineAt,
      activeSlot: null,
      mode: "solo",
    });
    expect(roundCompleted).toBe(false);
    expect(next.number).toBe(first.turn.number + 1);
    expect(next.round).toBe(first.turn.round);
    expect(next.activeSlot).toBe(1);
    expect(next.actedSlots).toEqual([0]);
    expect(next.extended).toBe(false);
    expect(next.deadlineAt - second.turn.deadlineAt).toBe(TUNABLES.turnDurationMs);
  });

  it("TC-CORE-027: an eliminated slot is skipped but keeps its accumulated delay", () => {
    const players = roster([40, 100, 100, 100]).map((entry) =>
      entry.slot === 0 ? { ...entry, eliminated: true } : entry,
    );
    expect(slots(queueOrder(players))).toEqual([1, 2, 3]);
    expect(nextSlot(players)).toBe(1);

    const carried = addDelay(players, 0, 25);
    expect(carried[0]?.delay).toBe(65);

    // The dead slot never acted this round and does not hold it open.
    const closing: Turn = { ...createTurn(3, NOW), actedSlots: [1, 2] };
    const { turn, roundCompleted } = advanceTurn(closing, players, { now: NOW, activeSlot: null, mode: "solo" });
    expect(roundCompleted).toBe(true);
    expect(turn.round).toBe(2);
    expect(turn.activeSlot).toBe(1);
    expect(turn.actedSlots).toEqual([]);
  });
});
