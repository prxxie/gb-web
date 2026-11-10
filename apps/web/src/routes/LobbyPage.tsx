/**
 * Lobby (`US-ROOM-002`, `US-ROOM-003`, `US-ROOM-007`).
 *
 * The lobby is a view of the room state the Durable Object broadcasts; the page never decides who
 * may start — `canStart` from `@gbw/core` does, and the server enforces the same rule.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  DEFAULT_MOBILE_ID,
  canStart,
  defaultSettings,
  type ClientFrame,
  type LoadoutEntry,
  type RoomSettings,
  type RoomState,
} from "@gbw/core";
import { useLocale, useSession } from "../app/providers";
import { LoadoutPicker } from "../components/LoadoutPicker";
import { MobileGrid } from "../components/MobileGrid";
import { SettingsPanel } from "../components/SettingsPanel";
import { api } from "../lib/api";
import { connectWithReconnect, type ReconnectingSocket } from "../net/reconnect";
import type { ServerMessage } from "../net/signaling";
import { writePlan, type PlannedMatch } from "../lib/plan";
import type { JSX } from "react";

/**
 * Avatar images have not shipped yet (`OQ-12`), so the roster shows the pick's number — honest, and it makes a
 * change visible in a screenshot. `default` (no pick made) shows a dash.
 */
function avatarLabel(avatarId: string): string {
  const digits = /(\d{2})$/.exec(avatarId)?.[1];
  return digits ?? "–";
}

/**
 * The `POST /join` that is in flight, shared between the two mounts a dev build runs of one effect (`StrictMode`).
 *
 * Without it the second run sent a join for the first run's seat, and — because the two runs could mint two guest
 * identities before the first `POST /session` landed — the second join was a *different* player asking for the last
 * seat, which the room answered `409 room-full`. The page read that as "no seat" and bounced the player to the
 * menu, losing the mobile pick (`US-ROOM-007` AC7). The entry is in flight only, and it is keyed by the token as
 * well: a join belongs to the identity that made it, and a settled answer must never be replayed to a later mount.
 */
const joinInFlight = new Map<string, Promise<string | null>>();

