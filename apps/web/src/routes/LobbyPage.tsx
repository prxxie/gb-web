/**
 * Lobby (`US-ROOM-002`, `US-ROOM-003`, `US-ROOM-007`).
 *
 * The lobby is a view of the room state the Durable Object broadcasts; the page never decides who
 * may start — `canStart` from `@gbw/core` does, and the server enforces the same rule.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MAPS, MOBILES, canStart, defaultSettings, type RoomState } from "@gbw/core";
import { useLocale, useSession } from "../app/providers";
import { api } from "../lib/api";
import { connectRoom, type RoomSocket, type ServerMessage } from "../net/signaling";
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
  const [status, setStatus] = useState<"connecting" | "live" | "closed">("connecting");
  const [grace, setGrace] = useState(0);
  const socket = useRef<RoomSocket | null>(null);
  const joined = useRef(false);

  const self = useMemo(() => room?.members.find((member) => member.playerId === playerId) ?? null, [room, playerId]);
  const isHost = Boolean(self && room && room.hostPlayerId === self.playerId);

  useEffect(() => {
    if (!session || joined.current) return;
    joined.current = true;
    const base = window.location.origin.replace(/^http/, "ws");
    const planned: PlannedMatch = {
      kind: "online",
      roomCode: code,
      localSlot: 0,
      playerId: "",
      seats: [],
      seed: 0,
      mapId: MAPS[0]?.mapId ?? "map-01",
      mode: "solo",
      maxPlayers: 2,
      hostPlayerId: "",
    };
    sessionStorage.setItem("gbw.lobby", JSON.stringify(planned));

    void api.createRoom(session.token, {
      displayName: session.subject.displayName,
      mobileId,
      avatarId: session.subject.avatarId ?? "default",
      maxPlayers: 2,
      mode: "solo",
      mapId: MAPS[0]?.mapId ?? "map-01",
    }).catch(() => undefined);

    socket.current = connectRoom({
      wsUrl: `${base}/api/v1/rooms/${code}/ws`,
      token: session.token,
      displayName: session.subject.displayName,
      mobileId,
      avatarId: session.subject.avatarId ?? "default",
      onMessage: (message: ServerMessage) => {
        if (message.t === "room_state") {
          setRoom(message.room);
          setStatus("live");
          if (!playerId) {
            const mine = message.room.members.find((member) => member.accountId === session.subject.accountId)
              ?? message.room.members[message.room.members.length - 1]
              ?? null;
            if (mine) setPlayerId(mine.playerId);
          }
          return;
        }
        if (message.t === "peer_left") {
          setGrace(20);
          return;
        }
        if (message.t === "match_started") {
          const plan: PlannedMatch = {
            kind: "online",
            roomCode: code,
            localSlot: self?.slot ?? 0,
            playerId: playerId ?? "",
            seats:
              room?.members.map((member) => ({
                slot: member.slot,
                team: member.team ?? "A",
                accountId: member.accountId,
                displayName: member.displayName,
                mobileId: member.mobileId ?? mobileId,
              })) ?? [],
            seed: message.seed,
            mapId: message.mapId,
            mode: message.mode as PlannedMatch["mode"],
            maxPlayers: (room?.settings.maxPlayers ?? 2) as PlannedMatch["maxPlayers"],
            hostPlayerId: room?.hostPlayerId ?? "",
          };
          sessionStorage.setItem("gbw.match", JSON.stringify(plan));
          navigate(`/match/${code}`);
        }
      },
      onClose: () => setStatus("closed"),
    });

    return () => {
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

  const assign = (playerIdToMove: string, team: "A" | "B"): void => {
    socket.current?.send({ t: "team_assign", playerId: playerIdToMove, team });
  };

  const start = (): void => {
    socket.current?.send({ t: "start_match" });
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
        <button type="button" className="ghost" onClick={() => void copyCode()}>
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
      {status === "closed" && grace === 0 ? <div className="overlay">{t("match.reconnecting")}</div> : null}
      {grace > 0 ? (
        <div className="banner" data-testid="grace-countdown">
          {t("match.reconnecting")} — {grace}s
        </div>
      ) : null}
    </div>
  );
}
