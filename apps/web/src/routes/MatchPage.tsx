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
  EMOTE_IDS,
  PHRASE_IDS,
  type ChatId,
  type MatchEvent,
  type MatchState,
  type Seat,
} from "@gbw/core";
import { mountBattle, type BattleHandle } from "../game/scene";
import { canAim, fireFromPull, RING_RADIUS } from "../game/aim";
import { DirectionPad, type PadAction } from "../components/DirectionPad";
import { PhrasePicker, type ChatKind } from "../components/PhrasePicker";
import { Ruler } from "../components/Ruler";
import { ItemTray } from "../components/ItemTray";
import { Roster } from "../components/Roster";
import { WeatherBanner } from "../components/WeatherBanner";
import { winConditionOf } from "../lib/outcome";
import { clockSeconds } from "../lib/clock";
import { WeaponStrip, type WeaponSlot } from "../components/WeaponStrip";
import { WindDial } from "../components/WindDial";
import { defaultWindow, type CameraWindow } from "@gbw/core";
import { useLocale } from "../app/providers";
import { useLiveAnnouncement } from "../app/useLiveAnnouncement";
import { translate, type Locale } from "../i18n";
import {
  inputFrameOf,
  isStaleInput,
  SNAPSHOT_WATCHDOG_MS,
  toPackedSnapshot,
  unpackSnapshot,
  type InputFrame,
} from "../net/input";
import { createMesh, type Mesh } from "../net/mesh";
import { decideTurn } from "../net/host-clock";
import { resyncFromSnapshot } from "../net/resync";
import { countRejectedSnapshot } from "../net/diagnostics";
import { chatFrame, chatText, isChatFrame, toastMs } from "../net/chat";
import { adoptHostChanged } from "../net/migration";
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
  /** The "drag to aim" hint, shown once per match (`US-MATCH-002` AC4). */
  const [hint, setHint] = useState<string | null>(null);
  const hintShown = useRef(false);
  const [aimDelta, setAimDelta] = useState(0);
  const aimDeltaRef = useRef(0);
  /** The barrel's resting angle: the gesture angle is added to this at release (`US-MATCH-006` AC4/AC5). */
  const aimAngle = 45 + aimDelta;
  const [camera, setCamera] = useState<CameraWindow>(() => defaultWindow(16 / 9));
  /** Where the renderer last drew this client's mobile, in CSS pixels (`US-MATCH-003` AC11). */
  const [focus, setFocus] = useState<{ readonly x: number; readonly y: number } | null>(null);
  const [status, setStatus] = useState<"connecting" | "live" | "reconnecting" | "ended">("connecting");
  const [banner, setBanner] = useState<string | null>(null);
  // The aim selection is local state but the renderer callback is created once, so the ref is what
  // the shot reads; the state only drives the strip's `aria-pressed` (`US-MATCH-005` AC2).
  const [weaponSlot, setWeaponSlot] = useState<WeaponSlot>(0);
  const weaponSlotRef = useRef<WeaponSlot>(0);
  // Turn number the weapon was fired in: the selection is locked until the turn changes (AC3).
  const [lockedTurn, setLockedTurn] = useState<number | null>(null);
  /** Mirrored for the mount-time closures: `onRelease` is created once and would read a stale state value. */
  const lockedTurnRef = useRef<number | null>(null);
  /** The phrase on screen, with the seat that said it: the banner belongs above that seat's chip (`AC3`). */
  const [chat, setChat] = useState<{ readonly slot: number; readonly kind: ChatKind; readonly id: string } | null>(null);
  const container = useRef<HTMLDivElement | null>(null);
  const battle = useRef<BattleHandle | null>(null);
  const mesh = useRef<Mesh | null>(null);
  const socket = useRef<ReconnectingSocket | null>(null);
  const seq = useRef(1);
  /** Last `seq` applied per `slot:turn`, so a resent input is dropped instead of applied twice (`US-NET-002` AC4). */
  const appliedInputs = useRef(new Map<string, number>());
  /** `playerId → slot` from the last `room_state`, so a control frame can be attributed to a seat (`US-NET-002` AC1). */
  const slotsByPlayer = useRef(new Map<string, number>());
  /** When the last snapshot arrived, for the 2 s watchdog (`US-NET-002` AC6). */
  const lastSnapshotAt = useRef(0);
  const stateRef = useRef<MatchState | null>(null);
  const ended = useRef(false);
  // Slots the room reports as `grace` or `disconnected`, and the newest host election seen: the first
  // decides who gets skipped, the second which snapshots are still valid (`US-ROOM-004` AC3/AC5/AC7).
  const absent = useRef<readonly number[]>([]);
  const hostGeneration = useRef(0);
  /**
   * Who runs the simulation right now. Seeded from the lobby plan and moved by `host_changed`/`room_state`
   * (`US-NET-003` AC2): the plan is a photograph of the room as it was when the match started.
   */
  const hostPlayerId = useRef<string | null>(plan?.hostPlayerId ?? null);

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
        // Which rule ended it, for the result screen (`US-CORE-010` AC6): the engine keeps only the
        // winner, so the condition is read back with the same rules `conclusionOf` used.
        winCondition: winConditionOf(final),
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
        // The pad rings the mobile the player is shooting (`US-MATCH-003` AC11).
        onFocus: (point) => setFocus(point),
        onPull: (value) => {
          setPower(value);
        },
        onRelease: (value, nextAngle) => {
          const current = stateRef.current;
          if (!current || !plan) return;
          // The scene already refuses to start a pull out of turn, but the release is the moment a shot would leave
          // the client, so the same decision is taken again here (`US-MATCH-002` AC7/AC8).
          const input = fireFromPull(
            { power: value, angle: nextAngle },
            {
              slot: plan.localSlot,
              weaponSlot: weaponSlotRef.current,
              seq: seq.current,
              mobile,
              aimDelta: aimDeltaRef.current,
              shot: { lockedTurn: lockedTurnRef.current, turnNumber: current.turn.number },
            },
          );
          if (!input) return;
          const turn = current.turn.number;
          if (!hostingRef.current) {
            // A peer never simulates (`US-NET-002` AC1): the input goes to the host, the shot appears when the host's
            // snapshot comes back — one round trip later by design (`OQ-32`, no prediction).
            seq.current = input.seq + 1;
            mesh.current?.sendControlAll(
              inputFrameOf(
                {
                  kind: "fire",
                  angle: input.angle,
                  force: input.force,
                  facing: current.players.find((player) => player.slot === plan.localSlot)?.facing ?? 1,
                  weaponSlot: input.weaponSlot,
                },
                turn,
                input.seq,
              ),
            );
            setLockedTurn(turn);
            lockedTurnRef.current = turn;
            setPower(0);
            return;
          }
          seq.current += 1;
          const result = applyInput(current, input, Date.now());
          commit(result.state, result.events);
          setLockedTurn(current.turn.number);
          lockedTurnRef.current = current.turn.number;
          // A shot that carved the mask is the only moment the peers need the terrain itself: they resolve
          // hits against it (`US-CORE-006` AC4), and the mask is far too big to ride in every snapshot.
          const carved = result.events.some((event) => event.kind === "shot" && event.carved);
          const snapshot = toSnapshot(result.state, hostGeneration.current, { includeTerrain: carved });
          mesh.current?.broadcast(snapshot);
          socket.current?.send({ t: "snapshot_push", snapshot: toPackedSnapshot(snapshot) });
          setPower(0);
        },
        onCancel: (reason) => {
          setPower(0);
          if (reason === "deadzone" && !hintShown.current) {
            hintShown.current = true;
            setHint(translate(locale, "match.hint.pull"));
          }
        },
        onCamera: (window) => setCamera(window),
      },
    });
    // A remounted scene starts on slot 0 and no nudge; hand it what the strip and the pad are showing.
    battle.current.setWeaponSlot(weaponSlotRef.current);
    battle.current.setAimDelta(aimDeltaRef.current);
    return () => {
      battle.current?.destroy();
      battle.current = null;
      // The mounted scene keeps its own copy of the state; the page pushes updates below.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(state), plan?.localSlot, commit]);

  // The aim aid draws the angle the shot will carry, so the scene needs the pad's nudge (`US-MATCH-006`).
  useEffect(() => {
    aimDeltaRef.current = aimDelta;
    battle.current?.setAimDelta(aimDelta);
  }, [aimDelta]);

  useEffect(() => {
    if (battle.current && state) battle.current.setState(state, plan?.localSlot ?? 0);
  }, [state, plan?.localSlot]);

  // The hint says its piece once and goes away on its own (`US-MATCH-002` AC4).
  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(null), 2500);
    return () => window.clearTimeout(timer);
  }, [hint]);

  // The scene draws the ring and the preview only while this client may shoot (`US-MATCH-002` AC7/AC8).
  useEffect(() => {
    if (!state) return;
    const localSlot = plan?.localSlot ?? 0;
    const own = state.players.find((player) => player.slot === localSlot);
    battle.current?.setAimAllowed(
      canAim({
        status: state.status,
        activeSlot: state.turn.activeSlot,
        localSlot,
        eliminated: own?.eliminated ?? false,
        lockedTurn,
        turnNumber: state.turn.number,
      }),
    );
  }, [state, plan?.localSlot, lockedTurn]);

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
  //
  // Who the host is changes while a match runs: an election promotes a peer and demotes the client that was hosting
  // (`US-NET-003` AC2). The plan from the lobby never changes, so it cannot answer that question.
  const [hosting, setHosting] = useState(() => !plan || plan.kind === "bot" || plan.hostPlayerId === plan.playerId);
  /**
   * The role as the renderer holds it. `mountBattle` is not remounted when the role changes, so the callbacks it
   * captured would keep answering from the lobby's plan (`US-NET-003` AC2).
   */
  const hostingRef = useRef(hosting);
  useEffect(() => {
    hostingRef.current = hosting;
  }, [hosting]);
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
        socket.current?.send({ t: "snapshot_push", snapshot: toPackedSnapshot(snapshot) });
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

    let iceServers: RTCIceServer[] = [];
    const buildMesh = (hosting: boolean): Mesh =>
      createMesh({
        selfPlayerId: plan.playerId,
        isHost: hosting,
        iceServers,
        // `host_hello` on every new control channel (`US-NET-001` § 5).
        hostHello: () => ({ t: "host_hello", hostGeneration: hostGeneration.current, seq: seq.current }),
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
          lastSnapshotAt.current = Date.now();
          const current = stateRef.current;
          if (!current) return;
          const synced = resyncFromSnapshot(current, snapshot, hostGeneration.current);
          hostGeneration.current = synced.hostGeneration;
          if (synced.applied) commit(synced.state, []);
          // A snapshot from a host that lost the election is dropped, and the drop is counted so a support
          // check can tell a flickering connection from a client that never learned about the promotion.
          else countRejectedSnapshot();
        },
        onControl: (from, message) => {
          const current = stateRef.current;
          if (!current) return;
          // A phrase is not an input: it never changes the match, so it is handled before the turn guard and
          // is never attributed by `seq` (`US-MATCH-004` AC3).
          if (isChatFrame(message)) {
            const slot = slotsByPlayer.current.get(from);
            if (slot === undefined) return;
            setChat({ slot, kind: message.kind, id: message.id });
            // The host is the star's centre: a peer's phrase has to reach the other peers, and not come back
            // to the sender, which already showed it.
            if (hostPlayerId.current === plan.playerId) {
              for (const playerId of slotsByPlayer.current.keys()) {
                if (playerId !== from && playerId !== plan.playerId) mesh.current?.sendControl(playerId, message);
              }
            }
            return;
          }
          const frame = message as Partial<InputFrame> & { t?: string };
          if (frame?.t !== "input") return;
          // Only the host runs the simulation; a peer that receives an input has already made a mistake.
          if (hostPlayerId.current !== plan.playerId) return;
          const slot = slotsByPlayer.current.get(from);
          if (slot === undefined || frame.turn !== current.turn.number) return;
          // AC4: an input older than the last one applied for this turn is dropped, not answered.
          const key = `${slot}:${current.turn.number}`;
          if (isStaleInput(frame as InputFrame, appliedInputs.current.get(key))) return;
          appliedInputs.current.set(key, frame.seq ?? 0);
          const input =
            frame.kind === "skip"
              ? { kind: "skip" as const, slot, seq: frame.seq ?? 0 }
              : {
                  kind: "fire" as const,
                  slot,
                  weaponSlot: frame.weaponSlot ?? 0,
                  angle: frame.angle ?? 0,
                  force: frame.force ?? 0,
                  seq: frame.seq ?? 0,
                };
          const result = applyInput(current, input, Date.now());
          commit(result.state, result.events);
          // A resolved turn is published at once, so the shotter does not wait for the 100 ms tick (AC2, § 5).
          const carved = result.events.some((event) => event.kind === "shot" && event.carved);
          const snapshot = toSnapshot(result.state, hostGeneration.current, { includeTerrain: carved });
          mesh.current?.broadcast(snapshot);
          socket.current?.send({ t: "snapshot_push", snapshot: toPackedSnapshot(snapshot) });
        },
        onPeerState: (playerId, connectionState) => {
          if (connectionState === "failed" || connectionState === "disconnected") {
            setBanner(`${playerId}: ${connectionState}`);
          }
        },
      });

    void api.turnCredentials(session.token).then((credentials) => {
      if (cancelled) return;
      iceServers = credentials.iceServers.map((server) => ({
        urls: Array.isArray(server.urls) ? server.urls : [server.urls],
        ...(server.username ? { username: server.username } : {}),
        ...(server.credential ? { credential: server.credential } : {}),
      }));
      mesh.current = buildMesh(hostPlayerId.current === plan.playerId);
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
          // Migration rebuilds the star (`US-NET-001` AC6): the elected host opens one link per remaining member and
          // everyone drops the links that pointed at the old host. A link to a superseded host would stream state the
          // peers are told to discard anyway, so the mesh is rebuilt from scratch.
          hostGeneration.current = Math.max(hostGeneration.current, message.hostGeneration);
          hostPlayerId.current = message.hostPlayerId;
          const promoted = message.hostPlayerId === plan.playerId;
          setHosting(promoted);
          mesh.current?.close();
          mesh.current = iceServers.length === 0 ? null : buildMesh(promoted);
          for (const member of message.room.members) {
            if (member.playerId !== plan.playerId) void mesh.current?.addPeer(member.playerId);
          }
          // The DO hands the promoted client the snapshot it kept: adopt it, then publish once so the peers and
          // the replay any graced member receives carry the new host's numbers (`US-NET-003` AC1, AC4).
          if (promoted) {
            const adoption = adoptHostChanged(stateRef.current, message);
            hostGeneration.current = adoption.hostGeneration;
            if (adoption.state) {
              commit(adoption.state, []);
              const snapshot = toSnapshot(adoption.state, adoption.hostGeneration);
              mesh.current?.broadcast(snapshot);
              socket.current?.send({ t: "snapshot_push", snapshot: toPackedSnapshot(snapshot) });
            }
          }
          return;
        }
        if (message.t === "peer_joined") {
          void mesh.current?.addPeer(message.playerId);
          return;
        }
        if (message.t === "snapshot_state") {
          // The relay and the rejoin replay share one name: a returning client lands the host's hp, turn
          // and wind without a reload (`US-ROOM-004` AC2, AC5).
          lastSnapshotAt.current = Date.now();
          const current = stateRef.current;
          if (!current) return;
          const synced = resyncFromSnapshot(current, unpackSnapshot(message.snapshot), hostGeneration.current);
          hostGeneration.current = synced.hostGeneration;
          if (synced.applied) commit(synced.state, []);
          else countRejectedSnapshot();
          return;
        }
        if (message.t === "room_state") {
          // Who is present decides whose turn is skipped (`US-ROOM-004` AC3/AC7), and the generation
          // decides which snapshots are still valid (AC5).
          absent.current = message.room.members
            .filter((member) => member.connectionState !== "connected")
            .map((member) => member.slot);
          hostGeneration.current = Math.max(hostGeneration.current, message.room.hostGeneration);
          if (message.room.hostPlayerId !== hostPlayerId.current) {
            hostPlayerId.current = message.room.hostPlayerId;
            setHosting(message.room.hostPlayerId === plan.playerId);
            mesh.current?.close();
            mesh.current = iceServers.length === 0 ? null : buildMesh(message.room.hostPlayerId === plan.playerId);
          }
          for (const member of message.room.members) {
            slotsByPlayer.current.set(member.playerId, member.slot);
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

  // `US-NET-002` AC6: a peer that has heard nothing for two seconds is looking at a frozen screen, so it says so.
  // The replay itself is the socket's: a returning client receives `snapshot_state` from the DO (`US-ROOM-004` AC2).
  useEffect(() => {
    if (!plan || plan.kind !== "online" || hosting) return undefined;
    const timer = setInterval(() => {
      if (stateRef.current?.status !== "playing") return;
      if (lastSnapshotAt.current === 0) return;
      if (Date.now() - lastSnapshotAt.current > SNAPSHOT_WATCHDOG_MS) setBanner(t("match.reconnecting"));
    }, 500);
    return () => clearInterval(timer);
  }, [plan, hosting, t]);

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
        // Only the host publishes: a peer's local move is not the simulation anyone else sees (`US-NET-002`).
        if (hosting) mesh.current?.broadcast(toSnapshot(result.state, hostGeneration.current));
      }
    },
    [plan, mobile, commit, hosting],
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
    // The dotted arc is drawn by the scene, so the selection has to reach it (`US-MATCH-005` AC2).
    battle.current?.setWeaponSlot(slot);
  }, []);

  // A spent super shot disables its slot (`AC3`), so the aim aid must not keep pointing at it.
  useEffect(() => {
    if (weaponSlot === 2 && localPlayer?.superShotUsed) selectWeapon(0);
  }, [weaponSlot, localPlayer?.superShotUsed, selectWeapon]);


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
    const turn = current.turn.number;
    if (!hosting) {
      mesh.current?.sendControlAll(inputFrameOf({ kind: "skip" }, turn, seq.current++));
      return;
    }
    const result = applyInput(current, { kind: "skip", slot: plan.localSlot, seq: seq.current++ }, Date.now());
    commit(result.state, result.events);
    mesh.current?.broadcast(toSnapshot(result.state, hostGeneration.current));
  }, [plan, commit, hosting]);

  // A phrase carries an id, never a string the player typed (AC7), so every receiver renders it in
  // its own locale (AC5). It is not a match input: it changes no state, so it never spends a `seq`.
  const onChat = useCallback(
    (kind: ChatKind, id: ChatId) => {
      if (!plan) return;
      setChat({ slot: plan.localSlot, kind, id });
      mesh.current?.sendControlAll(chatFrame(kind, id));
    },
    [plan],
  );

  useEffect(() => {
    if (!chat) return;
    const timer = window.setTimeout(() => setChat(null), toastMs(chat.kind));
    return () => window.clearTimeout(timer);
  }, [chat]);

  // The clock reads whole seconds from `deadlineAt` and never climbs above the turn duration (`AC2`).
  const clock = state ? clockSeconds(state.turn.deadlineAt, Date.now(), TUNABLES.turnDurationMs) : 0;

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
        {/* One banner per wind roll, 1.5 s, dismissed by a tap (`US-MATCH-003` AC10). */}
        <WeatherBanner
          rolledAtRound={state.weather.rolledAtRound}
          text={t("match.weather.changed", {
            magnitude: state.weather.wind.magnitude,
            sector: state.weather.wind.sector,
          })}
        />
        <div className="match__top">
          <Roster
            players={state.players}
            activeSlot={state.turn.activeSlot}
            eliminatedLabel={t("match.eliminated")}
            chat={chat ? { slot: chat.slot, kind: chat.kind, text: chatText(t, chat.kind, chat.id) ?? "" } : null}
          />
          <div className="row">
            <div className="match__angle" data-testid="angle-value">
            {Math.round(aimAngle)}°
          </div>
          <WindDial weather={state.weather} label={t("match.wind")} />
            <div className="match__round" data-testid="turn-round">
              {t("match.round", { round: state.turn.round })}
            </div>
            <div className="match__clock" data-testid="turn-clock">
              {clock}s
            </div>
          </div>
        </div>

        <Ruler window={camera} unitLabel={t("match.ruler.unit")} />

        <div
          className={focus ? "match__power match__power--on-ring" : "match__power"}
          style={focus ? { left: focus.x, top: focus.y - RING_RADIUS - 18 } : undefined}
        >
          <div className="match__power-value" data-testid="power-value">
            {power.toFixed(2)}
          </div>
          {hint && (
            <div className="match__hint" data-testid="pull-hint">
              {hint}
            </div>
          )}
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
