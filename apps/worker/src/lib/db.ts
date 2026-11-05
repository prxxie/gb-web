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
  /** Set when deletion was requested; the purge clock counts 30 days from here. */
  readonly deleted_at?: string | null;
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

import { ProblemError } from "./problem.js";

export interface MatchRecordRow {
  readonly match_id: string;
  readonly room_code: string;
  readonly player_count: number;
  /** JSON array of slots, e.g. `'[0,1]'`. */
  readonly team_a_slots: string;
  readonly team_b_slots: string;
  readonly winner_team: string | null;
  readonly ranked: number;
  /** Why the match was not rated (`US-RANK-001` AC6); `null` when `ranked = 1`. */
  readonly ranked_reason: string | null;
  readonly ruleset_version: string;
  readonly duration_ms: number;
  readonly started_at: string;
  readonly ended_at: string;
  readonly submitted_by: string;
  readonly created_at: string;
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
    .prepare("UPDATE account SET status = 'deleted', deleted_at = ?, last_seen_at = ? WHERE account_id = ?")
    .bind(now(), now(), accountId)
    .run();
}

export interface MatchHistoryCursor {
  readonly endedAt: string;
  readonly matchId: string;
}

export interface MatchHistoryRow {
  readonly match_id: string;
  readonly room_code: string;
  readonly ended_at: string;
  readonly winner_team: string | null;
  readonly player_count: number;
  readonly ranked: number;
  readonly ranked_reason: string | null;
  readonly ruleset_version: string;
  readonly team: string;
  readonly result: string;
  readonly damage_dealt: number;
  readonly shots_fired: number;
  readonly hits: number;
  readonly rating_before: number | null;
  readonly rating_after: number | null;
}

/** One `(ended_at, match_id)` keyset page, newest first (`matches.md`). */
export async function findHistoryPage(
  db: D1Database,
  accountId: string,
  after: MatchHistoryCursor | null,
  limit: number,
): Promise<MatchHistoryRow[]> {
  const rows = await db
    .prepare(
      `SELECT m.match_id, m.room_code, m.ended_at, m.winner_team, m.player_count, m.ranked, m.ranked_reason,
              m.ruleset_version,
              p.team, p.result, p.damage_dealt, p.shots_fired, p.hits, p.rating_before, p.rating_after
         FROM match_player p JOIN match_record m ON m.match_id = p.match_id
        WHERE p.account_id = ? ${
          after ? "AND (m.ended_at < ? OR (m.ended_at = ? AND m.match_id < ?))" : ""
        }
        ORDER BY m.ended_at DESC, m.match_id DESC LIMIT ?`,
    )
    .bind(...(after ? [accountId, after.endedAt, after.endedAt, after.matchId, limit + 1] : [accountId, limit + 1]))
    .all<MatchHistoryRow>();
  return rows.results ?? [];
}

export interface OpponentRow {
  readonly match_id: string;
  readonly team: string;
  readonly display_name: string | null;
}

/** The other players in the given matches; `display_name` is null once the profile is purged. */
export async function findOpponents(
  db: D1Database,
  matchIds: readonly string[],
  viewer: string,
): Promise<OpponentRow[]> {
  if (matchIds.length === 0) return [];
  const holes = matchIds.map(() => "?").join(", ");
  const rows = await db
    .prepare(
      `SELECT p.match_id, p.team, pr.display_name
         FROM match_player p LEFT JOIN profile pr ON pr.account_id = p.account_id
        WHERE p.match_id IN (${holes}) AND p.account_id <> ?
        ORDER BY p.match_id ASC, p.slot ASC`,
    )
    .bind(...matchIds, viewer)
    .all<OpponentRow>();
  return rows.results ?? [];
}

export function encodeHistoryCursor(cursor: MatchHistoryCursor): string {
  return encodeCursor(JSON.stringify({ v: 1, e: cursor.endedAt, m: cursor.matchId }));
}

export interface LeaderboardCursor {
  /** How many ranked rows the reader has already consumed; keeps `rank` continuous across pages. */
  readonly offset: number;
}

export interface LeaderboardEntry extends ProfileRow {
  readonly position: number;
}

export async function findMatchById(db: D1Database, matchId: string): Promise<MatchRecordRow | null> {
  return await db.prepare("SELECT * FROM match_record WHERE match_id = ?").bind(matchId).first<MatchRecordRow>();
}

/**
 * The record of one room occurrence (`idx_match_unique`). Read after a failed batch as well as before it:
 * the index is what decides a duplicate, not the read (`US-RANK-001` AC7).
 */
