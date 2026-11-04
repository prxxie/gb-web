/**
 * D1 access (`ADR-0003`).
 *
 * D1 owns every record that must survive a restart; the Durable Object owns only what lives for the
 * length of a room. Every statement is parameterised (never string-built), and writes that must be
 * all-or-nothing go through `batch()` — D1 runs a batch atomically, which is how "one row per
 * finished match" stays true (`US-RANK-001`).
 */

export interface Env {
  readonly GBW_DB: D1Database;
  readonly ROOMS: DurableObjectNamespace;
  readonly SESSION_TOKEN_SECRET: string;
  readonly CLERK_ISSUER: string;
  readonly TURN_KEY_ID: string;
  readonly TURN_KEY_API_TOKEN: string;
  readonly ALLOWED_ORIGINS: string;
  readonly ENVIRONMENT: string;
  readonly VERSION?: string;
}

export interface AccountRow {
  readonly account_id: string;
  readonly clerk_user_id: string;
  readonly status: string;
  readonly created_at: string;
  readonly last_seen_at: string;
}

export interface ProfileRow {
  readonly account_id: string;
  readonly display_name: string;
  readonly display_name_key: string;
  readonly avatar_id: string;
  readonly rating: number;
  readonly rated_matches: number;
  readonly updated_at: string;
}

export interface MatchRecordRow {
  readonly match_id: string;
  readonly room_code: string;
  readonly player_count: number;
  readonly team_a_slots: number;
  readonly team_b_slots: number;
  readonly winner_team: string | null;
  readonly ranked: number;
  readonly ruleset_version: string;
  readonly duration_ms: number;
  readonly started_at: string;
  readonly ended_at: string;
  readonly submitted_by: string;
  readonly created_at: string;
}

export interface LeaderboardRow extends ProfileRow {
  readonly rank?: number;
}

export const now = (): string => new Date().toISOString();

export async function findAccountByClerkId(db: D1Database, clerkUserId: string): Promise<AccountRow | null> {
  return await db
    .prepare("SELECT account_id, clerk_user_id, status, created_at, last_seen_at FROM account WHERE clerk_user_id = ?")
    .bind(clerkUserId)
    .first<AccountRow>();
}

export async function findAccountById(db: D1Database, accountId: string): Promise<AccountRow | null> {
  return await db
    .prepare("SELECT account_id, clerk_user_id, status, created_at, last_seen_at FROM account WHERE account_id = ?")
    .bind(accountId)
    .first<AccountRow>();
}

export async function findProfile(db: D1Database, accountId: string): Promise<ProfileRow | null> {
  return await db
    .prepare(
      "SELECT account_id, display_name, display_name_key, avatar_id, rating, rated_matches, updated_at FROM profile WHERE account_id = ?",
    )
    .bind(accountId)
    .first<ProfileRow>();
}

export interface NewAccount {
  readonly accountId: string;
  readonly clerkUserId: string;
  readonly displayName: string;
  readonly displayNameKey: string;
}

/** First sign-in creates the account and its profile in one batch. */
export async function createAccount(db: D1Database, input: NewAccount): Promise<void> {
  const timestamp = now();
  await db.batch([
    db
      .prepare("INSERT INTO account (account_id, clerk_user_id, status, created_at, last_seen_at) VALUES (?, ?, 'active', ?, ?)")
      .bind(input.accountId, input.clerkUserId, timestamp, timestamp),
    db
      .prepare(
        "INSERT INTO profile (account_id, display_name, display_name_key, avatar_id, rating, rated_matches, updated_at) VALUES (?, ?, ?, 'avatar-01', 1200, 0, ?)",
      )
      .bind(input.accountId, input.displayName, input.displayNameKey, timestamp),
  ]);
}

export async function touchAccount(db: D1Database, accountId: string): Promise<void> {
  await db.prepare("UPDATE account SET last_seen_at = ? WHERE account_id = ?").bind(now(), accountId).run();
}

export async function findDisplayNameOwner(db: D1Database, displayNameKey: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT account_id FROM profile WHERE display_name_key = ?")
    .bind(displayNameKey)
    .first<{ account_id: string }>();
  return row?.account_id ?? null;
}

