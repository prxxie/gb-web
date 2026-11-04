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
  applySnapshot,
  botTurn,
  createMatch,
  createRng,
  createTerrain,
  getMobile,
  toSnapshot,
  type FireInput,
  type MatchEvent,
  type MatchState,
  type Seat,
} from "@gbw/core";
import { mountBattle, type BattleHandle } from "../game/scene";
import { DirectionPad, type PadAction } from "../components/DirectionPad";
import { OrientationGate } from "../components/OrientationGate";
import { Ruler } from "../components/Ruler";
import { WindDial } from "../components/WindDial";
import { defaultWindow, type CameraWindow } from "@gbw/core";
import { useLocale } from "../app/providers";
import { createMesh, type Mesh } from "../net/mesh";
import { connectRoom, type RoomSocket, type ServerMessage } from "../net/signaling";
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
  const container = useRef<HTMLDivElement | null>(null);
  const battle = useRef<BattleHandle | null>(null);
  const mesh = useRef<Mesh | null>(null);
  const socket = useRef<RoomSocket | null>(null);
  const seq = useRef(1);
  const stateRef = useRef<MatchState | null>(null);
  const ended = useRef(false);

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
            weaponSlot: 0,
            angle: clampAngle(nextAngle + aimDelta, mobile),
            force: Math.round(value * 25),
            seq: seq.current++,
          };
          const result = applyInput(current, input, Date.now());
          commit(result.state, result.events);
          mesh.current?.broadcast(toSnapshot(result.state, 1));
          socket.current?.send({ t: "snapshot_push", snapshot: toSnapshot(result.state, 1) });
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

  // Turn clock: when it runs out the server (or the local engine) advances the turn.
  useEffect(() => {
    if (!state || state.status !== "playing") return;
    const tick = window.setInterval(() => {
      const current = stateRef.current;
      if (!current || current.status !== "playing") return;
      if (Date.now() > current.turn.deadlineAt && current.turn.activeSlot === (plan?.localSlot ?? 0)) {
        const result = applyInput(current, { kind: "skip", slot: current.turn.activeSlot, seq: seq.current++ }, Date.now());
        commit(result.state, result.events);
      }
    }, 500);
    return () => window.clearInterval(tick);
  }, [state, plan, commit]);

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
        send: (channel) => socket.current?.send({ t: "signal", to: channel.to, kind: channel.kind, payload: channel.payload }),
        onSnapshot: (snapshot) => {
          const current = stateRef.current;
          if (!current) return;
          const applied = applySnapshot(current, snapshot);
          if (!applied.changed) return;
          commit({ ...current, players: applied.players, seq: applied.seq, turn: snapshot.turn, weather: snapshot.weather }, []);
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

    socket.current = connectRoom({
      wsUrl: `${base}/api/v1/rooms/${plan.roomCode}/ws`,
      token: session.token,
      displayName: session.subject.displayName,
      mobileId: localPlayer?.mobileId ?? "mbl-01",
      onMessage: (message: ServerMessage) => {
        if (message.t === "signal") {
          void mesh.current?.applySignal(message.from, message.kind, message.payload);
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
        if (message.t === "room_state") {
          for (const member of message.room.members) {
            if (member.playerId !== plan.playerId) void mesh.current?.addPeer(member.playerId);
          }
        }
      },
      onClose: (closeCode) => {
        if (closeCode === 4401) setBanner(t("signIn.title"));
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
        mesh.current?.broadcast(toSnapshot(result.state, 1));
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

  const clock = state ? Math.max(0, Math.ceil((state.turn.deadlineAt - Date.now()) / 1000)) : 0;

  if (!plan || !state) {
    return (
      <div className="screen screen--center">
        <p>{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <OrientationGate message={t("match.zoom.hint")}>
      <div className="match" data-testid="match-screen">
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
            <div className="match__power-value" data-testid="power-value" aria-live="polite">
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
            labels={{
              up: t("match.angle.up"),
              down: t("match.angle.down"),
              left: t("match.move.left"),
              right: t("match.move.right"),
            }}
            onAction={onPad}
            onRepeat={onRepeat}
          />

          {status === "reconnecting" ? <div className="overlay">{t("match.reconnecting")}</div> : null}
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
    </OrientationGate>
  );
}

function clampAngle(angle: number, mobile: { angleMin: number; angleMax: number }): number {
  return Math.max(mobile.angleMin, Math.min(mobile.angleMax, Math.round(angle)));
}

function describeEvent(event: MatchEvent, locale: string): string {
  switch (event.kind) {
    case "shot":
      // `power` is the weapon's damage power; the player's own input is the pull strength, shown on the HUD.
      return locale === "vi" ? `Bắn (đạn ${event.power})` : `Shot (power ${event.power})`;
    case "weather":
      return locale === "vi" ? `Thời tiết: gió ${event.weather.wind.magnitude}` : `Weather: wind ${event.weather.wind.magnitude}`;
    case "turn":
      return locale === "vi" ? `Lượt ${event.turn.number}` : `Turn ${event.turn.number}`;
    case "item":
      return locale === "vi" ? `Dùng vật phẩm ${event.itemId}` : `Used ${event.itemId}`;
    case "move":
      return locale === "vi" ? "Di chuyển" : "Move";
    case "chat":
      return locale === "vi" ? "Cảm xúc" : "Emote";
    case "end":
      return locale === "vi" ? "Kết thúc" : "Match over";
    case "reject":
      return locale === "vi" ? `Từ chối: ${event.reason}` : `Rejected: ${event.reason}`;
    default:
      return "";
  }
}

export { createTerrain, TUNABLES };
