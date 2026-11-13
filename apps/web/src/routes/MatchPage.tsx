/**
 * The match screen (`US-MATCH-001` … `US-MATCH-007`).
 *
 * The page composes the match; it does not own it (`US-MATCH-008`). `useMatchPlan` reads the plan, `useMatchEngine`
 * creates the state and is its only writer, `useBattleMount`/`useBattleSync` bridge that state to the renderer,
 * `useBotOpponent`/`useTurnClock` drive the turns, `useNetplay` joins the room, and the HUD hooks plus the panels below
 * render all of it. All rules live in `@gbw/core`; no hook here decides one.
 *
 * The order of the hook calls below is part of the contract: the renderer is mounted before anything is pushed into it,
 * and the turn tick runs after the bot so a bot match advances one step at a time.
 */
import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { TUNABLES, createTerrain, getMobile, formatParts } from "@gbw/core";
import { useLocale } from "../app/providers";
import { MatchAimOverlays } from "../match/MatchAimOverlays";
import { MatchBottomBar } from "../match/MatchBottomBar";
import { MatchNotices } from "../match/MatchNotices";
import { MatchTopBar } from "../match/MatchTopBar";
import { useAimHud } from "../match/useAimHud";
import { useBattleMount } from "../match/useBattleMount";
import { useBattleSync } from "../match/useBattleSync";
import { useBotOpponent } from "../match/useBotOpponent";
import { useHosting } from "../match/useHosting";
import { useMatchAnnouncement } from "../match/useMatchAnnouncement";
import { useMatchChat } from "../match/useMatchChat";
import { useMatchEngine } from "../match/useMatchEngine";
import { useMatchInputs } from "../match/useMatchInputs";
import { useMatchItems } from "../match/useMatchItems";
import { useMatchPlan } from "../match/useMatchPlan";
import { useMatchRecorder } from "../match/useMatchRecorder";
import { useMatchWiring, type MatchStatus } from "../match/wiring";
import { useNetplay } from "../match/useNetplay";
import { useSnapshotWatchdog } from "../match/useSnapshotWatchdog";
import { useTurnClock } from "../match/useTurnClock";
import { useWeaponSelect } from "../match/useWeaponSelect";
import type { JSX } from "react";

export type { PlannedMatch } from "../lib/plan";

