import { describe, expect, it } from "vitest";
import { createMatch, type Seat } from "../src/match.js";
import { createTerrain } from "../src/terrain.js";
import { REMEMBERED_TURNS, createBotMemory, sensesFor, windowForSeat } from "../src/senses.js";
import { windowMeasuring, windowOnOneScreen } from "../src/camera.js";
import { TUNABLES } from "../src/tuning.js";
import type { MatchState } from "../src/types.js";

const NOW = 1_700_000_000_000;
const CALM = { wind: { magnitude: 0, directionDeg: 0, sector: 0 }, rolledAtRound: 1 } as const;
/** The one-screen window `US-BAL-002` gave every seat: 800 units wide, framed on the seat that owns it. */
const ASPECT = 4 / 3;

function seat(slot: number, team: "A" | "B", mobileId = "mbl-01"): Seat {
  return { slot, team, accountId: `acc-${slot}`, displayName: `P${slot}`, mobileId, loadout: {} };
}

/** Flat ground at y 820, so a hull is visible exactly when its `x` is inside the window. */
function field(botX = 300, targetX = 600): MatchState {
  const base = createMatch({
    matchId: "match-senses",
    roomCode: "ABC234",
    seed: 7,
    mode: "solo",
    mapId: "map-01",
    seats: [seat(0, "A"), seat(1, "B")],
    now: NOW,
  });
  const terrain = createTerrain("map-01");
  terrain.heights.fill(820);
  return {
    ...base,
    terrain: Array.from(terrain.heights),
    weather: CALM,
    players: base.players.map((player) =>
      player.slot === 0 ? { ...player, x: botX, y: 812 } : { ...player, x: targetX, y: 812 },
    ),
  };
}

/** The window the seat owns: one screen, framed on the bot itself (`windowForSeat`). */
function screenOf(botX: number) {
  return windowOnOneScreen(botX, ASPECT, 812);
}

function atTurn(state: MatchState, number: number): MatchState {
  return { ...state, turn: { ...state.turn, number } };
}

function moveTarget(state: MatchState, x: number, patch: Partial<MatchState["players"][number]> = {}): MatchState {
  return {
    ...state,
    players: state.players.map((player) => (player.slot === 1 ? { ...player, x, y: 812, ...patch } : player)),
  };
}

