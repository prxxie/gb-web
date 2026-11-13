/**
 * The top strip of the match HUD (`US-MATCH-003`).
 *
 * The weather banner, then one row of three cells: the roster on the left, the wind dead centre, the match controls on
 * the right. The wind used to be absolutely centred over the roster, which put the dial on top of the health chips
 * (owner's report, 2026-11-08). There is no language toggle here: the owner struck it from the match on 2026-11-09.
 */
import type { MatchState } from "@gbw/core";
import { Roster } from "../components/Roster";
import { WeatherBanner } from "../components/WeatherBanner";
import { WindDial } from "../components/WindDial";
import { useLocale } from "../app/providers";
import { chatText } from "../net/chat";
import type { MatchChatMessage } from "./useMatchChat";
import type { JSX } from "react";

export interface MatchTopBarProps {
  readonly state: MatchState;
  readonly chatOpen: boolean;
  /** The phrase on screen, with the seat that said it (`US-MATCH-004` AC3). */
  readonly chat: MatchChatMessage | null;
  readonly clock: number;
  readonly aimAngle: number;
  readonly aimAid: boolean;
  readonly onToggleChat: () => void;
  readonly onToggleAimAid: () => void;
  /** Open the whole map to measure (`US-BAL-002` AC3/AC6). It snaps back on its own, so this is not a toggle. */
  readonly onMeasure: () => void;
}

export function MatchTopBar(props: MatchTopBarProps): JSX.Element {
  const { t } = useLocale();
  const { state, chatOpen, chat, clock, aimAngle, aimAid, onToggleChat, onToggleAimAid, onMeasure } = props;
  return (
    <>
      {/* One banner per wind roll, 1.5 s, dismissed by a tap (`US-MATCH-003` AC10). */}
      <WeatherBanner
        rolledAtRound={state.weather.rolledAtRound}
        text={t("match.weather.changed", {
          magnitude: state.weather.wind.magnitude,
          sector: state.weather.wind.sector,
        })}
      />
      <div className="match__top">
        <div className="match__top-left">
          <Roster
            players={state.players}
            activeSlot={state.turn.activeSlot}
            eliminatedLabel={t("match.eliminated")}
            /* The turn list is also the chat area (`US-MATCH-004` AC3): tapping the corner opens the phrase grid,
               which is what replaced the 💬 button the owner struck from the HUD (2026-11-09). */
            chatOpen={chatOpen}
            chatLabel={t("match.phrases.title")}
            onOpenChat={onToggleChat}
            chat={chat ? { slot: chat.slot, kind: chat.kind, text: chatText(t, chat.kind, chat.id) ?? "" } : null}
          />
        </div>
        <div className="match__wind">
          <WindDial weather={state.weather} label={t("match.wind")} />
        </div>
        <div className="match__top-right">
          {/* The angle is read in the centre of the power ring (`ring-angle`); a second copy up here was noise. */}
          <div className="match__angle" data-testid="angle-value" hidden>
            {Math.round(aimAngle)}°
          </div>
          <div className="match__clock" data-testid="turn-clock">
            {clock}s
          </div>
          <button
            type="button"
            className="match__measure"
            data-testid="measure"
            aria-label={t("match.measure.hint")}
            title={t("match.measure.hint")}
            onClick={onMeasure}
          >
            <span aria-hidden="true">⤢</span>
          </button>
          <button
            type="button"
            className={aimAid ? "match__aid match__aid--on" : "match__aid"}
            data-testid="aim-aid"
            aria-pressed={aimAid}
            aria-label={t("match.aid.hint")}
            title={t("match.aid.hint")}
            onClick={onToggleAimAid}
          >
            <span aria-hidden="true">◎</span>
          </button>
        </div>
      </div>
    </>
  );
}
