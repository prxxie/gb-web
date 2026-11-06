/**
 * The match screen (`US-MATCH-001` … `US-MATCH-007`).
 *
 * The page owns the loop: it mounts the renderer, feeds it state, turns gestures into inputs and —
 * when this client is the host — broadcasts snapshots. All rules live in `@gbw/core`; this file only
 * decides *when* to call them.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  TUNABLES,
  applyInput,
  botTurn,
  createMatch,
  createRng,
  createTerrain,
  getMobile,
  isItemId,
  ITEMS_BY_ID,
  toSnapshot,
  type FireInput,
  type MatchEvent,
  type MatchState,
  type Seat,
} from "@gbw/core";
import { mountBattle, type BattleHandle } from "../game/scene";
import { DirectionPad, type PadAction } from "../components/DirectionPad";
import { PhrasePicker, type ChatKind } from "../components/PhrasePicker";
import { Ruler } from "../components/Ruler";
import { ItemTray } from "../components/ItemTray";
import { WeaponStrip, type WeaponSlot } from "../components/WeaponStrip";
import { WindDial } from "../components/WindDial";
import { defaultWindow, type CameraWindow } from "@gbw/core";
import { useLocale } from "../app/providers";
import { useLiveAnnouncement } from "../app/useLiveAnnouncement";
import { translate, type Locale } from "../i18n";
import { createMesh, type Mesh } from "../net/mesh";
import { decideTurn } from "../net/host-clock";
import { resyncFromSnapshot } from "../net/resync";
import { itemFrame } from "../net/frames";
import { connectWithReconnect, type ReconnectingSocket } from "../net/reconnect";
import type { ServerMessage } from "../net/signaling";
import { api } from "../lib/api";
import { currentSession } from "../lib/session";
import type { JSX } from "react";

export interface PlannedMatch {
  readonly kind: "bot" | "online";
  readonly roomCode: string;
  readonly localSlot: number;
  readonly playerId: string;
  readonly seats: readonly Seat[];
  readonly seed: number;
  readonly mapId: string;
  readonly mode: "solo" | "score" | "tag" | "jewel";
  readonly maxPlayers: number;
  readonly hostPlayerId: string;
}

const PLAN_KEY = "gbw.match";
const RESULT_KEY = "gbw.result";

/** The fixed phrase and emote ids of `US-MATCH-004`; only their copy lives in the locale tables. */
const PHRASE_IDS = ["phrase-01", "phrase-02", "phrase-03", "phrase-04", "phrase-05", "phrase-06", "phrase-07", "phrase-08", "phrase-09", "phrase-10", "phrase-11", "phrase-12"] as const;
const EMOTE_IDS = ["emote-01", "emote-02", "emote-03", "emote-04", "emote-05", "emote-06", "emote-07", "emote-08"] as const;

function readPlan(): PlannedMatch | null {
  try {
    const raw = sessionStorage.getItem(PLAN_KEY);
    return raw ? (JSON.parse(raw) as PlannedMatch) : null;
  } catch {
    return null;
  }
}

function botSeats(local: Seat): readonly Seat[] {
  return [local, { slot: 1, team: "B", accountId: null, displayName: "Bot", mobileId: "mbl-04" }];
}

