/**
 * Lobby (`US-ROOM-002`, `US-ROOM-003`, `US-ROOM-007`).
 *
 * The lobby is a view of the room state the Durable Object broadcasts; the page never decides who
 * may start — `canStart` from `@gbw/core` does, and the server enforces the same rule.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MOBILES, canStart, defaultSettings, type ClientFrame, type LoadoutEntry, type RoomSettings, type RoomState } from "@gbw/core";
import { useLocale, useSession } from "../app/providers";
import { LoadoutPicker } from "../components/LoadoutPicker";
import { SettingsPanel } from "../components/SettingsPanel";
import { api } from "../lib/api";
import { connectWithReconnect, type ReconnectingSocket } from "../net/reconnect";
import type { ServerMessage } from "../net/signaling";
import type { PlannedMatch } from "./MatchPage";
import type { JSX } from "react";

export function LobbyPage(): JSX.Element {
  const { code = "" } = useParams<{ code: string }>();
  const { t } = useLocale();
  const { session } = useSession();
  const navigate = useNavigate();
  const [room, setRoom] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [mobileId, setMobileId] = useState<string>(MOBILES[0]?.mobileId ?? "mbl-01");
  const [status, setStatus] = useState<"connecting" | "live" | "reconnecting" | "closed">("connecting");
  const [grace, setGrace] = useState(0);
  const [loadout, setLoadout] = useState<readonly LoadoutEntry[]>([]);
  const socket = useRef<ReconnectingSocket | null>(null);
  const joined = useRef(false);

  const self = useMemo(() => room?.members.find((member) => member.playerId === playerId) ?? null, [room, playerId]);
  const isHost = Boolean(self && room && room.hostPlayerId === self.playerId);

  useEffect(() => {
    if (!session || joined.current) return;
    joined.current = true;
    const base = window.location.origin.replace(/^http/, "ws");
    const stored = sessionStorage.getItem(`gbw.room.${code}`);
    let cancelled = false;

    /** The first arrival joins with its own identity; anyone returning keeps the playerId the room gave it. */
    const enter = async (): Promise<string | null> => {
      if (stored) return stored;
      try {
        const joinedRoom = await api.joinRoom(session.token, code, {
          displayName: session.subject.displayName,
          mobileId,
          avatarId: session.subject.avatarId ?? "default",
        });
        sessionStorage.setItem(`gbw.room.${code}`, joinedRoom.playerId);
        return joinedRoom.playerId;
      } catch {
        return null;
      }
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
      socket.current = connectWithReconnect({
        wsUrl: `${base}/api/v1/rooms/${code}/ws`,
        token: session.token,
        displayName: session.subject.displayName,
        mobileId,
        avatarId: session.subject.avatarId ?? "default",
        onMessage: (message: ServerMessage) => {
          if (message.t === "room_state") {
            setRoom(message.room);
            setStatus("live");
            if (message.you) setPlayerId(message.you.playerId);
            // The server echoes the stored loadout, so a reconnecting member sees what it saved.
            const mine = message.room.members.find((member) => member.playerId === (message.you?.playerId ?? selfId));
            if (mine?.loadout) setLoadout(mine.loadout);
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
              seats: message.room.members.map((member) => ({
                slot: member.slot,
                team: member.team ?? "A",
                accountId: member.accountId,
                displayName: member.displayName,
                mobileId: member.mobileId ?? mobileId,
              })),
              seed: message.seed,
              mapId: message.room.settings.mapId,
              mode: message.room.settings.mode as PlannedMatch["mode"],
              maxPlayers: message.room.settings.maxPlayers as PlannedMatch["maxPlayers"],
              hostPlayerId: message.room.hostPlayerId ?? "",
            };
            sessionStorage.setItem("gbw.match", JSON.stringify(plan));
            navigate(`/match/${code}`);
          }
        },
        onReconnecting: () => setStatus("reconnecting"),
        onFatal: () => setStatus("closed"),
      });
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

  if (!session) {
    return (
      <div className="screen screen--center">
        <p>
          {t("signIn.title")} — <Link to="/sign-in">{t("main.signIn")}</Link>
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
          <label className="muted">{t("lobby.mobile")}</label>
          <select value={mobileId} onChange={(event) => setMobileId(event.target.value)}>
            {MOBILES.map((mobile) => (
              <option key={mobile.mobileId} value={mobile.mobileId}>
                {mobile.name}
              </option>
            ))}
          </select>
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
      <LoadoutPicker items={loadout} onChange={changeLoadout} />

      <div className="row" style={{ alignItems: "flex-start" }}>
        {(["A", "B"] as const).map((team) => (
          <section key={team} className="card grow" data-testid={`team-${team}`}>
            <h2>{team === "A" ? t("lobby.teamA") : t("lobby.teamB")}</h2>
            {teams[team].length === 0 ? <p className="muted">—</p> : null}
            {teams[team].map((member) => (
              <div key={member.playerId} className="row">
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
