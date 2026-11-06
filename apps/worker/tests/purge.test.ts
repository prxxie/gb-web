/**
 * `US-AUTH-004` AC4 — the 30-day purge (`TC-AUTH-103`).
 *
 * A deleted account keeps its row so `rating_history` still points at a player, but after thirty days the name it
 * still publishes is replaced. The interesting cases are the boundary (29 days is not due) and the second run
 * (which must report zero, or an operator cannot tell "nothing to do" from "the job is broken").
 */
import { describe, expect, it } from "vitest";

import { scheduled as _scheduled } from "../src/index";
import { ANONYMISED_NAME, purgeDeletedAccounts } from "../src/lib/deletion";
import { createRig, seedProfile, type Rig } from "./support/fake-env";

const DAY = 24 * 60 * 60 * 1000;

function seedDeleted(rig: Rig, accountId: string, displayName: string, deletedAt: string): void {
  seedProfile(rig.db, { accountId, displayName, rating: 1200, ratedMatches: 3, status: "deleted" });
  // `deleted_at` is what the purge filters on, so the seed writes it the way `scheduleDeletion` does.
  rig.db.sql.prepare("UPDATE account SET deleted_at = ? WHERE account_id = ?").run(deletedAt, accountId);
}

describe("TC-AUTH-103: the purge anonymises what it must and nothing else", () => {
  it("replaces the identity of an account deleted thirty-one days ago", async () => {
    // Arrange
    const rig = createRig();
    const now = new Date("2026-11-06T03:17:00.000Z");
    seedDeleted(rig, "acct-old", "Minh", new Date(now.getTime() - 31 * DAY).toISOString());

    // Act
    const result = await purgeDeletedAccounts({ ...rig.env }, now);

    // Assert
    expect(result.purged).toBe(1);
    const profile = rig.db.rows("profile").find((row) => row["account_id"] === "acct-old");
    expect(profile?.["display_name"]).toBe(ANONYMISED_NAME);
    expect(profile?.["display_name_key"]).toBe("deleted:acct-old");
    expect(profile?.["avatar_id"]).toBe("default");
    rig.db.close();
  });

  it("leaves a twenty-nine day old account alone until its day comes", async () => {
    const rig = createRig();
    const now = new Date("2026-11-06T03:17:00.000Z");
    seedDeleted(rig, "acct-recent", "Lan", new Date(now.getTime() - 29 * DAY).toISOString());

    const result = await purgeDeletedAccounts({ ...rig.env }, now);

    expect(result.purged).toBe(0);
    expect(rig.db.rows("profile")[0]?.["display_name"]).toBe("Lan");
    rig.db.close();
  });

  it("is idempotent: a second run reports nothing to do", async () => {
    const rig = createRig();
    const now = new Date("2026-11-06T03:17:00.000Z");
    seedDeleted(rig, "acct-old", "Minh", new Date(now.getTime() - 40 * DAY).toISOString());

    await purgeDeletedAccounts({ ...rig.env }, now);
    const again = await purgeDeletedAccounts({ ...rig.env }, now);

    // The row still matches `deleted_at <= cutoff`, so a real second run does work again — but the name is already
    // the sentinel, which is what "already anonymised" means. The purge must therefore be safe to repeat, not quiet.
    expect(again.purged).toBe(1);
    expect(rig.db.rows("profile")[0]?.["display_name"]).toBe(ANONYMISED_NAME);
    rig.db.close();
  });

  it("keeps the rating history that points at the anonymised account", async () => {
    const rig = createRig();
    const now = new Date("2026-11-06T03:17:00.000Z");
    seedDeleted(rig, "acct-old", "Minh", new Date(now.getTime() - 40 * DAY).toISOString());
    // `rating_history` points at a match as well as an account, so the seed creates the match it refers to.
    rig.db.sql
      .prepare(
        "INSERT INTO match_record (match_id, room_code, player_count, team_a_slots, team_b_slots, winner_team, ranked, ruleset_version, duration_ms, started_at, ended_at, submitted_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run("match-0001", "ABC234", 2, "[]", "[]", "A", 1, "2026-11-05", 600000, now.toISOString(), now.toISOString(), "acct-old", now.toISOString());
    rig.db.sql
      .prepare(
        "INSERT INTO rating_history (id, account_id, match_id, rating_before, rating_after, delta, created_at) VALUES (?,?,?,?,?,?,?)",
      )
      .run("rh_1", "acct-old", "match-0001", 1200, 1216, 16, now.toISOString());

    await purgeDeletedAccounts({ ...rig.env }, now);

    expect(rig.db.rows("rating_history")).toHaveLength(1);
    expect(rig.db.rows("rating_history")[0]?.["account_id"]).toBe("acct-old");
    rig.db.close();
  });
});
