/**
 * The roster strip (`US-MATCH-001` AC6).
 *
 * One cell per seat, in engine order, with the active player ringed. A mobile that dies keeps its cell: the
 * strip answers "who is left" at a glance, so removing a dead seat would reflow the row exactly when the
 * player is reading it. The canvas fades the wreck; the strip says so in words.
 */
import type { PlayerState } from "@gbw/core";
import { getMobile } from "@gbw/core";
import type { JSX } from "react";

export interface RosterProps {
  readonly players: readonly PlayerState[];
  readonly activeSlot: number;
  readonly eliminatedLabel: string;
}

export function Roster({ players, activeSlot, eliminatedLabel }: RosterProps): JSX.Element {
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
            {player.eliminated ? eliminatedLabel : `${player.hp}/${getMobile(player.mobileId).maxHp}`}
            {player.shield > 0 ? ` +${player.shield}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}
