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
export function rollWind(rng: Rng): Wind {
  const magnitude = rng.int(0, TUNABLES.windMax);
  const sector = rng.int(0, TUNABLES.windSectors - 1);
  return { magnitude, directionDeg: sector * 30, sector };
}

export function rollWeather(seed: number, round: number): Weather {
  const rng = createRng((seed ^ Math.imul(round + 1, 0x9e3779b1)) >>> 0);
  return { wind: rollWind(rng), rolledAtRound: round };
}

/** Deterministic weather sequence, useful for replays and for the tests. */
export function weatherSequence(seed: number, rounds: number): readonly Weather[] {
  return Array.from({ length: rounds }, (_, index) => rollWeather(seed, index + 1));
}

export function isCalm(weather: Weather): boolean {
  return weather.wind.magnitude === 0;
}

/** Human-readable wind, used by the HUD and by the bot's aim correction. */
export function describeWind(wind: Wind): string {
  if (wind.magnitude === 0) return "calm";
  return `${wind.magnitude} @ ${wind.directionDeg}°`;
}

/** The 12 sectors, clockwise from east, for the dial (`TC-MATCH-923`). */
export function sectorLabel(sector: number): string {
  const labels = ["E", "ENE", "NNE", "N", "NNW", "WNW", "W", "WSW", "SSW", "S", "SSE", "ESE"];
  return labels[((sector % 12) + 12) % 12] ?? "E";
}
