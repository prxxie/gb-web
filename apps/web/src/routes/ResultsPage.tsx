/**
 * Results (`US-RANK-005`).
 *
 * The match screen writes the payload into `sessionStorage` and waits for the room's `match_recorded`, so
 * this screen renders numbers it did not compute: the per-player statistics from the match and the rating
 * deltas from the server. A reload has no payload — then the account's newest record is the only truth
 * left, and a guest without one goes home instead of seeing an invented result.
 */
import { Link, useParams } from "react-router-dom";
import { useLocale, useSession } from "../app/providers";
import { InstallPrompt } from "../components/InstallPrompt";
import type { HistoryItem } from "../lib/api";
import { outcomeText } from "../lib/outcome";
import {
  rankedReasonOf,
  viewerOf,
  type MatchResult,
  type RankedReason,
  type ResultPayload,
  type ResultPlayer,
} from "../lib/result";
import { useMatchResult } from "./results/hooks/useMatchResult";
import type { JSX } from "react";

/** Copy keys, never concatenated at runtime (`conventions.md` § 2). */
const WINNER_KEYS = { A: "results.winner.teamA", B: "results.winner.teamB" } as const;
const REASON_KEYS: Record<RankedReason, string> = {
  guest: "results.ratings.reasonGuest",
  bot: "results.ratings.reasonBot",
  abandoned: "results.ratings.reasonAbandoned",
  ruleset_mismatch: "results.ratings.reasonRuleset",
};
const RESULT_KEYS: Record<MatchResult, string> = {
  win: "results.result.win",
  loss: "results.result.loss",
  abandon: "results.result.abandon",
};

/** A signed delta, the way the screen prints it: `1284 → 1296 (+12)`. */
function ratingText(entry: { before: number; after: number; delta: number } | undefined): string {
  if (!entry) return "—";
  const sign = entry.delta >= 0 ? "+" : "";
  return `${entry.before} → ${entry.after} (${sign}${entry.delta})`;
}

/**
 * The one line a reloaded record can offer: the delta it stored, or why it has none. A rated record whose
 * delta did not survive the wire has nothing to say — printing the guest reason there would invent a fact.
 */
function recoveredRating(
  record: HistoryItem,
  t: (key: string) => string,
): string {
  if (!record.ranked) {
    // The wire is a closed union on paper only, and a record may carry no reason at all: an unknown or an
    // absent reason prints `—` rather than an invented sentence (`screens/results.md`).
    const reason = record.rankedReason;
    if (reason === null || !Object.hasOwn(REASON_KEYS, reason)) return "—";
    return t(REASON_KEYS[reason]);
  }
  if (record.ratingDelta === null) return "—";
  const sign = record.ratingDelta >= 0 ? "+" : "";
  return `${t("results.rating")}: ${sign}${record.ratingDelta}`;
}