export async function updateProfile(
  db: D1Database,
  accountId: string,
  fields: { displayName?: string; displayNameKey?: string; avatarId?: string },
): Promise<ProfileRow | null> {
  const sets: string[] = [];
  const binds: (string | number)[] = [];
  if (fields.displayName !== undefined) {
    sets.push("display_name = ?");
    binds.push(fields.displayName);
  }
  if (fields.displayNameKey !== undefined) {
    sets.push("display_name_key = ?");
    binds.push(fields.displayNameKey);
  }
  if (fields.avatarId !== undefined) {
    sets.push("avatar_id = ?");
    binds.push(fields.avatarId);
  }
  if (sets.length === 0) return await findProfile(db, accountId);
  sets.push("updated_at = ?");
  binds.push(now(), accountId);
  await db.prepare(`UPDATE profile SET ${sets.join(", ")} WHERE account_id = ?`).bind(...binds).run();
  return await findProfile(db, accountId);
}

export async function scheduleDeletion(db: D1Database, accountId: string): Promise<void> {
  await db
    .prepare("UPDATE account SET status = 'deleted', last_seen_at = ? WHERE account_id = ?")
    .bind(now(), accountId)
    .run();
}

export async function findMatches(db: D1Database, accountId: string, cursor: string | null, limit: number) {
  const after = cursor ? decodeCursor(cursor) : null;
  const rows = await db
    .prepare(
      `SELECT m.match_id, m.room_code, m.winner_team, m.ranked, m.started_at, m.ended_at,
              p.result, p.damage_dealt, p.shots_fired, p.hits, p.rating_before, p.rating_after
         FROM match_player p JOIN match_record m ON m.match_id = p.match_id
        WHERE p.account_id = ? ${after ? "AND m.ended_at < ?" : ""}
        ORDER BY m.ended_at DESC LIMIT ?`,
    )
    .bind(...(after ? [accountId, after, limit + 1] : [accountId, limit + 1]))
    .all<Record<string, unknown>>();
  return rows.results ?? [];
}

export async function findMatchById(db: D1Database, matchId: string): Promise<MatchRecordRow | null> {
  return await db.prepare("SELECT * FROM match_record WHERE match_id = ?").bind(matchId).first<MatchRecordRow>();
}

export async function findLeaderboard(
  db: D1Database,
  cursor: string | null,
  limit: number,
): Promise<readonly (ProfileRow & { position: number })[]> {
  const after = cursor ? decodeLeaderboardCursor(cursor) : null;
  const rows = await db
    .prepare(
      `SELECT account_id, display_name, display_name_key, avatar_id, rating, rated_matches, updated_at
         FROM profile
        WHERE (SELECT status FROM account WHERE account_id = profile.account_id) = 'active'
        ${after ? "AND (rating < ? OR (rating = ? AND rated_matches < ?) OR (rating = ? AND rated_matches = ? AND account_id > ?))" : ""}
        ORDER BY rating DESC, rated_matches DESC, account_id ASC
        LIMIT ?`,
    )
    .bind(
      ...(after
        ? [after.rating, after.rating, after.ratedMatches, after.rating, after.ratedMatches, after.accountId, limit]
        : [limit]),
    )
    .all<ProfileRow>();
  return (rows.results ?? []).map((row, index) => ({ ...row, position: index + 1 }));
}

export function encodeCursor(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCursor(cursor: string): string {
  return atob(cursor.replace(/-/g, "+").replace(/_/g, "/"));
}

export interface LeaderboardCursor {
  readonly rating: number;
  readonly ratedMatches: number;
  readonly accountId: string;
}

export function encodeLeaderboardCursor(cursor: LeaderboardCursor): string {
  return encodeCursor(`${cursor.rating}:${cursor.ratedMatches}:${cursor.accountId}`);
}

export function decodeLeaderboardCursor(cursor: string): LeaderboardCursor {
  const [rating, ratedMatches, accountId] = decodeCursor(cursor).split(":");
  return { rating: Number(rating), ratedMatches: Number(ratedMatches), accountId: accountId ?? "" };
}
