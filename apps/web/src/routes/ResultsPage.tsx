/**
 * Results (`US-RANK-005`).
 *
 * The match payload is written by the match screen into `sessionStorage`; a cold open of this route
 * has no payload and returns home rather than inventing a result.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLocale, useSession } from "../app/providers";
import { api, errorMessage } from "../lib/api";
import { InstallPrompt } from "../components/InstallPrompt";
import type { JSX } from "react";

interface ResultPayload {
  readonly roomCode: string;
  readonly mode: string;
  readonly winnerTeam: "A" | "B" | null;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly rulesetVersion: string;
  readonly players: readonly {
    readonly slot: number;
    readonly accountId: string | null;
    readonly displayName: string;
    readonly team: "A" | "B";
    readonly damageDealt: number;
    readonly shotsFired: number;
    readonly hits: number;
    readonly result: "win" | "loss" | "abandon";
  }[];
}

interface Submission {
  readonly ranked: boolean;
  readonly rankedReason: string | null;
  readonly ratings: readonly { readonly accountId: string; readonly before: number; readonly after: number; readonly delta: number }[];
}

const KEY = "gbw.result";

export function ResultsPage(): JSX.Element {
  const { code = "" } = useParams<{ code: string }>();
  const { t } = useLocale();
  const { session } = useSession();
  const navigate = useNavigate();
  const [payload, setPayload] = useState<ResultPayload | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submitted = useRef(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) {
      navigate("/", { replace: true });
      return;
    }
    setPayload(JSON.parse(raw) as ResultPayload);
  }, [navigate]);

  useEffect(() => {
    if (!payload || !session || submitted.current) return;
    submitted.current = true;
    const idempotencyKey = `${payload.roomCode}-${payload.startedAt}`;
    void api
      .submitMatch(
        session.token,
        {
          roomCode: payload.roomCode,
          mode: payload.mode,
          winnerTeam: payload.winnerTeam,
          startedAt: new Date(payload.startedAt).toISOString(),
          endedAt: new Date(payload.endedAt).toISOString(),
          rulesetVersion: payload.rulesetVersion,
          players: payload.players,
        },
        idempotencyKey,
      )
      .then((response) => {
        setSubmission({
          ranked: response.ranked,
          rankedReason: response.rankedReason,
          ratings: [],
        });
      })
      .catch((caught: unknown) => {
        // `409` means another client already recorded it; anything else is shown, never retried twice.
        setError(errorMessage(caught, t));
      });
  }, [payload, session, t]);

  if (!payload) {
    return (
      <div className="screen screen--center">
        <p>{t("common.loading")}</p>
      </div>
    );
  }

  const ranked = submission?.ranked ?? false;
  const mine = payload.players.find((player) =>
    session?.subject.accountId ? player.accountId === session.subject.accountId : false,
  );

  return (
    <div className="screen">
      <header className="card">
        <h1 data-testid="result-banner">
          {payload.winnerTeam === null
            ? t("results.draw")
            : t("results.winner", { team: payload.winnerTeam })}
        </h1>
        <p className="muted">
          {ranked
            ? t("results.ranked")
            : t("results.unranked", {
                reason: submission?.rankedReason ?? (session?.subject.accountId ? "pending" : "guest"),
              })}
        </p>
        {error ? <p className="muted">{error}</p> : null}
      </header>

      <table>
        <thead>
          <tr>
            <th>{t("leaderboard.player")}</th>
            <th>{t("results.damage")}</th>
            <th>{t("results.shots")}</th>
            <th>{t("results.hits")}</th>
            <th>{t("results.rating")}</th>
          </tr>
        </thead>
        <tbody>
          {payload.players.map((player) => {
            const rating = submission?.ratings.find((entry) => entry.accountId === player.accountId);
            return (
              <tr key={player.slot} className={mine && mine.slot === player.slot ? "me" : undefined}>
                <td>{player.displayName}</td>
                <td>{player.damageDealt}</td>
                <td>{player.shotsFired}</td>
                <td>{player.hits}</td>
                <td>{rating ? `${rating.before} → ${rating.after} (${rating.delta >= 0 ? "+" : ""}${rating.delta})` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="row">
        <Link className="grow" to={`/lobby/${code}`}>
          <button type="button">{t("results.playAgain")}</button>
        </Link>
        <Link className="grow" to="/">
          <button type="button" className="ghost">
            {t("results.home")}
          </button>
        </Link>
      </div>
      {/* The only place the install offer appears: after a match, when the player is not mid-task. */}
      <InstallPrompt />
    </div>
  );
}
