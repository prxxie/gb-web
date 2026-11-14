/**
 * Migrations — TC-FND-100, `docs/02-reference/data/README.md` ("Migrations produce exactly these
 * tables, columns, constraints and indexes"), `data/accounts.md` and `data/matches.md` (the per-table
 * column, key and index lists).
 *
 * The migration is applied to a real SQLite engine (`node:sqlite`) because the assertions are about DDL
 * semantics — CHECK enforcement, STRICT typing, foreign keys. D1 runs the same SQLite grammar; this file
 * does not prove D1 behaviour (see the report).
 */
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { beforeEach, describe, expect, it } from "vitest";

const MIGRATION = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8");
const ROOM_DIRECTORY_MIGRATION = "../migrations/0003_room_directory.sql";

interface Column {
  readonly name: string;
  readonly type: string;
  readonly notnull: number;
  readonly dflt: string | null;
}

let db: DatabaseSync;

function columns(table: string): Column[] {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((row) => {
      const record = row as Record<string, unknown>;
      return {
        name: String(record["name"]),
        type: String(record["type"]),
        notnull: Number(record["notnull"]),
        dflt: record["dflt_value"] === null ? null : String(record["dflt_value"]),
      };
    });
}

function indexes(table: string): Record<string, string[]> {
  const list = db.prepare(`PRAGMA index_list(${table})`).all() as Record<string, unknown>[];
  const result: Record<string, string[]> = {};
  for (const index of list) {
    const name = String(index["name"]);
    const parts = (db.prepare(`PRAGMA index_info(${name})`).all() as Record<string, unknown>[]).map((part) =>
      String(part["name"]),
    );
    result[name] = parts;
  }
  return result;
}

/** The documented column list, in table order: `[name, type, notNull]`. */
type Expected = readonly (readonly [string, string, boolean])[];

function shape(table: string): [string, string, boolean][] {
  return columns(table).map((column) => [column.name, column.type, column.notnull === 1]);
}

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(MIGRATION);
});

describe("TC-FND-100 : migrations produce the documented tables", () => {
  it("creates the documented tables plus the idempotency store", () => {
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as {
      name: string;
    }[]).map((row) => row.name);

    // data/README.md lists five tables; the 24 h `Idempotency-Key` replay (`api/matches.md`)
    // needs a store of its own, which no data doc describes yet.
    expect(tables.sort()).toEqual(["account", "match_player", "match_record", "match_submission", "profile", "rating_history"]);
  });

  it("gives `account` the documented columns", () => {
    const expected: Expected = [
      ["account_id", "TEXT", true],
      ["clerk_user_id", "TEXT", true],
      ["status", "TEXT", true],
      ["created_at", "TEXT", true],
      ["last_seen_at", "TEXT", true],
      ["deleted_at", "TEXT", false],
    ];

    expect(shape("account")).toEqual(expected);
    expect(columns("account").find((column) => column.name === "status")?.dflt).toBe("'active'");
  });

  it("gives `profile` the documented columns", () => {
    const expected: Expected = [
      ["account_id", "TEXT", true],
      ["display_name", "TEXT", true],
      ["display_name_key", "TEXT", true],
      ["avatar_id", "TEXT", true],
      ["rating", "INTEGER", true],
      ["rated_matches", "INTEGER", true],
      ["current_room_code", "TEXT", false],
      ["updated_at", "TEXT", true],
    ];

    expect(shape("profile")).toEqual(expected);
  });

  it("documents the profile defaults the schema must carry", () => {
    const defaults = Object.fromEntries(columns("profile").map((column) => [column.name, column.dflt]));

    expect(defaults["avatar_id"]).toBe("'default'");
    expect(defaults["rating"]).toBe("1200");
    expect(defaults["rated_matches"]).toBe("0");
  });

  it("gives `match_record` the documented columns", () => {
    const expected: Expected = [
      ["match_id", "TEXT", true],
      ["room_code", "TEXT", true],
      ["player_count", "INTEGER", true],
      ["team_a_slots", "TEXT", true],
      ["team_b_slots", "TEXT", true],
      ["winner_team", "TEXT", true],
      ["ranked", "INTEGER", true],
      ["ruleset_version", "TEXT", true],
      ["duration_ms", "INTEGER", true],
      ["started_at", "TEXT", true],
      ["ended_at", "TEXT", true],
      ["submitted_by", "TEXT", true],
      ["delay_table", "TEXT", true],
      ["created_at", "TEXT", true],
    ];

    expect(shape("match_record")).toEqual(expected);
  });

  it("gives `match_player` the documented columns, including `team`", () => {
    const expected: Expected = [
      ["match_id", "TEXT", true],
      ["account_id", "TEXT", true],
      ["slot", "INTEGER", true],
      ["team", "TEXT", true],
      ["result", "TEXT", true],
      ["damage_dealt", "INTEGER", true],
      ["shots_fired", "INTEGER", true],
      ["hits", "INTEGER", true],
      ["rating_before", "INTEGER", false],
      ["rating_after", "INTEGER", false],
    ];

    expect(shape("match_player")).toEqual(expected);
  });

  it("gives `rating_history` the documented columns", () => {
    const expected: Expected = [
      ["id", "TEXT", true],
      ["account_id", "TEXT", true],
      ["match_id", "TEXT", true],
      ["rating_before", "INTEGER", true],
      ["rating_after", "INTEGER", true],
      ["delta", "INTEGER", true],
      ["created_at", "TEXT", true],
    ];

    expect(shape("rating_history")).toEqual(expected);
  });
});

