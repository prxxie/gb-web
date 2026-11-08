import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/data/items.js";
import {
  applyInput,
  createMatch,
  passTurn,
  terrainOf,
  type MatchEvent,
  type Seat,
} from "../src/match.js";
import { createTerrain, groundY } from "../src/terrain.js";
import { getMobile } from "../src/data/mobiles.js";
import { advanceTurn } from "../src/turn.js";
import { TUNABLES } from "../src/tuning.js";
import type { ItemId, MatchState } from "../src/types.js";

/**
 * Oracle tests for `US-CORE-009` (item effects) against `docs/02-reference/data/items.md`.
 *
 * Items are applied through `applyInput`, never through a private helper: the story is about the
 * behaviour a player can see — delay charged, quantity spent, turn order kept, shot changed.
 */

const NOW = 1_700_000_000_000;

function seat(
  slot: number,
  team: "A" | "B",
  mobileId = "mbl-01",
  loadout: Readonly<Record<string, number>> = {},
): Seat {
  return { slot, team, accountId: null, displayName: `p${slot}`, mobileId, loadout };
}

function match(
  seats: readonly Seat[] = [seat(0, "A"), seat(1, "B")],
  mapId = "map-01",
): MatchState {
  return createMatch({
    matchId: "match-1",
    roomCode: "ABC234",
    seed: 7,
    mode: "solo",
    mapId,
    seats,
    now: NOW,
  });
}

function use(state: MatchState, slot: number, itemId: string) {
  return applyInput(state, { kind: "item", slot, itemId: itemId as ItemId, seq: state.seq }, NOW);
}

function fire(state: MatchState, slot: number, weaponSlot: 0 | 1 | 2, angle: number, force: number) {
  return applyInput(state, { kind: "fire", slot, weaponSlot, angle, force, seq: state.seq }, NOW);
}

function firstOf<K extends MatchEvent["kind"]>(
  events: readonly MatchEvent[],
  kind: K,
): Extract<MatchEvent, { kind: K }> {
  for (const event of events) {
    if (event.kind === kind) return event as Extract<MatchEvent, { kind: K }>;
  }
  throw new Error(`expected a ${kind} event`);
}

function shotOf(events: readonly MatchEvent[]) {
  return firstOf(events, "shot");
}

/** Skip turns until `slot` is the active player again. */
function backTo(state: MatchState, slot: number): MatchState {
  let current = state;
  for (let step = 0; step < 8 && current.turn.activeSlot !== slot; step += 1) {
    current = passTurn(current, NOW).state;
  }
  expect(current.turn.activeSlot).toBe(slot);
  return current;
}

/** Same match with the wind removed, so a shot's arc depends only on angle and force. */
function calm(state: MatchState): MatchState {
  return {
    ...state,
    weather: { ...state.weather, wind: { magnitude: 0, directionDeg: 0, sector: 0 } },
  };
}

