/**
 * The 30-day purge (`US-AUTH-004` AC4).
 *
 * Deleting an account is a soft delete: the row keeps its id so `rating_history` still points at a player, and
 * the Clerk user is gone, so no email survives anywhere. Thirty days later this job replaces the identity the
 * account still carries — display name, its unique key, the avatar — because a leaderboard row is public and a
 * `rated_matches` count is not a reason to keep publishing somebody's name after they asked to leave.
 */
import type { Env } from "./db.js";

/** How long a deleted account keeps its name before the purge anonymises it (`accounts.md` § DELETE /me). */
export const PURGE_AFTER_DAYS = 30;

/**
 * What every anonymised row reads as. Stable, so a support question can be answered by a single `LIKE`, and short
 * enough for the 2–16 character rule the profile column carries for a name a player typed.
 */
export const ANONYMISED_NAME = "Người chơi ẩn";

export interface PurgeResult {
  readonly purged: number;
}

/**
 * Anonymise every account deleted at least `PURGE_AFTER_DAYS` ago. Idempotent: a row that is already anonymised
 * has the sentinel name, so the second run matches nothing and the count is zero.
 */
export async function purgeDeletedAccounts(env: Env, now: Date = new Date()): Promise<PurgeResult> {
  const cutoff = new Date(now.getTime() - PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const due = await env.GBW_DB.prepare(
    "SELECT account_id FROM account WHERE status = 'deleted' AND deleted_at IS NOT NULL AND deleted_at <= ?",
  )
    .bind(cutoff)
    .all<{ account_id: string }>();
  const rows = due.results ?? [];
  for (const row of rows) {
    // The key is unique, so it has to carry the id: two players who both picked "Minh" must not collide.
    await env.GBW_DB.prepare(
      "UPDATE profile SET display_name = ?, display_name_key = ?, avatar_id = 'default', updated_at = ? WHERE account_id = ?",
    )
      .bind(ANONYMISED_NAME, `deleted:${row.account_id}`, now.toISOString(), row.account_id)
      .run();
  }
  return { purged: rows.length };
}