describe("TC-FND-100 : migrations produce the documented indexes", () => {
  const has = (table: string, wanted: readonly string[]): boolean =>
    Object.values(indexes(table)).some((parts) => parts.join(",") === wanted.join(","));

  it("indexes account by (status, last_seen_at)", () => {
    expect(has("account", ["status", "last_seen_at"])).toBe(true);
  });

  it("carries the leaderboard index on profile", () => {
    expect(has("profile", ["rating", "rated_matches", "account_id"])).toBe(true);
  });

  it("indexes match_record by (created_at) and (room_code, created_at)", () => {
    expect(has("match_record", ["created_at"])).toBe(true);
    expect(has("match_record", ["room_code", "created_at"])).toBe(true);
  });

  it("indexes match_player by (account_id, match_id) for the history page", () => {
    expect(has("match_player", ["account_id", "match_id"])).toBe(true);
  });

  it("indexes rating_history by (account_id, created_at)", () => {
    expect(has("rating_history", ["account_id", "created_at"])).toBe(true);
  });
});

describe("TC-ROOM-722 / TC-ROOM-724: the public room directory migration", () => {
  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(MIGRATION);
    db.exec(readFileSync(new URL("../migrations/0002_ranked_reason.sql", import.meta.url), "utf8"));
    db.exec(readFileSync(new URL(ROOM_DIRECTORY_MIGRATION, import.meta.url), "utf8"));
  });

  it("creates the documented room_directory columns", () => {
    const expected: Expected = [
      ["room_code", "TEXT", true],
      ["status", "TEXT", true],
      ["mode", "TEXT", true],
      ["map_id", "TEXT", true],
      ["seated", "INTEGER", true],
      ["max_players", "INTEGER", true],
      ["is_private", "INTEGER", true],
      ["joinable", "INTEGER", true],
      ["created_at", "TEXT", true],
      ["updated_at", "TEXT", true],
      ["expires_at", "TEXT", true],
    ];

    expect(shape("room_directory")).toEqual(expected);
  });

  it("indexes the public filter/order and expiry lookup", () => {
    const indexParts = Object.values(indexes("room_directory"));
    expect(indexParts).toContainEqual(["is_private", "status", "updated_at", "room_code"]);
    expect(indexParts).toContainEqual(["expires_at"]);
  });

  it("refuses an unknown public status and a private flag outside 0/1", () => {
    expect(() =>
      db.exec(`INSERT INTO room_directory
        (room_code, status, mode, map_id, seated, max_players, is_private, joinable, created_at, updated_at, expires_at)
        VALUES ('ABC234', 'ended', 'solo', 'map-01', 1, 2, 0, 0,
                '2026-11-14T00:00:00Z', '2026-11-14T00:00:00Z', '2026-11-14T00:10:00Z')`),
    ).toThrow(/CHECK/i);
    expect(() =>
      db.exec(`INSERT INTO room_directory
        (room_code, status, mode, map_id, seated, max_players, is_private, joinable, created_at, updated_at, expires_at)
        VALUES ('ABC235', 'waiting', 'solo', 'map-01', 1, 2, 2, 1,
                '2026-11-14T00:00:00Z', '2026-11-14T00:00:00Z', '2026-11-14T00:10:00Z')`),
    ).toThrow(/CHECK/i);
  });
});

