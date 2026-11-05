/**
 * `GET /api/v1/leaderboard` (`docs/02-reference/api/matches.md`, `US-RANK-004`).
 *
 * Ordered by rating, then experience, then account id so the order is total. The cursor is an opaque,
 * offset-only token: it must not carry an account id, because the leaderboard is public and privacy
 * (`NFR-13`) treats a joinable identifier as a leak. Cached for 30 s at the edge (`NFR-05`).
 */
import type { Env } from "../lib/db.js";
import { decodeLeaderboardCursor, encodeLeaderboardCursor, findLeaderboard } from "../lib/db.js";
import type { SessionToken } from "../lib/session.js";
import { cursorOf, limitOf } from "../lib/validation.js";

export async function leaderboard(request: Request, env: Env, _session: SessionToken | null): Promise<Response> {
  const url = new URL(request.url);
  const limit = limitOf(url, 20);
  const rawCursor = cursorOf(url);
  const offset = rawCursor ? decodeLeaderboardCursor(rawCursor).offset : 0;

  const { entries, hasMore } = await findLeaderboard(env.GBW_DB, offset, limit);
  const items = entries.map((row) => ({
    rank: row.position,
    displayName: row.display_name,
    avatarId: row.avatar_id,
    rating: row.rating,
    ratedMatches: row.rated_matches,
  }));
  const nextCursor = hasMore ? encodeLeaderboardCursor({ offset: offset + items.length }) : null;

  return Response.json(
    { items, next_cursor: nextCursor, has_more: nextCursor !== null },
    { headers: { "cache-control": "public, max-age=30", vary: "authorization,x-session-token" } },
  );
}
