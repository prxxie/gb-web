/**
 * How a match was won (`US-CORE-010` AC6).
 *
 * The engine ends a match through `conclusionOf` (`packages/core/src/match.ts:260`) but records only
 * `winnerTeam`, not which rule fired. The result screen has to name both the mode and the condition,
 * so the condition is read back from the finished state with the same rules the engine used: a wipe
 * ends any mode, the score cap decides a score match nobody won by elimination, and a jewel match
 * ends only when one team holds every jewel.
 */
import type { Translator } from "../i18n";

export type WinCondition = "elimination" | "score-cap" | "all-jewels" | "abandon";

/** The slice of `MatchState` this module reads, so a test does not have to build a whole match. */
export interface OutcomeInput {
  readonly mode: string;
  readonly players: readonly { readonly team: "A" | "B"; readonly eliminated: boolean }[];
}

const MODE_KEYS = ["solo", "score", "tag", "jewel"] as const;

function teamWiped(state: OutcomeInput, team: "A" | "B"): boolean {
  const members = state.players.filter((player) => player.team === team);
  return members.length > 0 && members.every((player) => player.eliminated);
}

/** Which condition ended the match. */
export function winConditionOf(state: OutcomeInput): WinCondition {
  if (teamWiped(state, "A") || teamWiped(state, "B")) return "elimination";
  if (state.mode === "score") return "score-cap";
  if (state.mode === "jewel") return "all-jewels";
  // `solo` and `tag` end only by a wipe; anything else reaching here left early.
  return "abandon";
}

/** The line the result screen prints: the mode name and the condition, in the player's language. */
export function outcomeText(t: Translator, mode: string, condition: WinCondition | null): string {
  const known = (MODE_KEYS as readonly string[]).includes(mode) ? mode : "unknown";
  const reason = condition ?? "abandon";
  return t("results.outcome", {
    mode: t(`results.mode.${known}`),
    condition: t(`results.condition.${reason}`),
  });
}