describe("the CHECK constraints the docs list", () => {
  function seed(): void {
    db.exec(`INSERT INTO account (account_id, clerk_user_id, status, created_at, last_seen_at)
             VALUES ('acc_1', 'user_1', 'active', '2026-11-04T00:00:00Z', '2026-11-04T00:00:00Z')`);
  }

  function seedProfile(displayName: string): void {
    db.prepare(
      `INSERT INTO profile (account_id, display_name, display_name_key, updated_at)
       VALUES ('acc_1', ?, ?, '2026-11-04T00:00:00Z')`,
    ).run(displayName, displayName.toLowerCase());
  }

  function seedMatch(): void {
    db.exec(`INSERT INTO match_record (match_id, room_code, player_count, team_a_slots, team_b_slots, winner_team,
                                       ranked, ruleset_version, duration_ms, started_at, ended_at, submitted_by, created_at)
             VALUES ('m1', 'K7M2QX', 2, 1, 1, 'A', 1, '2026-11-05', 60000,
                     '2026-11-04T09:00:00Z', '2026-11-04T09:01:00Z', 'acc_1', '2026-11-04T09:01:00Z')`);
  }

  it("rejects a display name shorter than 2 characters", () => {
    seed();
    expect(() => seedProfile("B")).toThrow(/CHECK/i);
    expect(() => seedProfile("a".repeat(17))).toThrow(/CHECK/i);
  });

  it("rejects an out-of-range rating and a negative rated_matches count", () => {
    seed();
    seedProfile("Bao Tran");

    expect(() => db.exec("UPDATE profile SET rating = 4001 WHERE account_id = 'acc_1'")).toThrow(/CHECK/i);
    expect(() => db.exec("UPDATE profile SET rated_matches = -1 WHERE account_id = 'acc_1'")).toThrow(/CHECK/i);
  });

  it("rejects an unknown account status", () => {
    seed();
    expect(() => db.exec("UPDATE account SET status = 'gone'")).toThrow(/CHECK/i);
  });

  it("rejects an unknown match result and an unknown winner", () => {
    seed();
    seedProfile("Bao Tran");
    seedMatch();

    expect(() =>
      db.exec(`INSERT INTO match_player (match_id, account_id, slot, team, result)
               VALUES ('m1', 'acc_1', 0, 'A', 'draw')`),
    ).toThrow(/CHECK/i);
    expect(() => db.exec("UPDATE match_record SET winner_team = 'C' WHERE match_id = 'm1'")).toThrow(/CHECK/i);
  });

  it("rejects a player_count outside 2–8", () => {
    seed();
    expect(() =>
      db.exec(`INSERT INTO match_record (match_id, room_code, player_count, team_a_slots, team_b_slots, winner_team,
                                         ranked, ruleset_version, duration_ms, started_at, ended_at, submitted_by, created_at)
               VALUES ('m9', 'K7M2QX', 9, 1, 1, 'A', 1, '2026-11-05', 60000,
                       '2026-11-04T09:00:00Z', '2026-11-04T09:01:00Z', 'acc_1', '2026-11-04T09:01:00Z')`),
    ).toThrow(/CHECK/i);
  });

  it("rejects a profile whose account does not exist", () => {
    expect(() => seedProfile("Bao Tran")).toThrow(/FOREIGN KEY/i);
  });
});

describe("deletion relations the docs describe", () => {
  function seedAll(): void {
    db.exec(`INSERT INTO account (account_id, clerk_user_id, status, created_at, last_seen_at)
             VALUES ('acc_1', 'user_1', 'active', '2026-11-04T00:00:00Z', '2026-11-04T00:00:00Z')`);
    db.exec(`INSERT INTO profile (account_id, display_name, display_name_key, updated_at, rating)
             VALUES ('acc_1', 'Bao Tran', 'bao tran', '2026-11-04T00:00:00Z', 1234)`);
    db.exec(`INSERT INTO match_record (match_id, room_code, player_count, team_a_slots, team_b_slots, winner_team,
                                       ranked, ruleset_version, duration_ms, started_at, ended_at, submitted_by, created_at)
             VALUES ('m1', 'K7M2QX', 2, '[0]', '[1]', 'A', 1, '2026-11-05', 60000,
                     '2026-11-04T09:00:00Z', '2026-11-04T09:01:00Z', 'acc_1', '2026-11-04T09:01:00Z')`);
    db.exec(`INSERT INTO match_player (match_id, account_id, slot, team, result, rating_before, rating_after)
             VALUES ('m1', 'acc_1', 0, 'A', 'win', 1234, 1250)`);
    db.exec(`INSERT INTO rating_history (account_id, match_id, rating_before, rating_after, delta, created_at)
             VALUES ('acc_1', 'm1', 1234, 1250, 16, '2026-11-04T09:01:00Z')`);
  }

  it("cascades the profile away with the account", () => {
    seedAll();

    db.exec("DELETE FROM account WHERE account_id = 'acc_1'");

    expect(db.prepare("SELECT COUNT(*) AS n FROM profile").get()).toMatchObject({ n: 0 });
  });

  it("keeps match_player and rating_history for the audit trail (TC-AUTH-103)", () => {
    seedAll();

    db.exec("DELETE FROM account WHERE account_id = 'acc_1'");

    expect(db.prepare("SELECT COUNT(*) AS n FROM match_player").get()).toMatchObject({ n: 1 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM rating_history").get()).toMatchObject({ n: 1 });
  });
});
