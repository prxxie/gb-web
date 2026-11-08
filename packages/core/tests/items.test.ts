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
import { groundY } from "../src/terrain.js";
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

/** Height the shell gained between launch and the top of its arc. */
function apexOf(state: MatchState, path: readonly { readonly y: number }[]): number {
  const launch = state.players[0]!;
  return launch.y - Math.min(...path.map((point) => point.y));
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
    expect(charged).toBe(240);
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

  it("TC-CORE-906: Blood adds 25 % power to one shot and then clears", () => {
    const plain = shotOf(fire(match(), 0, 0, 45, 60).events);

    const state = match([seat(0, "A", "mbl-01", { "itm-blood": 1 }), seat(1, "B")]);
    const armed = use(state, 0, "itm-blood").state;
    expect(armed.effects.bloodNext).toBe(true);

    const boostedResult = fire(armed, 0, 0, 45, 60);
    expect(shotOf(boostedResult.events).power).toBe(Math.round(plain.power * 1.25));
    expect(boostedResult.state.effects.bloodNext).toBe(false);

    const again = calm(backTo(boostedResult.state, 0));
    expect(shotOf(fire(again, 0, 0, 45, 60).events).power).toBe(plain.power);
  });

  it("TC-CORE-906: Power up raises the force cap by 20 for exactly one shot", () => {
    const plainState = calm(match([seat(0, "A", "mbl-07"), seat(1, "B", "mbl-07")]));
    const plain = shotOf(fire(plainState, 0, 0, 80, 200).events);
    const plainApex = apexOf(plainState, plain.path);

    const state = match([seat(0, "A", "mbl-07", { "itm-power-up": 1 }), seat(1, "B", "mbl-07")]);
    const armed = calm(use(state, 0, "itm-power-up").state);
    expect(armed.effects.powerUpNext).toBe(true);

    const boostedResult = fire(armed, 0, 0, 80, 200);
    const boostedApex = apexOf(armed, shotOf(boostedResult.events).path);
    expect(boostedApex).toBeGreaterThan(plainApex);
    expect(boostedResult.state.effects.powerUpNext).toBe(false);

    const again = calm(backTo(boostedResult.state, 0));
    const afterApex = apexOf(again, shotOf(fire(again, 0, 0, 80, 200).events).path);
    expect(afterApex).toBeCloseTo(plainApex, 5);
  });

  it("TC-CORE-907: Energy up 1 adds 30 and Energy up 2 adds 60, charging 5 and 10 delay", () => {
    const low = match([seat(0, "A", "mbl-01", { "itm-energy-1": 1 }), seat(1, "B")]);
    const lowBefore = low.players[0]!;
    const lowAfter = use(low, 0, "itm-energy-1").state.players[0]!;
    expect(lowAfter.energy).toBe(lowBefore.energy + 30);
    expect(lowAfter.delay).toBe(lowBefore.delay + 5);

    const high = match([seat(0, "A", "mbl-01", { "itm-energy-2": 1 }), seat(1, "B")]);
    const highBefore = high.players[0]!;
    const highAfter = use(high, 0, "itm-energy-2").state.players[0]!;
    expect(highAfter.energy).toBe(highBefore.energy + 60);
    expect(highAfter.delay).toBe(highBefore.delay + 10);
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

  it("TC-CORE-909: Team Teleport brings every living team mate within 40 px of the caster", () => {
    const state = match([
      seat(0, "A", "mbl-01", { "itm-team-teleport": 1 }),
      seat(1, "A"),
      seat(2, "B"),
      seat(3, "A"),
    ]);
    const before = state.players;
    const result = use(state, 0, "itm-team-teleport");
    const after = result.state.players;
    const caster = after.find((player) => player.slot === 0)!;

    expect(caster.x).toBe(before.find((player) => player.slot === 0)!.x);
    for (const slot of [1, 3]) {
      const mate = after.find((player) => player.slot === slot)!;
      expect(Math.abs(mate.x - caster.x)).toBeLessThanOrEqual(40);
      expect(mate.y).toBeLessThan(groundY(terrainOf(result.state), mate.x));
    }
    expect(after.find((player) => player.slot === 2)!.x).toBe(
      before.find((player) => player.slot === 2)!.x,
    );
  });

  it("TC-CORE-910: Bunge returns the shell to the caster", () => {
    // TODO(next stage): Bunge becomes GunBound's Bunge Shot (+25 % terrain carved) instead of bringing the
    // shell home — this test then needs rewriting for that behaviour. Today it still pins the come-home rule.
    const field = match([seat(0, "A", "mbl-01", { "itm-bunge": 1 }), seat(1, "B")]);
    // The property is the shell's return, not the weather: with no mass dividing it the rolled wind
    // out-pushes gravity and blows the shell off the map, so the field is pinned to calm.
    const state: MatchState = { ...field, weather: { ...field.weather, wind: { magnitude: 0, directionDeg: 0, sector: 0 } } };
    const caster = state.players[0]!;
    const armed = use(state, 0, "itm-bunge").state;
    expect(armed.effects.bungeNext).toBe(true);

    // 45° / force 40 is a shot that flies ~615 units un-bunge'd; with the item the shell turns at 350 ms and
    // detonates on its own muzzle. At the old force 98 it out-runs the bunge pull and leaves the map instead.
    const shot = shotOf(fire(armed, 0, 0, 45, 40).events);
    expect(shot.impact).not.toBeNull();
    const landing = shot.impact ?? shot.path.at(-1);
    expect(landing).toBeDefined();
    expect(Math.abs((landing?.x ?? 0) - caster.x)).toBeLessThanOrEqual(200);
    expect((landing?.y ?? 0) - caster.y).toBeCloseTo(0, -2);
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
      before.find((player) => player.slot === 0)!.delay + 35,
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
