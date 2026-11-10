/**
 * The polite live region (`US-MATCH-003` AC10, `US-PWA-004` AC5).
 *
 * The canvas is `aria-hidden`, so this text is the only way a screen-reader player learns the state of the battlefield:
 * the last thing that happened, throttled to one update per second by `useLiveAnnouncement`.
 */
import { useLiveAnnouncement } from "../app/useLiveAnnouncement";
import type { MatchEvent, MatchState } from "@gbw/core";
import type { Translator } from "../i18n";

export interface MatchAnnouncementOptions {
  readonly state: MatchState | null;
  readonly feed: readonly MatchEvent[];
  readonly t: Translator;
}

export function useMatchAnnouncement(options: MatchAnnouncementOptions): string {
  const { state, feed, t } = options;
  const activePlayer = state ? state.players.find((player) => player.slot === state.turn.activeSlot) ?? null : null;
  // The polite region carries the last thing that happened, not just whose turn it is: a screen-reader player has to
  // hear the shot land (`US-MATCH-003` AC10). A shot's hits are the engine's own numbers.
  const lastShot = [...feed].reverse().find((event) => event.kind === "shot");
  return useLiveAnnouncement(
    lastShot && lastShot.kind === "shot"
      ? lastShot.hits.length > 0
        ? t("match.announce.hit", {
            name: state?.players.find((player) => player.slot === lastShot.slot)?.displayName ?? "",
            damage: Math.round(lastShot.hits.reduce((total, hit) => total + Number((hit as { damage?: number }).damage ?? 0), 0)),
          })
        : t("match.announce.miss", {
            name: state?.players.find((player) => player.slot === lastShot.slot)?.displayName ?? "",
          })
      : activePlayer
        ? t("match.announce.turn", { name: activePlayer.displayName, hp: activePlayer.hp })
        : "",
  );
}
