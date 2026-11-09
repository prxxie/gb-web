/**
 * The turn-order list (`US-MATCH-001` AC6, `US-MATCH-003` AC1/AC5/AC8).
 *
 * One **row per seat, plain text, sorted by the delay each seat still owes**: whoever shoots next is the first row, the
 * rest follow in the order the queue will reach them (owner's call, 2026-11-09). The whole list sits in one translucent
 * grey panel instead of a row of chips — a box per player turned the corner into a stack of frames, and the only thing
 * that has to stand out is the row that is shooting.
 *
 * The delay is still printed the way GunBound reads it (`AC8`): absolute for the player who is shooting, signed relative
 * to them for everyone else. A wreck keeps its row and prints `0`, because "who is left" must not reflow the list.
 */
import type { ChatKind, PlayerState } from "@gbw/core";
import { getMobile } from "@gbw/core";
import type { JSX, KeyboardEvent } from "react";

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
  /** Set when the panel doubles as the chat area: the owner removed the 💬 button from the HUD (2026-11-09). */
  readonly onOpenChat?: (() => void) | undefined;
  readonly chatOpen?: boolean;
  readonly chatLabel?: string;
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

/**
 * The shooting seat first, then everyone by the delay they still owe — the queue order, not the seat order. A tie keeps
 * the engine's slot order so the list never jitters between two seats that owe the same delay.
 */
export function turnOrder(players: readonly PlayerState[], activeSlot: number): readonly PlayerState[] {
  return [...players].sort((left, right) => {
    if (left.slot === activeSlot) return -1;
    if (right.slot === activeSlot) return 1;
    if (left.delay !== right.delay) return left.delay - right.delay;
    return left.slot - right.slot;
  });
}

export function Roster({
  players,
  activeSlot,
  eliminatedLabel,
  chat = null,
  onOpenChat,
  chatOpen = false,
  chatLabel,
}: RosterProps): JSX.Element {
  const activeDelay = players.find((player) => player.slot === activeSlot)?.delay ?? 0;
  const opens = onOpenChat
    ? {
        "data-testid": "chat-toggle",
        role: "button" as const,
        tabIndex: 0,
        "aria-expanded": chatOpen,
        "aria-label": chatLabel,
        title: chatLabel,
        onClick: onOpenChat,
        onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key === "Enter" || event.key === " ") onOpenChat();
        },
      }
    : {};
  return (
    <div className="match__roster" {...opens}>
      {turnOrder(players, activeSlot).map((player) => (
        <div
          key={player.slot}
          className={`match__player${player.slot === activeSlot ? " match__player--active" : ""}`}
          data-testid={`roster-${player.slot}`}
        >
          <span className="match__player-name">{player.displayName}</span>
          <span className="match__player-hp">
            {player.eliminated ? `0 ${eliminatedLabel}` : `${player.hp}/${getMobile(player.mobileId).maxHp}`}
            {/* A wreck keeps its last shield value in the state; printing it on a dead hull reads as a bug. */}
            {player.shield > 0 && !player.eliminated ? ` +${player.shield}` : ""}
          </span>
          <span className="match__delay" data-testid={`delay-${player.slot}`}>
            {delayText(player.delay, activeDelay, player.slot === activeSlot)}
          </span>
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
