/**
 * Main menu (`US-MATCH-001` entry point, `docs/02-reference/screens/main.md`).
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MOBILES, MODES, MAPS, makeRoomCode, type ModeId } from "@gbw/core";
import { useLocale, useSession } from "../app/providers";
import { api } from "../lib/api";
import type { PlannedMatch } from "./MatchPage";
import type { JSX } from "react";

const CAPACITIES = [2, 4, 6, 8] as const;
const CODE_ALPHABET = /[^A-HJ-NP-Z2-9]/g;

export function MainPage(): JSX.Element {
  const { t } = useLocale();
  const { session } = useSession();
  const navigate = useNavigate();
  const [mobileId, setMobileId] = useState<string>(MOBILES[0]?.mobileId ?? "mbl-01");
  const [capacity, setCapacity] = useState<number>(2);
  const [mode, setMode] = useState<ModeId>("solo");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mapId = useMemo(() => MAPS[0]?.mapId ?? "map-01", []);

  const startBot = (): void => {
    if (!session) return;
    const plan: PlannedMatch = {
      kind: "bot",
      roomCode: makeRoomCode(() => Math.floor(Math.random() * 31)),
      localSlot: 0,
      playerId: "local",
      seats: [
        {
          slot: 0,
          team: "A",
          accountId: session.subject.accountId ?? null,
          displayName: session.subject.displayName,
          mobileId,
        },
      ],
      seed: Math.floor(Math.random() * 0xffffff),
      mapId,
      mode: "solo",
      maxPlayers: 2,
      hostPlayerId: "local",
    };
    sessionStorage.setItem("gbw.match", JSON.stringify(plan));
    navigate(`/match/${plan.roomCode}`);
  };

  const createRoom = async (): Promise<void> => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const room = await api.createRoom(session.token, {
        displayName: session.subject.displayName,
        mobileId,
        avatarId: session.subject.avatarId ?? "default",
        maxPlayers: capacity,
        mode,
        mapId,
      });
      navigate(`/lobby/${room.roomCode}`);
    } catch {
      setError(t("common.retry"));
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = (): void => {
    navigate(`/lobby/${code}`);
  };

  return (
    <div className="screen">
      <header className="card">
        <h1>{t("app.title")}</h1>
        <p className="muted">{t("app.tagline")}</p>
        <div className="row">
          <span className="badge">{session?.subject.kind === "account" ? session.subject.displayName : t("signIn.guest")}</span>
          {session?.subject.kind !== "account" ? <Link to="/sign-in">{t("main.signIn")}</Link> : null}
          <Link to="/profile">{t("main.profile")}</Link>
          <Link to="/leaderboard">{t("main.leaderboard")}</Link>
        </div>
      </header>

      <section className="card">
        <h2>{t("main.playBot")}</h2>
        <label className="row">
          <span className="muted">{t("lobby.mobile")}</span>
          <select
            data-testid="mobile-picker"
            value={mobileId}
            onChange={(event) => setMobileId(event.target.value)}
            disabled={busy}
          >
            {MOBILES.map((mobile) => (
              <option key={mobile.mobileId} value={mobile.mobileId}>
                {mobile.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="primary" data-testid="play-bot" onClick={startBot} disabled={!session}>
          {t("main.playBot")}
        </button>
        <p className="muted">{t("main.offline")}</p>
      </section>

      <section className="card">
        <h2>{t("main.createRoom")}</h2>
        <div className="row">
          <select value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} disabled={busy}>
            {CAPACITIES.map((value) => (
              <option key={value} value={value}>
                {value} — {t("main.capacity")}
              </option>
            ))}
          </select>
          <select value={mode} onChange={(event) => setMode(event.target.value as ModeId)} disabled={busy}>
            {MODES.map((entry) => (
              <option key={entry.modeId} value={entry.modeId}>
                {t(`main.mode.${entry.modeId}`)}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="primary" data-testid="create-room" onClick={() => void createRoom()} disabled={!session || busy}>
          {t("main.createRoom")}
        </button>
      </section>

      <section className="card">
        <h2>{t("main.joinRoom")}</h2>
        <input
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={6}
          placeholder={t("main.roomCode")}
          data-testid="room-code-input"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase().replace(CODE_ALPHABET, "").slice(0, 6))}
        />
        <button type="button" data-testid="join-room" onClick={joinRoom} disabled={code.length !== 6}>
          {t("main.joinRoom")}
        </button>
        {error ? <p className="muted">{error}</p> : null}
      </section>
    </div>
  );
}