export function MatchPage(): JSX.Element {
  const { code = "" } = useParams<{ code: string }>();
  const { t } = useLocale();

  const plan = useMatchPlan(code);
  const wiring = useMatchWiring(plan);
  const [status, setStatus] = useState<MatchStatus>("connecting");
  const [banner, setBanner] = useState<string | null>(null);
  const recorder = useMatchRecorder({ plan, setStatus, wiring });
  const engine = useMatchEngine({ plan, finish: recorder.finish, setStatus, wiring });
  const state = engine.state;
  const hosting = useHosting(plan);
  const container = useRef<HTMLDivElement | null>(null);

  /** The seat this client drives; `null` until the engine exists. */
  const localPlayer = state?.players.find((player) => player.slot === plan?.localSlot) ?? null;
  const mobile = getMobile(localPlayer?.mobileId ?? "mbl-01");
  const isMyTurn = Boolean(state && localPlayer && state.turn.activeSlot === localPlayer.slot && state.status === "playing");

  /** A tapped field point to measure against, in world units (`US-BAL-001` AC3). */
  const [probe, setProbe] = useState<{ x: number; y: number } | null>(null);
  /** The width the field is showing, in world units: one screen, or the whole map while measuring (`US-BAL-002`). */
  const [fieldWidth, setFieldWidth] = useState<number | null>(null);
  const [fieldX, setFieldX] = useState<number | null>(null);
  const aimHud = useAimHud(plan, state);
  const weapons = useWeaponSelect({ ssCharge: localPlayer?.ssCharge ?? 0, battle: wiring.battle });
  const chat = useMatchChat({ plan, wiring });
  const items = useMatchItems({ plan, localPlayer, commit: engine.commit, wiring });
  const inputs = useMatchInputs({
    plan,
    mobile,
    commit: engine.commit,
    hosting: hosting.hosting,
    wiring,
    setAimDelta: aimHud.setAimDelta,
  });

  useBattleMount({
    container,
    plan,
    state,
    commit: engine.commit,
    mobile,
    wiring,
    aim: aimHud,
    weapons,
    hostingRef: hosting.hostingRef,
    onMeasureRefused: () => setBanner(t("match.measure.refused")),
    onProbe: setProbe,
    onCamera: (next) => {
      setFieldWidth(Math.round(next.width));
      setFieldX(Math.round(next.x));
    },
  });
  useBattleSync({
    wiring,
    state,
    localSlot: plan?.localSlot ?? 0,
    pendingEvents: engine.pendingEvents,
    aimDelta: aimHud.aimDelta,
    aimDeltaRef: aimHud.aimDeltaRef,
    aimAid: aimHud.aimAid,
    lockedTurn: weapons.lockedTurn,
    cinematic: engine.cinematic,
  });
  useBotOpponent({ plan, state, commit: engine.commit, wiring, lockedUntil: engine.lockedUntil });
  const clock = useTurnClock({ plan, state, hosting: hosting.hosting, commit: engine.commit, wiring });
  useNetplay({
    plan,
    mobileId: localPlayer?.mobileId ?? "mbl-01",
    setHosting: hosting.setHosting,
    commit: engine.commit,
    wiring,
    setChat: chat.setChat,
    setBanner,
    onRecorded: recorder.onRecorded,
    t,
  });
  useSnapshotWatchdog({ plan, hosting: hosting.hosting, wiring, setBanner, t });
  const announcement = useMatchAnnouncement({ state, feed: engine.feed, t });

  if (!plan || !state) {
    return (
      <div className="screen screen--center">
        <p>{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div
      className="match"
      data-testid="match-screen"
      data-cinematic={engine.cinematic ? "true" : "false"}
      data-field-width={fieldWidth ?? ""}
      data-field-x={fieldX ?? ""}
    >
      <div className="sr-only" role="status" aria-live="polite" data-testid="match-announce">
        {announcement}
      </div>
      <div className="match__canvas" ref={container} aria-hidden="true" />
      <div className="match__hud">
        <MatchTopBar
          state={state}
          chatOpen={chat.open}
          chat={chat.chat}
          clock={clock}
          aimAngle={aimHud.aimAngle}
          aimAid={aimHud.aimAid}
          onToggleChat={chat.toggleOpen}
          onToggleAimAid={aimHud.toggleAimAid}
          onMeasure={() => wiring.battle.current?.setMeasuring(true)}
        />

        <MatchAimOverlays
          items={items.equipped}
          itemsEnabled={isMyTurn}
          wheelAt={aimHud.itemWheelAt}
          onUseItem={items.useItem}
          onCloseWheel={aimHud.closeItemWheel}
          focus={aimHud.focus}
          aimAngle={aimHud.aimAngle}
          power={aimHud.power}
        />

        {/* The bar is a three-cell grid: walking · shooting · the table's state. */}
        <MatchBottomBar
          state={state}
          localPlayer={localPlayer}
          mobile={mobile}
          isMyTurn={isMyTurn}
          focus={aimHud.focus}
          aimAngle={aimHud.aimAngle}
          weaponSlot={weapons.weaponSlot}
          ssReady={weapons.ssReady}
          lockedTurn={weapons.lockedTurn}
          chatOpen={chat.open}
          onAction={inputs.onPad}
          onRepeat={inputs.onRepeat}
          onSelectWeapon={weapons.select}
          onSkip={inputs.onSkip}
          onChat={chat.send}
        />

        {probe && localPlayer ? (
          // The distance and the height difference in parts of a screen: the unit the game is spoken in (`US-BAL-001`).
          <div className="match__probe" data-testid="probe" role="note">
            {t("match.probe", {
              dx: formatParts(Math.abs(probe.x - localPlayer.x)),
              dy: formatParts(probe.y - localPlayer.y),
            })}
          </div>
        ) : null}

        <MatchNotices status={status} banner={banner} hint={aimHud.hint} />
      </div>
    </div>
  );
}

export { createTerrain, TUNABLES };