export function MatchPage(): JSX.Element {
  const { code = "" } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { t, locale } = useLocale();
  const plan = useMemo<PlannedMatch | null>(() => {
    const stored = readPlan();
    if (stored && stored.roomCode === code) return stored;
    const session = currentSession();
    if (!session) return null;
    return {
      kind: "bot",
      roomCode: code,
      localSlot: 0,
      playerId: `local-${session.subject.guestId ?? session.subject.accountId ?? "guest"}`,
      seats: botSeats({
        slot: 0,
        team: "A",
        accountId: session.subject.accountId ?? null,
        displayName: session.subject.displayName,
        mobileId: "mbl-01",
      }),
      seed: Math.floor(Math.random() * 0xffffff),
      mapId: "map-01",
      mode: "solo",
      maxPlayers: 2,
      hostPlayerId: "local",
    };
  }, [code]);

  const [state, setState] = useState<MatchState | null>(null);
  const [feed, setFeed] = useState<readonly MatchEvent[]>([]);
  const [power, setPower] = useState(0);
  const [, setAngle] = useState(45);
  const [aimDelta, setAimDelta] = useState(0);
  const [camera, setCamera] = useState<CameraWindow>(() => defaultWindow(16 / 9));
  const [status, setStatus] = useState<"connecting" | "live" | "reconnecting" | "ended">("connecting");
  const [banner, setBanner] = useState<string | null>(null);
  // The aim selection is local state but the renderer callback is created once, so the ref is what
  // the shot reads; the state only drives the strip's `aria-pressed` (`US-MATCH-005` AC2).
  const [weaponSlot, setWeaponSlot] = useState<WeaponSlot>(0);
  const weaponSlotRef = useRef<WeaponSlot>(0);
  // Turn number the weapon was fired in: the selection is locked until the turn changes (AC3).
  const [lockedTurn, setLockedTurn] = useState<number | null>(null);
  const [chat, setChat] = useState<{ readonly kind: ChatKind; readonly id: string } | null>(null);
  const container = useRef<HTMLDivElement | null>(null);
  const battle = useRef<BattleHandle | null>(null);
  const mesh = useRef<Mesh | null>(null);
  const socket = useRef<ReconnectingSocket | null>(null);
  const seq = useRef(1);
  const stateRef = useRef<MatchState | null>(null);
  const ended = useRef(false);
  // Slots the room reports as `grace` or `disconnected`, and the newest host election seen: the first
  // decides who gets skipped, the second which snapshots are still valid (`US-ROOM-004` AC3/AC5/AC7).
  const absent = useRef<readonly number[]>([]);
  const hostGeneration = useRef(0);

  stateRef.current = state;

  const localPlayer = state?.players.find((player) => player.slot === plan?.localSlot) ?? null;
  const isMyTurn = Boolean(state && localPlayer && state.turn.activeSlot === localPlayer.slot && state.status === "playing");
  const mobile = getMobile(localPlayer?.mobileId ?? "mbl-01");

  const finish = useCallback(
    (final: MatchState) => {
      if (ended.current) return;
      ended.current = true;
      const payload = {
        roomCode: final.roomCode,
        mode: final.mode,
        winnerTeam: final.winnerTeam,
        startedAt: final.startedAt,
        endedAt: Date.now(),
        rulesetVersion: final.rulesetVersion,
        players: final.players.map((player) => ({
          slot: player.slot,
          accountId: player.accountId,
          displayName: player.displayName,
          team: player.team,
          damageDealt: player.damageDealt,
          shotsFired: player.shotsFired,
          hits: player.hits,
          result: final.winnerTeam === null ? "abandon" : final.winnerTeam === player.team ? "win" : "loss",
        })),
      };
      sessionStorage.setItem(RESULT_KEY, JSON.stringify(payload));
      setStatus("ended");
      navigate(`/results/${final.roomCode}`, { replace: true });
    },
    [navigate],
  );

  const commit = useCallback(
    (next: MatchState, events: readonly MatchEvent[] = []) => {
      stateRef.current = next;
      setState(next);
      if (events.length > 0) setFeed((previous) => [...previous, ...events].slice(-6));
      if (next.status === "ended") finish(next);
    },
    [finish],
  );

  // Create the match once, then mount the renderer.
  useEffect(() => {
    if (!plan) return;
    const match = createMatch({
      matchId: `m-${plan.seed}`,
      roomCode: plan.roomCode,
      seed: plan.seed,
      mode: plan.mode,
      mapId: plan.mapId,
      seats: plan.seats,
      now: Date.now(),
    });
    setState(match);
    setStatus("live");
  }, [plan]);

  useEffect(() => {
    if (!container.current || !state || !plan) return;
    battle.current = mountBattle({
      parent: container.current,
      state,
      localSlot: plan.localSlot,
      callbacks: {
        onPull: (value, nextAngle) => {
          setPower(value);
          setAngle(nextAngle);
        },
        onRelease: (value, nextAngle) => {
          const current = stateRef.current;
          if (!current || !plan) return;
          const input: FireInput = {
            kind: "fire",
            slot: plan.localSlot,
            weaponSlot: weaponSlotRef.current,
            angle: clampAngle(nextAngle + aimDelta, mobile),
            force: Math.round(value * 25),
            seq: seq.current++,
          };
          const result = applyInput(current, input, Date.now());
          commit(result.state, result.events);
          setLockedTurn(current.turn.number);
          // A shot that carved the mask is the only moment the peers need the terrain itself: they resolve
          // hits against it (`US-CORE-006` AC4), and the mask is far too big to ride in every snapshot.
          const carved = result.events.some((event) => event.kind === "shot" && event.carved);
          const snapshot = toSnapshot(result.state, hostGeneration.current, { includeTerrain: carved });
          mesh.current?.broadcast(snapshot);
          socket.current?.send({ t: "snapshot_push", snapshot });
          setPower(0);
        },
        onCancel: () => setPower(0),
        onCamera: (window) => setCamera(window),
      },
    });
    return () => {
      battle.current?.destroy();
      battle.current = null;
      // The mounted scene keeps its own copy of the state; the page pushes updates below.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(state), plan?.localSlot, commit]);

  useEffect(() => {
    if (battle.current && state) battle.current.setState(state, plan?.localSlot ?? 0);
  }, [state, plan?.localSlot]);

  // Bot opponent: think for a moment, then shoot.
  useEffect(() => {
    if (!plan || plan.kind !== "bot" || !state || state.status !== "playing") return;
    // A guest seat also has `accountId: null`, so the opponent is identified by its slot, never by identity.
    const bot = state.players.find((player) => player.slot !== plan.localSlot);
    if (!bot || bot.eliminated || state.turn.activeSlot !== bot.slot) return;
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (!current) return;
      const rng = createRng(current.seed + current.turn.number * 7919);
      const input = botTurn(current, rng);
      if (!input) return;
      const result = applyInput(current, { ...input, seq: seq.current++ }, Date.now());
      commit(result.state, result.events);
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [state, plan, commit]);

  // Turn clock: the host is the clock, and an absent player's turn is skipped rather than waited out
  // (`US-ROOM-004` AC3, AC7). `decideTurn` owns the rules; this effect only applies the answer.
  const hosting = !plan || plan.kind === "bot" || plan.hostPlayerId === plan.playerId;
  useEffect(() => {
    if (!state || state.status !== "playing") return;
    const tick = window.setInterval(() => {
      const current = stateRef.current;
      if (!current || current.status !== "playing" || !plan) return;
      const decision = decideTurn({
        isHost: hosting,
        localSlot: plan.localSlot,
        activeSlot: current.turn.activeSlot,
        deadlineAt: current.turn.deadlineAt,
        absentSlots: absent.current,
        now: Date.now(),
      });
      if (decision.kind === "wait") return;
      const result = applyInput(current, { kind: "skip", slot: current.turn.activeSlot, seq: seq.current++ }, Date.now());
      commit(result.state, result.events);
      // A skip this client decided is the host's word: the peers resync from the snapshot, which carries
      // the new `deadlineAt`, so their clocks do not drift from the turn (`US-ROOM-004` § 5).
      if (hosting && plan.kind === "online") {
        const snapshot = toSnapshot(result.state, hostGeneration.current);
        mesh.current?.broadcast(snapshot);
        socket.current?.send({ t: "snapshot_push", snapshot });
      }
    }, 500);
    return () => window.clearInterval(tick);
  }, [state, plan, hosting, commit]);

  // Online: join the room socket and the peer mesh.
  useEffect(() => {
    if (!plan || plan.kind !== "online") return;
    const session = currentSession();
    if (!session) return;
    let cancelled = false;
    const base = window.location.origin.replace(/^http/, "ws");

    void api.turnCredentials(session.token).then((credentials) => {
      if (cancelled) return;
      mesh.current = createMesh({
        selfPlayerId: plan.playerId,
        isHost: plan.hostPlayerId === plan.playerId,
        iceServers: credentials.iceServers.map((server) => ({
          urls: Array.isArray(server.urls) ? server.urls : [server.urls],
          ...(server.username ? { username: server.username } : {}),
          ...(server.credential ? { credential: server.credential } : {}),
        })),
        send: (channel) =>
          socket.current?.send({
            t: "signal",
            to: channel.to,
            payload:
              channel.kind === "candidate"
                ? { kind: "candidate", candidate: channel.payload }
                : { kind: channel.kind, sdp: (channel.payload as RTCSessionDescriptionInit).sdp ?? "" },
          }),
        onSnapshot: (snapshot) => {
          const current = stateRef.current;
          if (!current) return;
          const synced = resyncFromSnapshot(current, snapshot, hostGeneration.current);
          hostGeneration.current = synced.hostGeneration;
          if (synced.applied) commit(synced.state, []);
        },
        onControl: (from, message) => {
          const current = stateRef.current;
          if (!current) return;
          const input = message as { kind?: string };
          if (!input || typeof input.kind !== "string") return;
          void from;
          const result = applyInput(current, message as Parameters<typeof applyInput>[1], Date.now());
          commit(result.state, result.events);
        },
        onPeerState: (playerId, connectionState) => {
          if (connectionState === "failed" || connectionState === "disconnected") {
            setBanner(`${playerId}: ${connectionState}`);
          }
        },
      });
    });

    socket.current = connectWithReconnect({
      wsUrl: `${base}/api/v1/rooms/${plan.roomCode}/ws`,
      token: session.token,
      displayName: session.subject.displayName,
      mobileId: localPlayer?.mobileId ?? "mbl-01",
      onMessage: (message: ServerMessage) => {
        if (message.t === "signal") {
          const signal = message.payload;
          void mesh.current?.applySignal(
            message.from,
            signal.kind,
            signal.kind === "candidate" ? signal.candidate : { type: signal.kind, sdp: signal.sdp },
          );
          return;
        }
        if (message.t === "host_changed") {
          setBanner(t("match.hostChanged"));
          return;
        }
        if (message.t === "peer_joined") {
          void mesh.current?.addPeer(message.playerId);
          return;
        }
        if (message.t === "snapshot_state") {
          // The relay and the rejoin replay share one name: a returning client lands the host's hp, turn
          // and wind without a reload (`US-ROOM-004` AC2, AC5).
          const current = stateRef.current;
          if (!current) return;
          const synced = resyncFromSnapshot(current, message.snapshot, hostGeneration.current);
          hostGeneration.current = synced.hostGeneration;
          if (synced.applied) commit(synced.state, []);
          return;
        }
        if (message.t === "room_state") {
          // Who is present decides whose turn is skipped (`US-ROOM-004` AC3/AC7), and the generation
          // decides which snapshots are still valid (AC5).
          absent.current = message.room.members
            .filter((member) => member.connectionState !== "connected")
            .map((member) => member.slot);
          hostGeneration.current = Math.max(hostGeneration.current, message.room.hostGeneration);
          for (const member of message.room.members) {
            if (member.playerId !== plan.playerId) void mesh.current?.addPeer(member.playerId);
          }
        }
      },
      // A transient drop reconnects inside the grace window (`US-ROOM-004` AC7); a code the server chose
      // means retrying would only repeat the answer.
      onReconnecting: () => setBanner(t("match.reconnecting")),
      onReconnected: () => setBanner(null),
      onFatal: (closeCode) => {
        if (closeCode === 4401) setBanner(t("signIn.title"));
        else setBanner(t("match.disconnected"));
      },
    });

    return () => {
      cancelled = true;
      socket.current?.close();
      socket.current = null;
      mesh.current?.close();
      mesh.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.roomCode, plan?.playerId]);

  const onPad = useCallback(
    (action: PadAction) => {
      const current = stateRef.current;
      if (!current || !plan) return;
      if (action === "up") setAimDelta((value) => Math.min(mobile.angleMax - 45, value + 1));
      if (action === "down") setAimDelta((value) => Math.max(mobile.angleMin - 45, value - 1));
      if (action === "left" || action === "right") {
        const result = applyInput(
          current,
          { kind: "move", slot: plan.localSlot, dir: action === "left" ? -1 : 1, run: false, seq: seq.current++ },
          Date.now(),
        );
        commit(result.state, result.events);
        mesh.current?.broadcast(toSnapshot(result.state, hostGeneration.current));
      }
    },
    [plan, mobile, commit],
  );

  const onRepeat = useCallback(
    (action: PadAction, times: number) => {
      for (let index = 0; index < times; index += 1) onPad(action);
    },
    [onPad],
  );

  const selectWeapon = useCallback((slot: WeaponSlot) => {
    weaponSlotRef.current = slot;
    setWeaponSlot(slot);
  }, []);

  // Items go out once, and only on this player's turn (`US-MATCH-005` AC5); the engine still
  // re-checks the quantity, so a double tap cannot spend two.
  const onUseItem = useCallback(
    (itemId: string) => {
      const current = stateRef.current;
      if (!current || !plan || current.turn.activeSlot !== plan.localSlot || !isItemId(itemId)) return;
      const result = applyInput(current, { kind: "item", slot: plan.localSlot, itemId, seq: seq.current++ }, Date.now());
      commit(result.state, result.events);
      mesh.current?.broadcast(toSnapshot(result.state, hostGeneration.current));
      socket.current?.send(itemFrame(itemId));
    },
    [plan, commit],
  );

  // Skip is the same input the clock expiry sends, so the turn resolves exactly once (`US-MATCH-004` AC1).
  const onSkip = useCallback(() => {
    const current = stateRef.current;
    if (!current || !plan || current.turn.activeSlot !== plan.localSlot) return;
    const result = applyInput(current, { kind: "skip", slot: plan.localSlot, seq: seq.current++ }, Date.now());
    commit(result.state, result.events);
    mesh.current?.broadcast(toSnapshot(result.state, hostGeneration.current));
  }, [plan, commit]);

  // A phrase carries an id, never a string the player typed (AC7), so every receiver renders it in
  // its own locale (AC5).
  const onChat = useCallback(
    (kind: ChatKind, id: string) => {
      const current = stateRef.current;
      if (!current || !plan) return;
      const result = applyInput(current, { kind, slot: plan.localSlot, id, seq: seq.current++ }, Date.now());
      commit(result.state, result.events);
      setChat({ kind, id });
    },
    [plan, commit],
  );

  useEffect(() => {
    if (!chat) return;
    const timer = window.setTimeout(() => setChat(null), chat.kind === "emote" ? 1500 : 3000);
    return () => window.clearTimeout(timer);
  }, [chat]);

  const clock = state ? Math.max(0, Math.ceil((state.turn.deadlineAt - Date.now()) / 1000)) : 0;

  // One polite live region per screen (`US-PWA-004` AC5): it reads the active player and their HP whenever
  // either changes, throttled to one update per second. The canvas is `aria-hidden`, so this text is the
  // only way a screen reader learns the state of the battlefield.
  const activePlayer = state ? state.players.find((player) => player.slot === state.turn.activeSlot) ?? null : null;
  const announcement = useLiveAnnouncement(
    activePlayer ? t("match.announce.turn", { name: activePlayer.displayName, hp: activePlayer.hp }) : "",
  );

  if (!plan || !state) {
    return (
      <div className="screen screen--center">
        <p>{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="match" data-testid="match-screen">
      <div className="sr-only" role="status" aria-live="polite" data-testid="match-announce">
        {announcement}
      </div>
      <div className="match__canvas" ref={container} aria-hidden="true" />
      <div className="match__hud">
        <div className="match__top">
          <div className="match__roster">
            {state.players.map((player) => (
              <div
                key={player.slot}
                className={`match__player${player.slot === state.turn.activeSlot ? " match__player--active" : ""}`}
                data-testid={`roster-${player.slot}`}
              >
                <div>{player.displayName}</div>
                <div className="muted">
                  {player.eliminated ? t("match.eliminated") : `${player.hp}/${getMobile(player.mobileId).maxHp}`}
                  {player.shield > 0 ? ` +${player.shield}` : ""}
                </div>
              </div>
            ))}
          </div>
          <div className="row">
            <WindDial weather={state.weather} label={t("match.wind")} />
            <div className="match__clock" data-testid="turn-clock">
              {clock}s
            </div>
          </div>
        </div>

        <Ruler window={camera} unitLabel={t("match.ruler.unit")} />

        <div className="match__power">
          <div className="match__power-value" data-testid="power-value">
            {power.toFixed(2)}
          </div>
          <div className="muted">
            {isMyTurn
              ? t("match.yourTurn")
              : t("match.waitingTurn", {
                  name: state?.players.find((player) => player.slot === state.turn.activeSlot)?.displayName ?? "…",
                })}
          </div>
        </div>

        <DirectionPad
          enabled={isMyTurn}
          canMove={Boolean(localPlayer && localPlayer.energy > 0)}
          energy={localPlayer?.energy ?? 0}
          labels={{
            up: t("match.angle.up"),
            down: t("match.angle.down"),
            left: t("match.move.left"),
            right: t("match.move.right"),
          }}
          onAction={onPad}
          onRepeat={onRepeat}
        />

        <div className="match__loadout">
          <WeaponStrip
            weapons={mobile.weapons}
            active={weaponSlot}
            charges={[1, 1, localPlayer?.superShotUsed ? 0 : 1]}
            names={[t("match.weapon.1"), t("match.weapon.2"), t("match.weapon.3")]}
            chargeLabels={[
              t("match.weapon.ready"),
              t("match.weapon.ready"),
              localPlayer?.superShotUsed ? t("match.weapon.spent") : t("match.weapon.charge", { count: 1, max: 1 }),
            ]}
            label={t("match.weapon.group")}
            disabled={!isMyTurn || lockedTurn === state.turn.number}
            onSelect={selectWeapon}
          />
          <ItemTray
            items={Object.entries(localPlayer?.items ?? {}).map(([id, qty]) => ({
              id,
              qty,
              delay: ITEMS_BY_ID.get(id)?.delayCost ?? 0,
            }))}
            labels={{
              toggle: t("match.item.tray"),
              empty: t("match.item.empty"),
              quantity: t("match.item.quantity"),
              delay: t("match.item.delay"),
            }}
            enabled={isMyTurn}
            onUse={onUseItem}
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
          onSkip={onSkip}
          onChat={onChat}
        />

        {status === "reconnecting" ? <div className="overlay">{t("match.reconnecting")}</div> : null}
        {chat ? (
          <div className="chat-bubble" data-testid="chat-bubble">
            {t("match.chat.bubble", {
              name: state.players.find((player) => player.slot === plan.localSlot)?.displayName ?? "",
              text: t(chat.kind === "emote" ? `match.emote.${chat.id}` : `match.phrase.${chat.id}`),
            })}
          </div>
        ) : null}
        {banner ? <div className="banner">{banner}</div> : null}
        {feed.length > 0 ? (
          <div className="banner" style={{ top: "auto", bottom: "96px" }} data-testid="event-feed">
            {feed.map((event, index) => (
              <div key={index}>{describeEvent(event, locale)}</div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function clampAngle(angle: number, mobile: { angleMin: number; angleMax: number }): number {
  return Math.max(mobile.angleMin, Math.min(mobile.angleMax, Math.round(angle)));
}

function describeEvent(event: MatchEvent, locale: Locale): string {
  switch (event.kind) {
    case "shot":
      // `power` is the weapon's damage power; the player's own input is the pull strength, shown on the HUD.
      return translate(locale, "match.event.shot", { power: event.power });
    case "weather":
      return translate(locale, "match.event.weather", { magnitude: event.weather.wind.magnitude });
    case "turn":
      return translate(locale, "match.event.turn", { number: event.turn.number });
    case "item":
      return translate(locale, "match.event.item", { itemId: event.itemId });
    case "move":
      return translate(locale, "match.event.move");
    case "chat":
      return translate(locale, "match.event.chat");
    case "end":
      return translate(locale, "match.event.end");
    case "reject":
      return translate(locale, "match.event.reject", { reason: event.reason });
    default:
      return "";
  }
}

export { createTerrain, TUNABLES };