export async function findMatchByRoomOccurrence(
  db: D1Database,
  roomCode: string,
  startedAt: string,
): Promise<{ readonly match_id: string } | null> {
  return await db
    .prepare("SELECT match_id FROM match_record WHERE room_code = ? AND started_at = ?")
    .bind(roomCode, startedAt)
    .first<{ match_id: string }>();
}

export interface SubmissionRow {
  readonly idempotency_key: string;
  readonly account_id: string;
  readonly request_hash: string;
  readonly status_code: number;
  readonly response_body: string;
  readonly created_at: string;
}

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export async function findSubmission(db: D1Database, key: string): Promise<SubmissionRow | null> {
  return await db
    .prepare(
      "SELECT idempotency_key, account_id, request_hash, status_code, response_body, created_at FROM match_submission WHERE idempotency_key = ?",
    )
    .bind(key)
    .first<SubmissionRow>();
}

/**
 * The leaderboard page. The cursor is an opaque offset (no account id can leak from it), and the
 * query over-fetches by the offset so `position` keeps counting across pages.
 */
export async function findLeaderboard(
  db: D1Database,
  offset: number,
  limit: number,
): Promise<{ entries: LeaderboardEntry[]; hasMore: boolean }> {
  const rows = await db
    .prepare(
      `SELECT account_id, display_name, display_name_key, avatar_id, rating, rated_matches, updated_at
         FROM profile
        WHERE (SELECT status FROM account WHERE account_id = profile.account_id) = 'active'
          AND rated_matches > 0
        ORDER BY rating DESC, rated_matches DESC, account_id ASC
        LIMIT ?`,
    )
    .bind(offset + limit + 1)
    .all<ProfileRow>();
  const all = rows.results ?? [];
  return {
    entries: all.slice(offset, offset + limit).map((row, index) => ({ ...row, position: offset + index + 1 })),
    hasMore: all.length > offset + limit,
  };
}

export function encodeCursor(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The 1-based position the row would hold on the leaderboard (`US-RANK-004` AC3), or `null` when the account
 * is not ranked at all (no profile, or no rated match yet). Same ordering and exclusions as `findLeaderboard`,
 * so a rank read here always agrees with the page it is shown next to.
 */
export async function findLeaderboardRank(
  db: D1Database,
  accountId: string,
  rating: number,
  ratedMatches: number,
): Promise<number | null> {
  if (ratedMatches < 1) return null;
  const row = await db
    .prepare(
      `SELECT COUNT(*) + 1 AS ahead
         FROM profile
        WHERE (SELECT status FROM account WHERE account_id = profile.account_id) = 'active'
          AND rated_matches > 0
          AND (rating > ? OR (rating = ? AND rated_matches > ?)
               OR (rating = ? AND rated_matches = ? AND account_id < ?))`,
    )
    .bind(rating, rating, ratedMatches, rating, ratedMatches, accountId)
    .first<{ ahead: number }>();
  return row === null ? null : Number(row.ahead);
}

export function decodeCursor(cursor: string): string {
  return atob(cursor.replace(/-/g, "+").replace(/_/g, "/"));
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** Decode the JSON payload of a base64url cursor, mapping failures to the documented problems. */
function decodeCursorPayload(cursor: string): unknown {
  if (!BASE64URL.test(cursor)) throw new ProblemError("bad-request", "Cursor is not readable");
  let json: string;
  try {
    json = decodeCursor(cursor);
  } catch {
    throw new ProblemError("validation", "Cursor is not readable", [{ field: "cursor", detail: "invalid cursor" }]);
  }
  try {
    return JSON.parse(json) as unknown;
  } catch {
    throw new ProblemError("validation", "Cursor is not readable", [{ field: "cursor", detail: "invalid cursor" }]);
  }
}

export function decodeHistoryCursor(cursor: string): MatchHistoryCursor {
  const payload = decodeCursorPayload(cursor);
  const record = payload as Record<string, unknown>;
  if (record["v"] !== 1 || typeof record["e"] !== "string" || typeof record["m"] !== "string") {
    throw new ProblemError("validation", "Cursor is not readable", [{ field: "cursor", detail: "invalid cursor" }]);
  }
  return { endedAt: record["e"], matchId: record["m"] };
}

export function encodeLeaderboardCursor(cursor: LeaderboardCursor): string {
  return encodeCursor(JSON.stringify({ v: 1, o: cursor.offset }));
}

export function decodeLeaderboardCursor(cursor: string): LeaderboardCursor {
  const payload = decodeCursorPayload(cursor);
  const record = payload as Record<string, unknown>;
  const offset = record["o"];
  if (record["v"] !== 1 || typeof offset !== "number" || !Number.isInteger(offset) || offset < 0) {
    throw new ProblemError("validation", "Cursor is not readable", [{ field: "cursor", detail: "invalid cursor" }]);
  }
  return { offset };
}
