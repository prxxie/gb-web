/**
 * `GET /api/v1/leaderboard` (`docs/02-reference/api/matches.md`, `US-RANK-004`).
 *
 * Ordered by rating, then experience, then account id so the order is total and a cursor can resume
 * exactly where a page ended. Cached for 30 s at the edge — a leaderboard that is half a minute old
 * is fine, and it keeps a popular page off the D1 read budget (`NFR-05`).
 */
import type { Env } from "../lib/db.js";
import { decodeLeaderboardCursor, encodeLeaderboardCursor, findLeaderboard } from "../lib/db.js";
import { ProblemError } from "../lib/problem.js";
import type { SessionToken } from "../lib/session.js";
import { limitOf } from "../lib/validation.js";

export async function leaderboard(request: Request, env: Env, session: SessionToken | null): Promise<Response> {
  const url = new URL(request.url);
  const limit = limitOf(url, 20);
  const cursorParam = url.searchParams.get("cursor");
  if (cursorParam) {
    try {
      decodeLeaderboardCursor(cursorParam);
    } catch {
      throw new ProblemError("validation", "Cursor is not readable", [{ field: "cursor", detail: "invalid cursor" }]);
    }
  }

  const rows = await findLeaderboard(env.GBW_DB, cursorParam, limit);
  const items = rows.map((row) => ({
    rank: row.position,
    accountId: row.account_id,
    displayName: row.display_name,
    avatarId: row.avatar_id,
    rating: row.rating,
    ratedMatches: row.rated_matches,
    isNew: row.rated_matches < 10,
  }));
  const last = rows[rows.length - 1];
  const nextCursor =
    rows.length === limit && last
      ? encodeLeaderboardCursor({
          rating: last.rating,
          ratedMatches: last.rated_matches,
          accountId: last.account_id,
        })
      : null;

  let you: { rank: number; rating: number } | null = null;
  if (session?.sub.kind === "account" && session.sub.accountId) {
    const row = await env.GBW_DB.prepare(
      `SELECT rating FROM profile WHERE account_id = ?`,
    )
      .bind(session.sub.accountId)
      .first<{ rating: number }>();
    if (row) {
      const ahead = await env.GBW_DB.prepare(
        `SELECT COUNT(*) AS ahead FROM profile
          WHERE (SELECT status FROM account WHERE account_id = profile.account_id) = 'active'
            AND (rating > ? OR (rating = ? AND account_id < ?))`,
      )
        .bind(row.rating, row.rating, session.sub.accountId)
        .first<{ ahead: number }>();
      you = { rank: (ahead?.ahead ?? 0) + 1, rating: row.rating };
    }
  }

  return Response.json(
    { items, next_cursor: nextCursor, has_more: nextCursor !== null, you },
    { headers: { "cache-control": "public, max-age=30", vary: "authorization,x-session-token" } },
  );
}