describe("sensesFor (US-BAL-006)", () => {
  it("TC-BAL-139: a seat reads its window and nothing past it", () => {
    const state = atTurn(moveTarget(field(300, 600), 600), 4);
    const senses = sensesFor(state, 0, screenOf(300), createBotMemory());

    // The window is the seat's own, derived from the seat — never from whoever happens to be drawing (`AC1`).
    expect(senses.window).toEqual(windowForSeat(state, 0, ASPECT));
    // The aspect only moves the height, never the horizontal span a sight test uses.
    expect(windowForSeat(state, 0).x).toBe(senses.window.x);
    expect(windowForSeat(state, 0).width).toBe(senses.window.width);
    expect(senses.window.width).toBe(800);
    expect(senses.self.slot).toBe(0);
    expect(senses.self.x).toBe(300);
    expect(senses.wind).toEqual(state.weather.wind);
    expect(senses.turn).toBe(4);
    // The target is inside the window, so it is read fresh — one entry, seen this turn.
    expect(senses.seen).toHaveLength(1);
    expect(senses.seen[0]).toMatchObject({ slot: 1, x: 600, fromMemory: false, rememberedTurn: 4 });
    expect(senses.seenAt.get(1)).toBe(4);
  });

  it("TC-BAL-139: a hull outside the window is not there, and its live numbers never leak", () => {
    const state = atTurn(moveTarget(field(300, 600), 600, { hp: 1_100 }), 1);
    const memory = createBotMemory();
    sensesFor(state, 0, screenOf(300), memory);

    // The target steps out of the window and takes damage: the seat keeps the reading it had.
    const hidden = atTurn(moveTarget(state, 1_300, { hp: 5, shield: 0 }), 2);
    const senses = sensesFor(hidden, 0, screenOf(300), memory);

    expect(senses.seen[0]).toMatchObject({ slot: 1, x: 600, hp: 1_100, fromMemory: true, rememberedTurn: 1 });
    expect(senses.seenAt.get(1)).toBe(1);
  });

  it("TC-BAL-139: the terrain is the window's, extended flat past its edges", () => {
    const state = field(300, 600);
    const window = screenOf(300);
    const carved: MatchState = { ...state, terrain: state.terrain.map((height, index) => (index * state.terrainStep > 900 ? height + 300 : height)) };
    const inside = sensesFor(state, 0, window, createBotMemory());
    const outside = sensesFor(carved, 0, window, createBotMemory());

    // Everything past the window's right edge (x > 800) is replaced by the last sample the seat could see.
    expect(outside.terrain.heights).toEqual(inside.terrain.heights);
    expect(outside.terrain.heights.length).toBe(state.terrain.length);
    expect(outside.terrain.width).toBe(TUNABLES.mapWidth);

    // A carve *inside* the window is visible, so the clip is a clip and not a blindfold over the whole map.
    const carvedInside: MatchState = { ...state, terrain: state.terrain.map((height, index) => (index * state.terrainStep === 400 ? height + 120 : height)) };
    expect(sensesFor(carvedInside, 0, window, createBotMemory()).terrain.heights).not.toEqual(inside.terrain.heights);
  });

  it("TC-BAL-139: the left edge clips the same way the right one does", () => {
    // The bot sits at x 700, so its window starts at 300: everything below that is outside its view.
    const state = field(700, 900);
    const window = screenOf(700);
    expect(window.x).toBe(300);
    const carved: MatchState = {
      ...state,
      terrain: state.terrain.map((height, index) => (index * state.terrainStep < 300 ? height + 300 : height)),
    };

    expect(sensesFor(carved, 0, window, createBotMemory()).terrain.heights).toEqual(
      sensesFor(state, 0, window, createBotMemory()).terrain.heights,
    );

    // A hull behind the left edge is not seen, even though its `x` is inside the map.
    const behind = moveTarget(state, 200);
    expect(sensesFor(behind, 0, window, createBotMemory()).seen).toHaveLength(0);
  });

  it("TC-BAL-143: a window opened to measure is reported, and nothing is aimed at", () => {
    const state = field(300, 600);
    expect(sensesFor(state, 0, screenOf(300), createBotMemory()).measuring).toBe(false);
    expect(sensesFor(state, 0, windowMeasuring(ASPECT), createBotMemory()).measuring).toBe(true);
    // The other half of AC4 — a shell still in the air — is the client's flight lock (`shotWaitMs`), because the
    // engine resolves a shot inside `applyInput` and never leaves a projectile in `state.projectiles`.
  });
});

describe("bot memory (US-BAL-006 § 5)", () => {
  it("TC-BAL-145: a reading lasts three of the seat's own turns, not three match turns", () => {
    const state = atTurn(moveTarget(field(300, 600), 600), 1);
    const memory = createBotMemory();
    const window = screenOf(300);
    sensesFor(state, 0, window, memory);
    expect(memory.positions.size).toBe(1);

    const span = REMEMBERED_TURNS * state.players.length;
    const hidden = (turn: number) => sensesFor(atTurn(moveTarget(state, 1_300), turn), 0, window, memory);

    // Two seats means the bot acts every other turn, so three of its own turns is six match turns.
    expect(span).toBe(6);
    expect(hidden(6).seen.map((target) => target.x)).toEqual([600]);
    expect(hidden(7).seen).toHaveLength(0);
    expect(memory.positions.size).toBe(0);
  });

  it("TC-BAL-145: a remembered impact expires with the same memory", () => {
    const state = atTurn(field(300, 600), 1);
    const memory = createBotMemory();
    const window = screenOf(300);
    memory.impact = { x: 1_250, turn: 1 };

    expect(sensesFor(atTurn(state, 6), 0, window, memory).lastImpact?.x).toBe(1_250);
    expect(sensesFor(atTurn(state, 7), 0, window, memory).lastImpact).toBeNull();
    expect(memory.impact).toBeNull();
  });

  it("TC-BAL-145: seeing the hull again refreshes the entry instead of adding a second one", () => {
    const state = atTurn(moveTarget(field(300, 600), 600), 1);
    const memory = createBotMemory();
    const window = screenOf(300);
    sensesFor(state, 0, window, memory);
    sensesFor(atTurn(moveTarget(state, 1_300), 2), 0, window, memory);
    const again = sensesFor(atTurn(moveTarget(state, 500), 3), 0, window, memory);

    expect(memory.positions.size).toBe(1);
    expect(again.seen[0]).toMatchObject({ x: 500, fromMemory: false, rememberedTurn: 3 });
  });

  it("TC-BAL-145: a seat that is not in the match has no senses", () => {
    expect(() => sensesFor(field(300, 600), 9, screenOf(300), createBotMemory())).toThrow(/seat 9/);
  });
});