export function ResultsPage(): JSX.Element {
  const { code = "" } = useParams<{ code: string }>();
  const { t } = useLocale();
  const { session } = useSession();
  const account = session?.subject.kind === "account" ? session : null;
  const { view, busy, error, retry, rematch } = useMatchResult(code);

  if (view.status === "loading" || view.status === "missing") {
    return (
      <div className="screen screen--center">
        <p>{t("common.loading")}</p>
      </div>
    );
  }

  if (view.status === "empty") {
    return (
      <div className="screen">
        <header className="card">
          <h1 data-testid="result-banner">{t("results.ended")}</h1>
        </header>
        <div className="row">
          <Link className="grow" to="/">
            <button type="button">{t("results.exit")}</button>
          </Link>
        </div>
        <InstallPrompt />
      </div>
    );
  }

  if (view.status === "recovered") {
    const record = view.record;
    // A reload has no winner team of its own: the viewer's own row decides which side won (`matches.md`).
    const won = record.result === "win";
    const banner =
      record.result === "abandon"
        ? t("results.ended")
        : t(WINNER_KEYS[won ? record.team : record.team === "A" ? "B" : "A"]);
    return (
      <div className="screen">
        <header className="card">
          <h1 data-testid="result-banner">{banner}</h1>
          {record.result === "abandon" ? null : <p className="muted">{t("results.ended")}</p>}
          <p className="muted" data-testid="result-recovered">
            {t("results.recovered")}
          </p>
          <p className="muted" data-testid="result-rating">
            {recoveredRating(record, t)}
          </p>
        </header>
        <p className="muted" data-testid="result-stats">
          {t("results.stats.damage")} {record.damageDealt} · {record.shotsFired} {t("results.stats.shots")} ·{" "}
          {record.hits} {t("results.stats.hits")}
        </p>
        <div className="row">
          <Link className="grow" to="/">
            <button type="button">{t("results.exit")}</button>
          </Link>
        </div>
        <InstallPrompt />
      </div>
    );
  }

  const payload: ResultPayload = view.payload;
  const recorded = payload.submission;
  const ranked = recorded?.ranked ?? false;
  const reason = rankedReasonOf(payload);
  const mine = viewerOf(payload, session?.subject.accountId ?? null);
  // Neither a record nor a failure note means the room never answered; the host may ask again (`AC6`).
  // A submission marked `unresolved` came back as a `409`: the match exists, so there is nothing to ask for.
  const unrecorded = recorded === null || recorded.failed === true;
  // Only an account can submit (`POST /matches` refuses a guest), so a guest host gets the message and no
  // button that would have to fail (`AC6`).
  // A draw or an abandonment cannot be submitted at all (`POST /matches` needs a winner), so the button
  // would only ever fail; it is offered for a decided match whose record was lost (`AC6`).
  const canRetry =
    unrecorded && payload.winnerTeam !== null && payload.kind === "online" && payload.isHost && account !== null && busy === null;

  return (
    <div className="screen">
      <header className="card">
        <h1 data-testid="result-banner">
          {payload.winnerTeam === null ? t("results.winner.draw") : t(WINNER_KEYS[payload.winnerTeam])}
        </h1>
        <p className="muted" data-testid="result-outcome">
          {outcomeText(t, payload.mode, payload.winCondition ?? null)}
        </p>
        {busy === "retry" ? (
          <p className="muted" data-testid="result-recording" aria-live="polite">
            {t("results.recording")}
          </p>
        ) : null}
        {reason !== null && Object.hasOwn(REASON_KEYS, reason) ? (
          <p data-testid="result-reason">{t(REASON_KEYS[reason])}</p>
        ) : null}
        {unrecorded && busy === null ? (
          <p className="muted" data-testid="result-record-failed">
            {t("results.recordFailed")}
          </p>
        ) : null}
        {canRetry ? (
          <button type="button" className="primary" data-testid="result-retry" onClick={() => void retry()}>
            {t("common.retry")}
          </button>
        ) : null}
        {error ? (
          <p className="muted" data-testid="result-error">
            {error}
          </p>
        ) : null}
      </header>

      <table>
        <thead>
          <tr>
            <th>{t("leaderboard.player")}</th>
            <th>{t("results.result")}</th>
            <th>{t("results.stats.damage")}</th>
            <th>{t("results.stats.shots")}</th>
            <th>{t("results.stats.hits")}</th>
            <th>{t("results.rating")}</th>
          </tr>
        </thead>
        <tbody>
          {payload.players.map((player: ResultPlayer) => {
            const isYou = mine !== null && mine.slot === player.slot;
            const rating = ranked ? recorded?.ratings.find((entry) => entry.accountId === player.accountId) : undefined;
            return (
              <tr
                key={player.slot}
                className={isYou ? "me" : undefined}
                data-testid={isYou ? "result-row-you" : `result-row-${player.slot}`}
              >
                <td>{player.displayName}</td>
                <td data-testid={`result-result-${player.slot}`}>
                  {player.result === undefined ? "—" : t(RESULT_KEYS[player.result])}
                </td>
                <td>{player.damageDealt}</td>
                <td>{player.shotsFired}</td>
                <td>{player.hits}</td>
                <td data-testid={`result-rating-${player.slot}`}>
                  {busy === "retry" ? "…" : ratingText(rating)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="row">
        <button
          type="button"
          className="grow"
          data-testid="result-rematch"
          onClick={() => void rematch()}
          // Opening a room needs the session, which the provider finishes minting a moment after the screen
          // paints; enabling the button before that only offers a press that would fail (`AC4`).
          disabled={busy !== null || session === null}
        >
          {t("results.rematch")}
        </button>
        <Link className="grow" to="/">
          <button type="button" className="ghost">
            {t("results.exit")}
          </button>
        </Link>
      </div>
      {/* The only place the install offer appears: after a match, when the player is not mid-task. */}
      <InstallPrompt />
    </div>
  );
}
