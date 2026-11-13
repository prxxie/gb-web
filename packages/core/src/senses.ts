/**
 * What one seat can know (`US-BAL-006`).
 *
 * The engine is not blind — it resolves a whole match — but a seat only ever sees one screen of it (`US-BAL-002`).
 * A bot that reads `MatchState` directly therefore reads the future: where a hull it cannot see is standing, what the
 * ground behind the camera looks like, what the wind will do next round. `Senses` is the whole information set a
 * player has, and it is the only thing `botShot` is allowed to read, so a bot cannot use what a player could not see.
 */
import type { MatchState, PlayerState, Turn, Wind } from "./types.js";
import type { CameraWindow } from "./camera.js";
import { isMeasuring, windowOnOneScreen } from "./camera.js";
import { TUNABLES } from "./tuning.js";

/** The seat's own machine, as it knows it. */
export interface MobileView {
  readonly slot: number;
  readonly mobileId: string;
  readonly x: number;
  readonly y: number;
  readonly facing: -1 | 1;
  readonly hp: number;
  readonly shield: number;
  readonly ssCharge: number;
  /** Quantity per item id; a missing key is none held. */
  readonly items: Readonly<Record<string, number>>;
}

/** An opponent this seat has information about — seen now, or remembered from an earlier turn. */
export interface TargetView {
  readonly slot: number;
  readonly x: number;
  readonly y: number;
  /** The **last seen** health, never the live value: damage taken out of sight is not knowledge. */
  readonly hp: number;
  readonly shield: number;
  /** `true` when the hull is not in the window and this reading comes from memory. */
  readonly fromMemory: boolean;
  /** The turn the reading was taken. */
  readonly rememberedTurn: number;
}

/** Everything one seat may use to decide a turn. */
export interface Senses {
  /** The window the seat is drawing: one screen, or the whole map while measuring. */
  readonly window: CameraWindow;
  readonly self: MobileView;
  readonly wind: Wind;
  /** Living opponents this seat has information about (fresh or remembered); empty when it has none. */
  readonly seen: readonly TargetView[];
  /** The turn each opponent's reading was taken — `TC-BAL-139`'s "seen at" column. */
  readonly seenAt: ReadonlyMap<number, number>;
  /** The ground the seat can see; samples outside the window repeat the nearest visible edge. */
  readonly terrain: { readonly step: number; readonly heights: Float64Array; readonly width: number };
  readonly mapId: string;
  /** The turn number, for the seat's own bookkeeping only. */
  readonly turn: number;
  /** The window is opened to the whole map to measure, so no aiming starts now. */
  readonly measuring: boolean;
  /** Where the seat's own last shell came down, if it remembers one. */
  readonly lastImpact: { readonly x: number; readonly turn: number } | null;
}

/** One remembered reading, with the turn it was taken. */
export interface Remembered {
  readonly x: number;
  readonly y: number;
  readonly hp: number;
  readonly shield: number;
  readonly turn: number;
}

/** What a bot carries between turns. One instance per seat; never shared between matches. */
export interface BotMemory {
  /** One remembered position per opponent slot (`US-BAL-006` § 5). */
  readonly positions: Map<number, Remembered>;
  /** Where its own last shell landed — the fallback when no hull has ever been seen. */
  impact: { x: number; turn: number } | null;
}

/**
 * How many of the seat's **own** turns a reading stays usable (`US-BAL-006` § 5: "older than three of the bot's turns").
 *
 * `turn.number` counts every seat's turn, not this one's, so the floor is one round per seat: three of the seat's own
 * turns is `REMEMBERED_TURNS × players` match turns in a duel, and four times that in 2v2.
 */
export const REMEMBERED_TURNS = 3;

/** The match turns a reading may sit unused before the seat no longer knows it. */
function memorySpan(state: MatchState): number {
  return REMEMBERED_TURNS * Math.max(1, state.players.length);
}

export function createBotMemory(): BotMemory {
  return { positions: new Map(), impact: null };
}

/**
 * The window a seat is entitled to: one screen, centred on its own hull (`US-BAL-002`).
 *
 * Sight is horizontal, so the aspect ratio only sets a height nothing is tested against; it is fixed here rather than
 * read from whoever is drawing, because a seat's window must not depend on how someone else panned their camera
 * (`US-BAL-006` AC1, AC5).
 */
export function windowForSeat(state: MatchState, slot: number, aspect: number = 16 / 9): CameraWindow {
  const seat = seatOf(state, slot);
  return windowOnOneScreen(seat.x, aspect, seat.y);
}

