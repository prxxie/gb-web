/**
 * `GET /api/v1/leaderboard` (`docs/02-reference/api/matches.md`, `US-RANK-004`).
 *
 * Ordered by rating, then experience, then account id so the order is total. The cursor is an opaque,
 * offset-only token: it must not carry an account id, because the leaderboard is public and privacy
 * (`NFR-13`) treats a joinable identifier as a leak. Cached for 30 s at the edge (`NFR-05`), which is why
 * `you` is computed from the same 30 s snapshot rather than from a second, fresher query.
 */
import type { Env } from "../lib/db.js";
import {
  decodeLeaderboardCursor,
  encodeLeaderboardCursor,
  findLeaderboard,
  findLeaderboardRank,
  findProfile,
} from "../lib/db.js";
import type { SessionToken } from "../lib/session.js";
import { cursorOf, limitOf } from "../lib/validation.js";

/**
 * The signed-in reader's own row (`AC3`), whether or not it falls on this page. Signed out, or with no rated
 * match yet, it is `null` and the page shows the list alone (`AC7`).
 */
async function you(
  env: Env,
  session: SessionToken | null,
): Promise<{ rank: number; rating: number } | null> {
  const accountId = session?.sub.kind === "account" ? session.sub.accountId : null;
  if (!accountId) return null;
  const profile = await findProfile(env.GBW_DB, accountId);
  if (!profile) return null;
  const rank = await findLeaderboardRank(env.GBW_DB, accountId, profile.rating, profile.rated_matches);
  return rank === null ? null : { rank, rating: profile.rating };
}

export async function leaderboard(request: Request, env: Env, session: SessionToken | null): Promise<Response> {
  const url = new URL(request.url);
  // `matches.md` § GET /leaderboard: default page 20, maximum 100.
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
    { items, next_cursor: nextCursor, has_more: nextCursor !== null, you: await you(env, session) },
    { headers: { "cache-control": "public, max-age=30", vary: "authorization,x-session-token" } },
  );
}
