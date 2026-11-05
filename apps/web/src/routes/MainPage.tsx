/**
 * Main menu (`US-MATCH-001` entry point, `docs/02-reference/screens/main.md`).
 */
import { useMemo, useState } from "react";
import { useOnline } from "../lib/online.js";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { MOBILES, MODES, MAPS, makeRoomCode, type ModeId } from "@gbw/core";
import { useLocale, useSession } from "../app/providers";
import { ApiError, api, errorMessage } from "../lib/api";
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
  // A lobby that could not be entered hands its reason back here (`LobbyPage`), so the menu can say it.
  const handedOver = (useLocation().state as { error?: string } | null)?.error ?? null;
  const [error, setError] = useState<string | null>(handedOver ? t(handedOver) : null);
  // Ordinary connectivity, not a session: the menu is usable before any account exists (`TC-AUTH-135`).
  const online = useOnline();

  const mapId = useMemo(() => MAPS[0]?.mapId ?? "map-01", []);

  const startBot = (): void => {
    // A bot match runs entirely on the device (`NFR-21`), so it needs no session and works offline.
    const plan: PlannedMatch = {
      kind: "bot",
      roomCode: makeRoomCode(() => Math.floor(Math.random() * 31)),
      localSlot: 0,
      playerId: "local",
      seats: [
        {
          slot: 0,
          team: "A",
          accountId: session?.subject.accountId ?? null,
          displayName: session?.subject.displayName ?? t("signIn.guest"),
          mobileId,
        },
        // A practice match always has an opponent, or the team check would end it on the first turn.
        { slot: 1, team: "B", accountId: null, displayName: t("match.bot"), mobileId: "mbl-04" },
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
      // The lobby reuses the seat this call created instead of creating a second one.
      sessionStorage.setItem(`gbw.room.${room.roomCode}`, room.playerId);
      navigate(`/lobby/${room.roomCode}`);
    } catch (caught) {
      setError(errorMessage(caught, t));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Join by code: the menu asks the API first, so a code nobody minted answers with a banner here instead of
   * opening a lobby that can never connect (`docs/02-reference/screens/main.md`, `US-ROOM-002` AC4).
   */
  const joinRoom = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api.roomPreview(code);
      navigate(`/lobby/${code}`);
    } catch (caught) {
      // A code nobody minted reads as "not found"; a room that has closed reads as closed (`US-ROOM-001` AC5).
      const type = caught instanceof ApiError ? caught.type : null;
      setError(
        type === "room-not-found"
          ? t("errors.room-not-found")
          : type === "room-closed"
            ? t("errors.room-closed")
            : errorMessage(caught, t),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <header className="card">
        <h1>{t("app.title")}</h1>
        <p className="muted">{t("app.tagline")}</p>
        <div className="row">
          <span className="badge">{session?.subject.kind === "account" ? session.subject.displayName : t("signIn.guest")}</span>
          {session?.subject.kind !== "account" ? (
            online ? (
              <Link to="/sign-in">{t("main.signIn")}</Link>
            ) : (
              // Offline the offer stays visible but inert, so the menu explains itself instead of
              // sending the player to a route that cannot work (`US-PWA-001` §5).
              <span className="muted" aria-disabled="true" data-testid="signin-disabled">
                {t("main.signIn")}
              </span>
            )
          ) : null}
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
        <button type="button" className="primary" data-testid="play-bot" onClick={startBot}>
          {t("main.playBot")}
        </button>
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
        <button
          type="button"
          className="primary"
          data-testid="create-room"
          onClick={() => void createRoom()}
          disabled={!session || busy || !online}
        >
          {t("main.createRoom")}
        </button>
        {online ? null : <p className="muted" data-testid="offline-rooms">{t("main.offline")}</p>}
      </section>

      <section className="card">
        <h2>{t("main.joinRoom")}</h2>
        <input
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          // Twelve, not six: the mask drops separators *after* the box has taken the keystroke, so a
          // six-character cap would eat "ab-cd 2x3" down to four letters before sanitising it.
          maxLength={12}
          placeholder={t("main.roomCode")}
          data-testid="room-code-input"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase().replace(CODE_ALPHABET, "").slice(0, 6))}
        />
        <button
          type="button"
          data-testid="join-room"
          onClick={() => void joinRoom()}
          disabled={code.length !== 6 || busy || !online}
        >
          {t("main.joinRoom")}
        </button>
        {error ? <p className="muted">{error}</p> : null}
      </section>
    </div>
  );
}