/** The seat, or a `RangeError` — a slot that is not in the match has no window and no senses. */
function seatOf(state: MatchState, slot: number): PlayerState {
  const seat = state.players.find((player) => player.slot === slot);
  if (!seat) throw new RangeError(`no seat ${slot} in this match`);
  return seat;
}

/**
 * The window's slice of the ground, in world coordinates.
 *
 * The length stays the whole map so no caller has to translate indices, and every sample past an edge repeats the
 * nearest visible one: the terrain the seat cannot see is flat at what it can, which is exactly a player's guess.
 */
function windowedTerrain(state: MatchState, window: CameraWindow) {
  const heights = Float64Array.from(state.terrain);
  const last = heights.length - 1;
  const clampIndex = (index: number) => Math.min(last, Math.max(0, index));
  // The visible span is the samples strictly inside `[window.x, window.x + window.width]`: rounding either edge
  // would hand the seat a sample from outside its window.
  const leftEdge = clampIndex(Math.ceil(window.x / state.terrainStep));
  const rightEdge = clampIndex(Math.floor((window.x + window.width) / state.terrainStep));
  const left = heights[leftEdge] ?? 0;
  const right = heights[rightEdge] ?? 0;
  for (let index = 0; index < heights.length; index += 1) {
    if (index < leftEdge) heights[index] = left;
    else if (index > rightEdge) heights[index] = right;
  }
  return { step: state.terrainStep, heights, width: TUNABLES.mapWidth };
}

function viewOf(player: PlayerState): MobileView {
  return {
    slot: player.slot,
    mobileId: player.mobileId,
    x: player.x,
    y: player.y,
    facing: player.facing,
    hp: player.hp,
    shield: player.shield,
    ssCharge: player.ssCharge,
    items: player.items,
  };
}

/**
 * Whether the seat can see a hull at `x`.
 *
 * Horizontal only, on purpose: the engine's combat is blast radius, not a hull box, and the screen is a slice in `x`.
 * A shell's arc can be watched high above the ground, so no `y` test would be honest.
 */
function inWindow(window: CameraWindow, x: number): boolean {
  return x >= window.x && x <= window.x + window.width;
}

/** The remembered impact, unless it is older than the seat's memory reaches. */
function impactOf(state: MatchState, memory: BotMemory): BotMemory["impact"] {
  const impact = memory.impact;
  if (!impact || state.turn.number - impact.turn < memorySpan(state)) return impact;
  memory.impact = null;
  return null;
}

/**
 * Read the match through one seat's window, and remember what it saw.
 *
 * `memory` is the seat's own store and is **written** here: seeing a hull refreshes its entry, looking away keeps the
 * old reading for `REMEMBERED_TURNS` turns, and after that the seat no longer knows where the hull is.
 */
export function sensesFor(
  state: MatchState,
  slot: number,
  window: CameraWindow,
  memory: BotMemory,
): Senses {
  const self = seatOf(state, slot);
  const turn: Turn = state.turn;
  const seen: TargetView[] = [];
  const seenAt = new Map<number, number>();

  for (const other of state.players) {
    // `eliminated` is deliberately not read here: whether a hull outside the window is still alive is state the seat
    // cannot see (`AC1`), so a reading stays a reading until it ages out or the hull is seen dead.
    if (other.slot === slot || other.team === self.team) continue;

    let reading: Remembered | undefined;
    if (inWindow(window, other.x)) {
      reading = { x: other.x, y: other.y, hp: other.hp, shield: other.shield, turn: turn.number };
      memory.positions.set(other.slot, reading);
    } else {
      reading = memory.positions.get(other.slot);
      // A reading older than three of the seat's own turns is not a reading any more (§ 5): seen on its turn 1, still
      // known on turns 3 and 5, forgotten on 7.
      if (reading && turn.number - reading.turn >= memorySpan(state)) {
        memory.positions.delete(other.slot);
        reading = undefined;
      }
    }
    if (!reading) continue;
    seen.push({ slot: other.slot, ...reading, fromMemory: reading.turn !== turn.number, rememberedTurn: reading.turn });
    seenAt.set(other.slot, reading.turn);
  }

  return {
    window,
    self: viewOf(self),
    wind: state.weather.wind,
    seen,
    seenAt,
    terrain: windowedTerrain(state, window),
    mapId: state.mapId,
    turn: turn.number,
    measuring: isMeasuring(window),
    lastImpact: impactOf(state, memory),
  };
}
