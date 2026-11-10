/**
 * The bottom strip of the match HUD (`US-MATCH-005`, `US-MATCH-006`).
 *
 * A three-cell grid: walking on the left, shooting in the middle (the weapon strip and the phrase grid), the table's
 * state on the right. Every control is inside the grid rather than positioned over it, so no later rule can pin an edge
 * and stretch a control across the field.
 */
import { EMOTE_IDS, PHRASE_IDS, getMobile, type ChatId, type ChatKind, type MatchState, type Mobile, type PlayerState } from "@gbw/core";
import { DirectionPad, type PadAction } from "../components/DirectionPad";
import { MatchStats } from "../components/MatchStats";
import { PhrasePicker } from "../components/PhrasePicker";
import { WeaponStrip, type WeaponSlot } from "../components/WeaponStrip";
import { useLocale } from "../app/providers";
import type { AimPoint } from "./wiring";
import type { JSX } from "react";

export interface MatchBottomBarProps {
  readonly state: MatchState;
  readonly localPlayer: PlayerState | null;
  readonly mobile: Mobile;
  readonly isMyTurn: boolean;
  readonly focus: AimPoint | null;
  readonly aimAngle: number;
  readonly weaponSlot: WeaponSlot;
  readonly ssReady: boolean;
  readonly lockedTurn: number | null;
  readonly chatOpen: boolean;
  readonly onAction: (action: PadAction) => void;
  readonly onRepeat: (action: PadAction, times: number) => void;
  readonly onSelectWeapon: (slot: WeaponSlot) => void;
  readonly onSkip: () => void;
  readonly onChat: (kind: ChatKind, id: ChatId) => void;
}

export function MatchBottomBar(props: MatchBottomBarProps): JSX.Element {
  const { t } = useLocale();
  const {
    state,
    localPlayer,
    mobile,
    isMyTurn,
    focus,
    aimAngle,
    weaponSlot,
    ssReady,
    lockedTurn,
    chatOpen,
    onAction,
    onRepeat,
    onSelectWeapon,
    onSkip,
    onChat,
  } = props;
  return (
    <div className="match__bottom">
      <div className="match__zone match__zone--move">
        <DirectionPad
          enabled={isMyTurn}
          focus={focus}
          canMove={Boolean(localPlayer && localPlayer.energy > 0)}
          energy={localPlayer?.energy ?? 0}
          movesLeft={Math.max(0, mobile.maxMovesPerTurn - (state?.effects.movesThisTurn ?? 0))}
          angle={aimAngle}
          angleWindow={{ min: mobile.angleMin, max: mobile.angleMax }}
          labels={{
            up: t("match.angle.up"),
            down: t("match.angle.down"),
            left: t("match.move.left"),
            right: t("match.move.right"),
            steps: t("match.move.steps"),
            energy: t("match.move.energy"),
          }}
          onAction={onAction}
          onRepeat={onRepeat}
        />
      </div>
      <div className="match__zone match__zone--shoot">
        <div className="match__loadout">
          <WeaponStrip
            weapons={mobile.weapons}
            active={weaponSlot}
            charges={[1, 1, ssReady ? 1 : 0]}
            names={[t("match.weapon.1"), t("match.weapon.2"), t("match.weapon.3")]}
            chargeLabels={[
              t("match.weapon.ready"),
              t("match.weapon.ready"),
              ssReady
                ? t("match.weapon.ready")
                : t("match.weapon.charge", { count: Math.min(100, localPlayer?.ssCharge ?? 0), max: 100 }),
            ]}
            label={t("match.weapon.group")}
            disabled={!isMyTurn || lockedTurn === state.turn.number}
            onSelect={onSelectWeapon}
          />
        </div>
        <PhrasePicker
          skipEnabled={isMyTurn}
          phraseIds={PHRASE_IDS}
          emoteIds={EMOTE_IDS}
          labels={{
            skip: t("match.skip"),
            phrases: t("match.phrases.title"),
            emotes: t("match.emotes.title"),
          }}
          phraseText={(id) => t(`match.phrase.${id}`)}
          emoteText={(id) => t(`match.emote.${id}`)}
          open={chatOpen}
          onSkip={onSkip}
          onChat={onChat}
        />
      </div>
      <MatchStats
        seed={state.seed}
        round={state.turn.round}
        rounds={4}
        teams={(["A", "B"] as const).map((team) => {
          const members = state.players.filter((player) => player.team === team);
          return {
            team,
            hp: members.reduce((total, player) => total + (player.eliminated ? 0 : player.hp), 0),
            maxHp: members.reduce((total, player) => total + getMobile(player.mobileId).maxHp, 0),
            alive: members.filter((player) => !player.eliminated).length,
            members: members.length,
          };
        })}
        gold={localPlayer?.damageDealt ?? 0}
        labels={{
          weather: t("match.forecast"),
          gold: t("match.gold"),
          health: t("match.teamHealth"),
          kind: (kind) => t(`match.weather.kind.${kind}`),
        }}
      />
    </div>
  );
}
