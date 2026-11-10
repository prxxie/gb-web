import type { Rng, Weather, Wind } from "./types.js";
import { TUNABLES } from "./tuning.js";
import { createRng } from "./rng.js";

/**
 * Weather is the wind, rolled **once per round** (`tunables.md` § 1.3).
 *
 * Two properties matter and are both tested (`TC-CORE-926`): it is constant inside a round — so a player
 * can plan while others act — and it is derived from `seed + round`, so a replay reproduces the same
 * sequence without shipping a weather log.
 */
/**
 * A wind roll: a magnitude on `0…26` and one of two directions.
 *
 * GB's wind is horizontal — east or west — and it re-rolls **every turn**, which is why a player reads the gauge again
 * after each shot. `sector 0` = east, `1` = west.
 */
export function rollWind(rng: Rng): Wind {
  const magnitude = rng.int(0, TUNABLES.windMax);
  const sector = rng.int(0, TUNABLES.windSectors - 1);
  return { magnitude, directionDeg: sector * 180, sector };
}

export function rollWeather(seed: number, round: number): Weather {
  const rng = createRng((seed ^ Math.imul(round + 1, 0x9e3779b1)) >>> 0);
  return { wind: rollWind(rng), rolledAtRound: round };
}

/** Deterministic weather sequence, useful for replays and for the tests. */
export function weatherSequence(seed: number, rounds: number): readonly Weather[] {
  return Array.from({ length: rounds }, (_, index) => rollWeather(seed, index + 1));
}

/**
 * Take an incoming weather only when it belongs to a later round than the one in hand.
 *
 * The wire can deliver a `weather` event after a newer one (a `gust` spike and the round roll are two
 * events in the same turn), so "last one wins" is wrong: the round number is the tie-break, and an equal
 * round means the frame is a duplicate (`US-CORE-015` AC7, `TC-NET-004`).
 */
export function newerWeather(current: Weather, incoming: Weather): Weather {
  return incoming.rolledAtRound > current.rolledAtRound ? incoming : current;
}

/**
 * What the sky is doing, named: the four bands a wind roll can land in.
 *
 * These are **labels over the magnitude the roll already produced**, not a second mechanic — the physics reads `magnitude`
 * and nothing else. That is deliberate: naming the weather costs no ruleset change, no wire field and no replay divergence,
 * and it gives the tray four distinct icons instead of four numbers (`TC-CORE-964`, `TC-MATCH-953`).
 *
 * The bands tile `0…windMax` with no gap and no overlap, and a case pins that: a hole in the table would leave a roll
 * unnamed and a shared edge would make the label depend on evaluation order.
 */
export type WeatherKind = "clear" | "breeze" | "gale" | "storm";

export interface WeatherBand {
  readonly kind: WeatherKind;
  readonly min: number;
  readonly max: number;
}

export const WEATHER_BANDS: readonly WeatherBand[] = [
  { kind: "clear", min: 0, max: 4 },
  { kind: "breeze", min: 5, max: 13 },
  { kind: "gale", min: 14, max: 20 },
  { kind: "storm", min: 21, max: TUNABLES.windMax },
];

/** The band a wind roll falls in. Anything outside the table is clamped to the nearest end, never left unnamed. */
export function weatherKind(wind: Wind): WeatherKind {
  const band = WEATHER_BANDS.find((candidate) => wind.magnitude <= candidate.max);
  return (band ?? WEATHER_BANDS[WEATHER_BANDS.length - 1]!).kind;
}

export function isCalm(weather: Weather): boolean {
  return weather.wind.magnitude === 0;
}

/** Human-readable wind, used by the HUD and by the bot's aim correction. */
export function describeWind(wind: Wind): string {
  if (wind.magnitude === 0) return "calm";
  return `${wind.magnitude} @ ${wind.directionDeg}°`;
}

/** The two directions the dial shows (`TC-MATCH-923`): east or west, the genre's whole wind vocabulary. */
export function sectorLabel(sector: number): string {
  return ((sector % 2) + 2) % 2 === 0 ? "E" : "W";
}