export function LobbyPage(): JSX.Element {
  const { code = "" } = useParams<{ code: string }>();
  const { t } = useLocale();
  const { session } = useSession();
  const navigate = useNavigate();
  const [room, setRoom] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  /**
   * The mobile this member just picked, before the room echoes it back. `room_state` overwrites it every time, so
   * the record — not this state — is what the grid believes after a reconnect (`US-ROOM-007` AC7).
   */
  const [picked, setPicked] = useState<string | null>(null);
  const [status, setStatus] = useState<"connecting" | "live" | "reconnecting" | "closed">("connecting");
  const [grace, setGrace] = useState(0);
  const [loadout, setLoadout] = useState<readonly LoadoutEntry[]>([]);
  const socket = useRef<ReconnectingSocket | null>(null);
  const joined = useRef(false);
  /** The identity this socket last authenticated with, so a rename sends one frame and not one per render. */
  const pushedIdentity = useRef<string | null>(null);
  const token = session?.token ?? null;
  const identity = useMemo(
    () => ({
      displayName: session?.subject.displayName ?? "",
      avatarId: session?.subject.avatarId ?? "default",
    }),
    [session?.subject.displayName, session?.subject.avatarId],
  );
  /** The newest identity, readable from callbacks that were created before the player edited it. */
  const identityRef = useRef(identity);
  identityRef.current = identity;

  const self = useMemo(() => room?.members.find((member) => member.playerId === playerId) ?? null, [room, playerId]);
  const isHost = Boolean(self && room && room.hostPlayerId === self.playerId);

  /**
   * A rename reaches the room through the frame the Durable Object already handles (`US-AUTH-003` AC7):
   * `auth` on an open socket updates the member record in the lobby and answers with `room_state`, so
   * peers see the new name within one round trip — no new frame type, no rejoin.
   */
  const pushIdentity = useCallback((): void => {
    const live = identityRef.current;
    const key = `${live.displayName}\u0000${live.avatarId}`;
    if (!socket.current || !token || pushedIdentity.current === key) return;
    pushedIdentity.current = key;
    // No `mobileId`: the pick travels in its own `loadout` frame, and resending a default here would overwrite
    // the choice a reconnecting member already made.
    socket.current.send({ t: "auth", token, displayName: live.displayName, avatarId: live.avatarId });
  }, [token]);

  // The player edited the profile: the socket has to hear the new identity. At mount and on any other
  // re-render the key matches what was already sent, so this sends nothing.
  useEffect(() => {
    pushIdentity();
  }, [pushIdentity, identity.displayName, identity.avatarId]);

  useEffect(() => {
    if (!session || joined.current) return;
    joined.current = true;
    const base = window.location.origin.replace(/^http/, "ws");
    const stored = sessionStorage.getItem(`gbw.room.${code}`);
    let cancelled = false;
    /** What this socket authenticates with when it opens; a later rename is pushed over it. */
    const connected = { displayName: session.subject.displayName, avatarId: session.subject.avatarId ?? "default" };

    /** The first arrival joins with its own identity; anyone returning keeps the playerId the room gave it. */
    const enter = async (): Promise<string | null> => {
      if (stored) return stored;
      const joinKey = `${code}\u0000${session.token}`;
      const pending = joinInFlight.get(joinKey);
      if (pending) return pending;
      const join = api
        .joinRoom(session.token, code, {
          displayName: connected.displayName,
          mobileId: DEFAULT_MOBILE_ID,
          avatarId: connected.avatarId,
        })
        .then((joinedRoom) => {
          sessionStorage.setItem(`gbw.room.${code}`, joinedRoom.playerId);
          return joinedRoom.playerId;
        })
        .catch(() => null);
      joinInFlight.set(joinKey, join);
      const settle = (): void => {
        if (joinInFlight.get(joinKey) === join) joinInFlight.delete(joinKey);
      };
      join.then(settle, settle);
      return join;
    };

    void enter().then((selfId) => {
      if (cancelled) return;
      if (!selfId) {
        // A code nobody minted is a menu-level problem (`US-ROOM-002` AC4): the lobby cannot show a roster
        // that does not exist, so it hands the reason back to the menu instead of spinning forever.
        navigate("/", { state: { error: "errors.room-not-found" } });
        return;
      }
      setPlayerId(selfId);
      pushedIdentity.current = `${connected.displayName}\u0000${connected.avatarId}`;
      socket.current = connectWithReconnect({
        wsUrl: `${base}/api/v1/rooms/${code}/ws`,
        token: session.token,
        displayName: connected.displayName,
        avatarId: connected.avatarId,
        onMessage: (message: ServerMessage) => {
          if (message.t === "error") {
            // The record is the truth: a refusal about this frame must not leave the grid pressing a mobile the room
            // dropped. Other refusals (an unready peer, someone else's chat flood) say nothing about the pick.
            if (message.code === "bad-request" || message.code === "invalid-state" || message.code === "rate-limited") {
              setPicked(null);
            }
            return;
          }
          if (message.t === "room_state") {
            setRoom(message.room);
            setStatus("live");
            if (message.you) setPlayerId(message.you.playerId);
            // The server echoes the stored loadout, so a reconnecting member sees what it saved.
            const mine = message.room.members.find((member) => member.playerId === (message.you?.playerId ?? selfId));
            if (mine?.loadout) setLoadout(mine.loadout);
            setPicked(mine?.mobileId ?? null);
            return;
          }
          // `peer_joined` carries the whole roster too (`signaling.md` §3), so the seated players see each
          // other without waiting for the next `room_state`.
          if (message.t === "peer_joined") {
            setRoom(message.room);
            return;
          }
          if (message.t === "peer_left") {
            setGrace(20);
            return;
          }
          if (message.t === "match_started") {
            const mine = message.room.members.find((member) => member.playerId === selfId) ?? null;
            const plan: PlannedMatch = {
              kind: "online",
              roomCode: code,
              localSlot: mine?.slot ?? 0,
              playerId: selfId,
              // The seats come from the room's own `assignments`, not from `room.members`: the assignment is the frame
              // that carries each player's loadout (`US-ROOM-007` AC2), and reading the public member list instead dropped
              // it on the floor — every match started with an empty item tray, so the wheel had nothing in it
              // (`US-MATCH-009`). `displayName` lives only on the member, so the two are joined by player id.
              seats: message.room.members.map((member) => {
                const assignment = message.assignments.find((entry) => entry.playerId === member.playerId);
                return {
                  slot: assignment?.slot ?? member.slot,
                  team: assignment?.team ?? member.team ?? "A",
                  accountId: assignment?.accountId ?? member.accountId,
                  displayName: member.displayName,
                  mobileId: assignment?.mobileId ?? member.mobileId ?? DEFAULT_MOBILE_ID,
                  // `LoadoutEntry[]` on the wire, a quantity map in the engine: the same shape `Seat.loadout` documents.
                  loadout: Object.fromEntries((assignment?.loadout ?? []).map((entry) => [entry.id, entry.qty])),
                };
              }),
              seed: message.seed,
              // The room's clock, not this device's: it is half of the record's id (`US-RANK-005` AC6).
              startedAt: message.startedAt,
              mapId: message.room.settings.mapId,
              mode: message.room.settings.mode as PlannedMatch["mode"],
              maxPlayers: message.room.settings.maxPlayers as PlannedMatch["maxPlayers"],
              hostPlayerId: message.room.hostPlayerId ?? "",
            };
            writePlan(plan);
            navigate(`/match/${code}`);
          }
        },
        onReconnecting: () => setStatus("reconnecting"),
        onReconnected: () => {
          setStatus("live");
          // The reopened socket authenticated with the identity captured above, which may be older than
          // an edit made while it was down; forgetting the pushed key lets the live one go out again.
          pushedIdentity.current = `${connected.displayName}\u0000${connected.avatarId}`;
          pushIdentity();
        },
        onFatal: () => setStatus("closed"),
      });
      // A rename that landed while the join was in flight is newer than the identity just sent.
      pushIdentity();
    });

    return () => {
      cancelled = true;
      socket.current?.close();
      socket.current = null;
      joined.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, session?.token]);

  useEffect(() => {
    if (grace <= 0) return;
    const timer = window.setInterval(() => setGrace((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [grace]);

  const copyCode = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Clipboard access can be denied; the code stays visible on screen.
    }
  };

  /**
   * One frame carries the whole roster (`US-ROOM-003`): the host sends the desired end state, so a
   * dropped or re-ordered frame can never leave half the room reassigned.
   */
  const assign = (playerIdToMove: string, team: "A" | "B"): void => {
    if (!room) return;
    const assignments = room.members.map((member) => ({
      playerId: member.playerId,
      team: member.playerId === playerIdToMove ? team : member.team,
    }));
    socket.current?.send({ t: "team_assign", assignments });
  };

  const start = (): void => {
    socket.current?.send({ t: "start_match" });
  };

  /**
   * Room settings are host-only (`US-ROOM-007`). The frame carries `mode` and `mapId`; `maxPlayers` is
   * part of `RoomSettings` so it rides along, and `@gbw/core`'s parser still has to grow the field before
   * the server can honour it — the cast is confined to this one call site until it does.
   */
  const changeSettings = (patch: Partial<RoomSettings>): void => {
    if (!room || !isHost) return;
    const next = { ...room.settings, ...patch };
    const frame = {
      t: "room_settings",
      mode: next.mode,
      mapId: next.mapId,
      maxPlayers: next.maxPlayers,
    } as ClientFrame;
    socket.current?.send(frame);
  };

  /** Every member picks its own loadout (`US-ROOM-007` AC4); the server enforces the eleven-item budget. */
  const changeLoadout = (items: readonly LoadoutEntry[]): void => {
    setLoadout(items);
    socket.current?.send({ t: "loadout", items });
  };

  /**
   * One frame for both picks (`US-ROOM-007` AC7): the frame always carries the whole loadout, so a mobile pick and
   * a loadout pick are the same message with one more field.
   */
  const pickMobile = (nextMobileId: string): void => {
    // A locked room would refuse the frame, and the optimistic highlight would claim a pick the room never took.
    if (room?.status !== "lobby") return;
    setPicked(nextMobileId);
    // Only the mobile: re-sending `items` would overwrite a list another tab may have just built.
    socket.current?.send({ t: "loadout", mobileId: nextMobileId });
  };

  if (!session) {
    // A heading, not just a paragraph: this branch is a whole route whose session could not be minted, and every other
    // route puts focus on its own `h1` when it renders (`US-PWA-004` AC7). Without one, a keyboard or screen-reader user
    // arrived at a screen that announced nothing and had nowhere to land.
    return (
      <div className="screen screen--center">
        <h1>{t("signIn.title")}</h1>
        <p>
          <Link to="/sign-in">{t("main.signIn")}</Link>
        </p>
      </div>
    );
  }

  const teams = {
    A: room?.members.filter((member) => member.team === "A") ?? [],
    B: room?.members.filter((member) => member.team === "B") ?? [],
  };
  const settings = room?.settings ?? defaultSettings(2);
  const ready = Boolean(room && self && canStart(room, self.playerId) === null);

  return (
    <div className="screen">
      <header className="row">
        <h1 data-testid="room-code">{code}</h1>
        <button type="button" className="ghost" data-testid="copy-code" onClick={() => void copyCode()}>
          {t("lobby.copy")}
        </button>
        <span className="badge">
          {room ? `${room.members.length}/${settings.maxPlayers}` : t("common.loading")}
        </span>
      </header>

      <section className="card">
        <div className="row">
          {self ? (
            <button type="button" onClick={() => assign(self.playerId, self.team === "A" ? "B" : "A")}>
              {t("lobby.switchTeam")}
            </button>
          ) : null}
        </div>
        {isHost ? (
          <div className="row">
            <span className="badge">{t("lobby.host")}</span>
            <button type="button" className="primary" data-testid="start-match" onClick={start} disabled={!ready}>
              {t("lobby.start")}
            </button>
          </div>
        ) : (
          <p className="muted">{t("lobby.waiting")}</p>
        )}
      </section>

      <SettingsPanel settings={settings} isHost={isHost} onChange={changeSettings} />
      <MobileGrid chosen={picked ?? self?.mobileId ?? DEFAULT_MOBILE_ID} onPick={pickMobile} />
      <LoadoutPicker items={loadout} onChange={changeLoadout} />

      <div className="row" style={{ alignItems: "flex-start" }}>
        {(["A", "B"] as const).map((team) => (
          <section key={team} className="card grow" data-testid={`team-${team}`}>
            <h2>{team === "A" ? t("lobby.teamA") : t("lobby.teamB")}</h2>
            {teams[team].length === 0 ? <p className="muted">—</p> : null}
            {teams[team].map((member) => (
              <div key={member.playerId} className="row">
                {/* `US-AUTH-003` AC5: the avatar a peer picked shows up in the roster, which reads it from
                    the member record the room broadcasts rather than from this device's own profile. */}
                <span
                  className="lobby__avatar"
                  data-testid={`roster-avatar-${member.playerId}`}
                  title={member.avatarId}
                  aria-hidden="true"
                >
                  {avatarLabel(member.avatarId)}
                </span>
                <span>{member.displayName}</span>
                {member.playerId === room?.hostPlayerId ? <span className="badge">{t("lobby.host")}</span> : null}
                {member.connectionState !== "connected" ? <span className="badge">{t("lobby.reconnecting")}</span> : null}
                {isHost ? (
                  <button type="button" className="ghost" onClick={() => assign(member.playerId, team === "A" ? "B" : "A")}>
                    ↔
                  </button>
                ) : null}
              </div>
            ))}
          </section>
        ))}
      </div>

      {status === "connecting" ? <div className="overlay">{t("common.loading")}</div> : null}
      {status === "reconnecting" ? <div className="overlay" data-testid="lobby-reconnecting">{t("match.reconnecting")}</div> : null}
      {status === "closed" ? <div className="overlay">{t("match.disconnected")}</div> : null}
      {grace > 0 ? (
        <div className="banner" data-testid="grace-countdown">
          {t("match.reconnecting")} — {grace}s
        </div>
      ) : null}
    </div>
  );
}
