/**
 * Leaderboard (`US-RANK-004`).
 */
import { useCallback, useEffect, useState } from "react";
import { useLocale, useSession } from "../app/providers";
import { api, type LeaderboardEntry, type LeaderboardResponse } from "../lib/api";
import { useOnline } from "../lib/online.js";
import type { JSX } from "react";

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
        setError(t("main.offline"));
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const response = await api.leaderboard(next, session?.token ?? null);
        setEntries((previous) => (reset ? response.items : [...previous, ...response.items]));
        setCursor(response.next_cursor);
        setYou(response.you);
      } catch {
        setError(t("common.retry"));
      } finally {
        setLoading(false);
      }
    },
    [session?.token, t, online],
  );

  useEffect(() => {
    void load(null, true);
  }, [load]);

  return (
    <div className="screen">
      <header className="row">
        <h1>{t("main.leaderboard")}</h1>
        {you ? (
          <span className="badge">
            {t("leaderboard.you")}: #{you.rank} — {you.rating}
          </span>
        ) : null}
      </header>

      <table>
        <thead>
          <tr>
            <th>{t("leaderboard.rank")}</th>
            <th>{t("leaderboard.player")}</th>
            <th>{t("leaderboard.rating")}</th>
            <th>{t("leaderboard.matches")}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.accountId}
              className={you && entry.rank === you.rank ? "me" : undefined}
              data-testid={`leaderboard-row-${entry.rank}`}
            >
              <td>{entry.rank}</td>
              <td>
                {entry.displayName} {entry.isNew ? <span className="badge">{t("leaderboard.new")}</span> : null}
              </td>
              <td>{entry.rating}</td>
              <td>{entry.ratedMatches}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {entries.length === 0 && !loading ? <p className="muted">{t("leaderboard.empty")}</p> : null}
      {error ? <p className="muted" data-testid="leaderboard-error">{error}</p> : null}
      {cursor ? (
        <button type="button" onClick={() => void load(cursor, false)} disabled={loading}>
          {t("profile.loadMore")}
        </button>
      ) : null}
    </div>
  );
}
