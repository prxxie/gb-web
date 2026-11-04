import type { Mode, ModeId } from "../types.js";

/**
 * Four modes share one engine and differ only in win condition and scoring
 * (`tunables.md` § 5). `turnCap` is turns per player before the score check.
 */
export const MODES: readonly Mode[] = [
  { modeId: "solo", name: "Solo", turnCap: 0 },
  { modeId: "score", name: "Score", turnCap: 12 },
  { modeId: "tag", name: "Tag", turnCap: 0 },
  { modeId: "jewel", name: "Jewel", turnCap: 0 },
];

export const MODES_BY_ID: ReadonlyMap<ModeId, Mode> = new Map(MODES.map((mode) => [mode.modeId, mode]));

export function getMode(modeId: string): Mode {
  const mode = MODES_BY_ID.get(modeId as ModeId);
  if (!mode) throw new RangeError(`unknown mode: ${modeId}`);
  return mode;
}

export function isModeId(value: string): value is ModeId {
  return MODES_BY_ID.has(value as ModeId);
}
