/**
 * The roster strip (`US-MATCH-001` AC6, `US-MATCH-003` AC1/AC5/AC8).
 *
 * One cell per seat, in engine order, with the active player ringed, HP plus shield, and the delay the seat still
 * owes — absolute for the player who is shooting, signed relative to them for everyone else, the way GunBound
 * reads it (`AC8`). A mobile that dies keeps its cell and still prints `0`: the strip answers "who is left" at a
 * glance, and a row that reflowed exactly when someone dies would be unreadable.
 */
import type { ChatKind, PlayerState } from "@gbw/core";
import { getMobile } from "@gbw/core";
import type { JSX } from "react";

export interface RosterChat {
  /** The seat that spoke. */
  readonly slot: number;
  readonly kind: ChatKind;
  /** Already translated into this client's locale — only the id crossed the wire. */
  readonly text: string;
}

export interface RosterProps {
  readonly players: readonly PlayerState[];
  readonly activeSlot: number;
  readonly eliminatedLabel: string;
  /** The phrase or emote currently on screen, shown over the speaker's own cell (`US-MATCH-004` AC3, AC6). */
  readonly chat?: RosterChat | null;
}

/**
 * The delay a seat still owes, as the roster prints it (`US-MATCH-003` AC8): the shooting player sees the absolute
 * number, everyone else the signed distance from it — `+120` is four turns of queue behind, `−40` is ahead.
 */
export function delayText(delay: number, activeDelay: number, isActive: boolean): string {
  if (isActive) return `${delay}`;
  const delta = Math.round(delay - activeDelay);
  if (delta === 0) return "0";
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}

export function Roster({ players, activeSlot, eliminatedLabel, chat = null }: RosterProps): JSX.Element {
  const activeDelay = players.find((player) => player.slot === activeSlot)?.delay ?? 0;
  return (
    <div className="match__roster">
      {players.map((player) => (
        <div
          key={player.slot}
          className={`match__player${player.slot === activeSlot ? " match__player--active" : ""}`}
          data-testid={`roster-${player.slot}`}
        >
          <div>{player.displayName}</div>
          <div className="muted">
            {player.eliminated ? `0 ${eliminatedLabel}` : `${player.hp}/${getMobile(player.mobileId).maxHp}`}
            {/* A wreck keeps its last shield value in the state; printing it on a dead hull reads as a bug. */}
            {player.shield > 0 && !player.eliminated ? ` +${player.shield}` : ""}
            <span className="match__delay" data-testid={`delay-${player.slot}`}>
              {" "}
              {delayText(player.delay, activeDelay, player.slot === activeSlot)}
            </span>
          </div>
          {chat?.slot === player.slot ? (
            <div
              className={`match__chat-toast${chat.kind === "emote" ? " match__chat-toast--emote" : ""}`}
              data-testid={`chat-toast-${player.slot}`}
            >
              {chat.text}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