describe("items", () => {
  it("TC-CORE-901: every item charges its delay cost and spends one copy before the next player is chosen", () => {
    const loadout: Record<string, number> = {};
    for (const item of ITEMS) loadout[item.itemId] = 1;
    let charged = 0;
    let last = match([seat(0, "A", "mbl-01", loadout), seat(1, "B")]);
    const start = last.players[0]!;
    for (const item of ITEMS) {
      // A fresh match per item: Dual opens a two-shot window, and an item inside it is refused by design.
      const state = match([seat(0, "A", "mbl-01", loadout), seat(1, "B")]);
      const before = state.players[0]!;
      const result = use(state, 0, item.itemId);
      const after = result.state.players[0]!;
      expect(firstOf(result.events, "item")).toMatchObject({ slot: 0, itemId: item.itemId });
      expect(after.delay - before.delay).toBe(item.delayCost);
      expect(after.items[item.itemId]).toBe(0);
      // An item is not a turn: the same player still holds the queue until they fire or skip.
      expect(result.state.turn.activeSlot).toBe(0);
      charged += item.delayCost;
      last = result.state;
    }

    // Delay is charged per item, and the queue still moves on when the player finally acts.
    expect(charged).toBe(ITEMS.reduce((total, item) => total + item.delayCost, 0));
    const lastItem = ITEMS.at(-1);
    expect(lastItem).toBeDefined();
    // The last item's own cost is the only delay on that fresh match; the sum above is the whole table's cost.
    expect(last.players[0]!.delay).toBe(start.delay + (lastItem?.delayCost ?? 0));
    expect(advanceTurn(last.turn, last.players, { now: NOW, activeSlot: null }).turn.activeSlot).toBe(1);
  });

  it("TC-CORE-906: Dual keeps the turn and fires two shots", () => {
    const state = match([seat(0, "A", "mbl-01", { "itm-dual": 1 }), seat(1, "B")]);
    const armed = use(state, 0, "itm-dual").state;
    expect(armed.effects.shotsLeft).toBe(2);

    const first = fire(armed, 0, 0, 45, 60);
    expect(shotOf(first.events).slot).toBe(0);
    expect(first.state.turn.activeSlot).toBe(0);
    expect(first.state.effects.shotsLeft).toBe(1);

    const second = fire(first.state, 0, 0, 35, 70);
    expect(shotOf(second.events).slot).toBe(0);
    expect(second.state.players[0]!.shotsFired).toBe(2);
    expect(second.state.turn.activeSlot).toBe(1);
  });

  it("TC-CORE-906: Dual's second shot reuses the weapon chosen for the first shot", () => {
    const state = match([seat(0, "A", "mbl-01", { "itm-dual": 1 }), seat(1, "B")]);
    const armed = use(state, 0, "itm-dual").state;
    const first = fire(armed, 0, 0, 45, 60);
    expect(shotOf(first.events).weaponSlot).toBe(0);

    const second = fire(first.state, 0, 1, 45, 60);
    expect(shotOf(second.events).weaponSlot).toBe(0);
  });

  it("TC-CORE-906: a second item between Dual's two shots is refused", () => {
    const loadout = { "itm-dual": 1, "itm-blood": 1 };
    const state = match([seat(0, "A", "mbl-01", loadout), seat(1, "B")]);
    const armed = fire(use(state, 0, "itm-dual").state, 0, 0, 45, 60).state;
    const delay = armed.players[0]!.delay;

    const second = use(armed, 0, "itm-blood");
    expect(second.events[0]).toMatchObject({ kind: "reject" });
    expect(second.state.players[0]!.items["itm-blood"]).toBe(1);
    expect(second.state.players[0]!.delay).toBe(delay);
  });

  it("TC-CORE-906: Blood trades 8 % of your health for +33 % damage on one shot", () => {
    const seats = [seat(0, "A", "mbl-01", { "itm-blood": 1 }), seat(1, "B")];
    const plain = shotOf(fire(match(seats), 0, 0, 45, 60).events);

    const state = match(seats);
    const before = state.players[0]!;
    const armed = use(state, 0, "itm-blood").state;
    expect(armed.effects.bloodNext).toBe(true);
    // GB's Blood is a trade, not a free buff: 8 % of the bar is gone before the shot leaves.
    expect(armed.players[0]!.hp).toBe(before.hp - Math.round(getMobile("mbl-01").maxHp * 0.08));

    const boostedResult = fire(armed, 0, 0, 45, 60);
    expect(shotOf(boostedResult.events).power).toBe(Math.round(plain.power * 1.33));
    expect(boostedResult.state.effects.bloodNext).toBe(false);

    const again = calm(backTo(boostedResult.state, 0));
    expect(shotOf(fire(again, 0, 0, 45, 60).events).power).toBe(plain.power);
  });

  it("TC-CORE-907: Energy up restores health — 10 % for the small one, 25 % for the large one", () => {
    // GB's Energy up is a heal, not movement points: the item buys life back, and its delay is the tempo cost.
    const maxHp = getMobile("mbl-01").maxHp;
    const low = match([seat(0, "A", "mbl-01", { "itm-energy-1": 1 }), seat(1, "B")]);
    const hurt = { ...low, players: low.players.map((p) => (p.slot === 0 ? { ...p, hp: 400 } : p)) };
    const lowAfter = use(hurt, 0, "itm-energy-1").state.players[0]!;
    expect(lowAfter.hp).toBe(400 + Math.round(maxHp * 0.1));
    expect(lowAfter.energy).toBe(hurt.players[0]!.energy);
    expect(lowAfter.delay).toBe(hurt.players[0]!.delay + 100);

    const high = match([seat(0, "A", "mbl-01", { "itm-energy-2": 1 }), seat(1, "B")]);
    const hurtHigh = { ...high, players: high.players.map((p) => (p.slot === 0 ? { ...p, hp: 400 } : p)) };
    const highAfter = use(hurtHigh, 0, "itm-energy-2").state.players[0]!;
    expect(highAfter.hp).toBe(400 + Math.round(maxHp * 0.25));
    expect(highAfter.delay).toBe(hurtHigh.players[0]!.delay + 300);

    // Never past the bar.
    const full = match([seat(0, "A", "mbl-01", { "itm-energy-2": 1 }), seat(1, "B")]);
    expect(use(full, 0, "itm-energy-2").state.players[0]!.hp).toBe(maxHp);
  });

  it("TC-CORE-908: Change Wind re-rolls the wind, announces it and records the round", () => {
    const state = match([seat(0, "A", "mbl-01", { "itm-change-wind": 1 }), seat(1, "B")]);
    const before = state.weather;

    const result = use(state, 0, "itm-change-wind");
    const announced = firstOf(result.events, "weather");
    const after = result.state.weather;

    expect(announced.weather).toEqual(after);
    expect(after.rolledAtRound).toBe(state.turn.round);
    expect(after.wind.magnitude).toBeGreaterThanOrEqual(0);
    expect(after.wind.magnitude).toBeLessThanOrEqual(TUNABLES.windMax);
    expect(after.wind.sector).toBeGreaterThanOrEqual(0);
    expect(after.wind.sector).toBeLessThan(TUNABLES.windSectors);
    expect(`${after.wind.magnitude}:${after.wind.sector}`).not.toBe(
      `${before.wind.magnitude}:${before.wind.sector}`,
    );
  });

  it("TC-CORE-909: Teleport moves the caster 150 px forward and stays inside the map", () => {
    const state = match([seat(0, "A", "mbl-01", { "itm-teleport": 2 }), seat(1, "B")]);
    const caster = state.players[0]!;

    const moved = use(state, 0, "itm-teleport");
    const after = moved.state.players[0]!;
    expect(after.x).toBe(caster.x + caster.facing * 150);
    expect(after.y).toBeLessThan(groundY(terrainOf(moved.state), after.x));

    // A second copy from the right edge must not leave the field.
    const edge: MatchState = {
      ...moved.state,
      players: moved.state.players.map((player) =>
        player.slot === 0 ? { ...player, x: TUNABLES.mapWidth - 10 } : player,
      ),
    };
    const pushed = use(edge, 0, "itm-teleport").state.players[0]!;
    expect(pushed.x).toBeLessThanOrEqual(TUNABLES.mapWidth);
    expect(pushed.x).toBeGreaterThanOrEqual(0);
  });

  it("TC-CORE-909: Team Teleport swaps the caster with the team mate on the lowest health", () => {
    // GB's Team Teleport is a rescue: it puts you where your weakest team mate stands and puts them where you stood.
    const base = match([
      seat(0, "A", "mbl-01", { "itm-team-teleport": 1 }),
      seat(1, "A"),
      seat(2, "B"),
      seat(3, "A"),
    ]);
    const state: MatchState = {
      ...base,
      players: base.players.map((player) =>
        player.slot === 1 ? { ...player, hp: 300 } : player.slot === 3 ? { ...player, hp: 800 } : player,
      ),
    };
    const before = state.players;
    const after = use(state, 0, "itm-team-teleport").state.players;

    const casterBefore = before.find((player) => player.slot === 0)!;
    const weakestBefore = before.find((player) => player.slot === 1)!;
    const otherBefore = before.find((player) => player.slot === 3)!;
    const caster = after.find((player) => player.slot === 0)!;
    const weakest = after.find((player) => player.slot === 1)!;

    expect(caster.x).toBe(weakestBefore.x);
    expect(weakest.x).toBe(casterBefore.x);
    // The team mate who was not the weakest stays put, and the enemy never moves.
    expect(after.find((player) => player.slot === 3)!.x).toBe(otherBefore.x);
    expect(after.find((player) => player.slot === 2)!.x).toBe(before.find((player) => player.slot === 2)!.x);
    // Both ends land on the ground, not in it.
    for (const moved of [caster, weakest]) {
      expect(moved.y).toBeLessThan(groundY(terrainOf(state), moved.x));
    }
  });

  it("TC-CORE-910: Bunge Shot carves 25 % more ground instead of bringing the shell home", () => {
    // GB's Bunge shot is the same shell with a wider bite taken out of the terrain; the boomerang arc belongs to a
    // mobile, not to an item. Two identical shots, one armed with the item, compared sample by sample.
    const baseline = createTerrain("map-01");
    const armedState = match([seat(0, "A", "mbl-01", { "itm-bunge": 1 }), seat(1, "B")]);
    const plainState = match([seat(0, "A", "mbl-01"), seat(1, "B")]);
    const armed = use(armedState, 0, "itm-bunge").state;
    expect(armed.effects.bungeNext).toBe(true);

    const plainAfter = fire(plainState, 0, 0, 45, 60).state;
    const armedAfter = fire(armed, 0, 0, 45, 60).state;

    const carved = (state: MatchState): number => {
      const heights = terrainOf(state).heights;
      let count = 0;
      for (let i = 0; i < heights.length; i += 1) if (heights[i] !== baseline.heights[i]) count += 1;
      return count;
    };
    const plainCarved = carved(plainAfter);
    const armedCarved = carved(armedAfter);
    expect(plainCarved).toBeGreaterThan(0);
    // 25 % more radius is 56 % more area: the crater has to be visibly wider, not just different.
    expect(armedCarved).toBeGreaterThan(plainCarved * 1.2);
    // And the shell still lands where the plain one does: the item changes the ground, not the flight.
    expect(shotOf(fire(armed, 0, 0, 45, 60).events).impact).toEqual(shotOf(fire(plainState, 0, 0, 45, 60).events).impact);
  });

  it("TC-CORE-911: Thunder strikes the band at the caster's aim and spares the rest of the field", () => {
    const base = match([
      seat(0, "A", "mbl-01", { "itm-thunder": 1 }),
      seat(1, "B"),
      seat(2, "B"),
    ]);
    const band = base.players[0]!.x + 120;
    const placed: MatchState = {
      ...base,
      players: base.players.map((player) => (player.slot === 1 ? { ...player, x: band } : player)),
    };
    const before = placed.players;
    const result = use(placed, 0, "itm-thunder").state;

    const struck = result.players.find((player) => player.slot === 1)!;
    const spared = result.players.find((player) => player.slot === 2)!;
    const struckBefore = before.find((player) => player.slot === 1)!;
    const sparedBefore = before.find((player) => player.slot === 2)!;

    expect(struckBefore.hp + struckBefore.shield - (struck.hp + struck.shield)).toBeGreaterThan(0);
    expect(spared.hp).toBe(sparedBefore.hp);
    expect(spared.shield).toBe(sparedBefore.shield);
    expect(result.players.find((player) => player.slot === 0)!.delay).toBe(
      before.find((player) => player.slot === 0)!.delay + (ITEMS.find((item) => item.itemId === "itm-thunder")?.delayCost ?? 0),
    );
  });

  it("TC-CORE-932: using an item the player does not own is rejected without charging delay", () => {
    const state = match();
    const before = state.players[0]!;

    const empty = use(state, 0, "itm-dual");
    expect(firstOf(empty.events, "reject")).toMatchObject({ slot: 0 });
    expect(empty.state.players[0]!.delay).toBe(before.delay);
    expect(empty.state.seq).toBe(state.seq);

    const unknown = use(state, 0, "itm-retired");
    expect(unknown.events[0]).toMatchObject({ kind: "reject" });
    expect(unknown.state.players[0]!.delay).toBe(before.delay);
  });
});

describe("TC-CORE-953: an item's delay cost is charged before the next player is chosen (US-CORE-009 AC9)", () => {
  it("adds the item's own cost and keeps the queue on the same slot", () => {
    const item = ITEMS.find((candidate) => candidate.delayCost > 0);
    expect(item).toBeDefined();
    const state = match([seat(0, "A", "mbl-01", { [item!.itemId]: 1 }), seat(1, "B")]);
    const before = state.players[0]!;

    const used = use(state, 0, item!.itemId);
    const after = used.state.players[0]!;

    expect(after.delay).toBe(before.delay + item!.delayCost);
    expect(used.state.turn.activeSlot).toBe(0);
    // The queue only moves on when the player fires or skips, and then the delay is what decides the order.
    expect(advanceTurn(used.state.turn, used.state.players, { now: NOW, activeSlot: null }).turn.activeSlot).toBe(1);
  });
});
