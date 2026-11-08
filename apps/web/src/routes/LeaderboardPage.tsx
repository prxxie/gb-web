/**
 * Leaderboard (`US-RANK-004`, `screens/leaderboard.md`).
 *
 * One public page of the ranking, ordered by the server, plus the caller's own position in the same response
 * (`you`). Nothing here asks `GET /me`: a signed-in reader's rank arrives with the list, so a signed-out visit
 * makes exactly one request, and a stale token degrades to `you: null` instead of a refusal.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLocale, useSession } from "../app/providers";
import { api, type LeaderboardEntry, type LeaderboardResponse } from "../lib/api";
import { useOnline } from "../lib/online.js";
import type { JSX } from "react";

/** `screens/leaderboard.md` § Fields: a name is shown as text and clipped to this many characters. */
const NAME_LIMIT = 16;

/** A grapheme is what a reader calls a character: a ZWJ emoji sequence must not be cut in half. */
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * `displayName` as the table prints it: literal text (React escapes it) and at most {@link NAME_LIMIT}
 * graphemes, with an ellipsis only when something was dropped (`AC5`).
 */
export function leaderboardName(name: string): string {
  const graphemes = Array.from(GRAPHEMES.segment(name), (part) => part.segment);
  return graphemes.length <= NAME_LIMIT ? name : `${graphemes.slice(0, NAME_LIMIT).join("")}…`;
}

/** `screens/leaderboard.md` § Fields: below ten rated matches the rating has too small a sample to read. */
const NEW_PLAYER = 10;

export function LeaderboardPage(): JSX.Element {
  const { t } = useLocale();
  const { session } = useSession();
  const [entries, setEntries] = useState<readonly LeaderboardEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [you, setYou] = useState<LeaderboardResponse["you"]>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const online = useOnline();

  const load = useCallback(
    async (next: string | null, reset: boolean) => {
      // Offline the ranking is not cached anywhere, so say so instead of failing a request (`US-PWA-001` §5).
      if (!online) {
        setLoading(false);
        setError(t("leaderboard.offline"));
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const response = await api.leaderboard(next, session?.token ?? null);
        setEntries((previous) => {
          if (reset) return response.items;
          // `LIMIT/OFFSET` can repeat a rank when a rating changed between two requests (`screens/leaderboard.md` §
          // Notes): a repeated rank is dropped, so one stranger's row is never tinted as the caller's.
          const seen = new Set(previous.map((entry) => entry.rank));
          return [...previous, ...response.items.filter((entry) => !seen.has(entry.rank))];
        });
        setCursor(response.next_cursor);
        setYou(response.you);
      } catch {
        setError(t("leaderboard.error"));
      } finally {
        setLoading(false);
      }
    },
    [session?.token, t, online],
  );

  useEffect(() => {
    void load(null, true);
  }, [load]);

  // A rank alone does not identify a row: two requests are two 30-second snapshots, so the caller is the entry
  // that matches both the rank and the rating `you` was computed from.
  const isCaller = (entry: LeaderboardEntry): boolean =>
    you !== null && entry.rank === you.rank && entry.rating === you.rating;
  // The footer only exists while the caller's row is on a page they have not fetched (`AC3`).
  const ownRowOnPage = entries.some(isCaller);

  return (
    <div className="screen">
      <header className="row">
        <h1>{t("leaderboard.title")}</h1>
      </header>

      <table>
        <caption className="sr-only">{t("leaderboard.title")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("leaderboard.rank")}</th>
            <th scope="col">{t("leaderboard.player")}</th>
            <th scope="col">{t("leaderboard.rating")}</th>
            <th scope="col">{t("leaderboard.matches")}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const mine = isCaller(entry);
            return (
              <tr
                key={`${entry.rank}:${entry.displayName}`}
                className={mine ? "me" : undefined}
                aria-current={mine ? "true" : undefined}
                data-testid={`leaderboard-row-${entry.rank}`}
              >
                <td>{entry.rank}</td>
                <td>
                  {leaderboardName(entry.displayName)}{" "}
                  {entry.ratedMatches < NEW_PLAYER ? (
                    <span className="badge">{t("leaderboard.newPlayer")}</span>
                  ) : null}
                </td>
                <td>{entry.rating}</td>
                <td>{entry.ratedMatches}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {entries.length === 0 && !loading && !error ? (
        <p className="muted">
          {t("leaderboard.empty")}{" "}
          <Link to="/">{t("leaderboard.emptyCta")}</Link>
        </p>
      ) : null}
      {error ? (
        <p className="muted" role="alert" data-testid="leaderboard-error">
          {error}{" "}
          <button type="button" onClick={() => void load(null, true)} disabled={loading}>
            {t("common.retry")}
          </button>
        </p>
      ) : null}
      {cursor ? (
        <button type="button" onClick={() => void load(cursor, false)} disabled={loading}>
          {t("leaderboard.loadMore")}
        </button>
      ) : null}
      {you !== null && !ownRowOnPage ? (
        <div className="leaderboard__you" data-testid="leaderboard-you">
          <span className="muted">{t("leaderboard.yourRank")}</span>
          <strong>#{you.rank}</strong>
          <span>{you.rating}</span>
        </div>
      ) : null}
    </div>
  );
}
