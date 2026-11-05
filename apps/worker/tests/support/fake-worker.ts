/**
 * Binding doubles for the HTTP tests (`apps/worker/tests/*.test.ts`).
 *
 * The Worker's routes are pure functions over three bindings: D1, the `Room` Durable Object and the
 * environment vars. This module fakes all three so a route test exercises the real handler, the real
 * SQL and the real response mapping without a workerd process.
 *
 * D1 is faked with a tiny statement interpreter rather than a SQL engine: every statement the worker
 * sends is recognised by shape, and an unrecognised statement throws instead of returning a canned
 * row. A query that changes shape therefore fails the test that depended on it — which is the point.
 * The CHECK/UNIQUE rules of `apps/worker/migrations/0001_init.sql` are enforced here so a test that
 * inserts an invalid row fails the way D1 would.
 */
import type { Env } from "../../src/lib/db.js";

export const TEST_SECRET = "test-session-secret-not-a-real-one";
export const TEST_ISSUER = "https://clerk.test";
export const TEST_ORIGIN = "https://gbw.example";

export type Row = Record<string, string | number | null>;

const normalise = (sql: string): string => sql.replace(/\s+/g, " ").trim();

/** Split a SQL list on commas, respecting single quotes and parentheses. */
function splitList(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quoted = false;
  for (const char of value) {
    if (char === "'") quoted = !quoted;
    if (!quoted && char === "(") depth += 1;
    if (!quoted && char === ")") depth -= 1;
    if (!quoted && depth === 0 && char === ",") {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim() !== "") parts.push(current.trim());
  return parts;
}

interface ExecResult {
  readonly rows: Row[];
  readonly first: Row | null;
  readonly changes: number;
}

export class FakeD1 {
  readonly account = new Map<string, Row>();
  readonly profile = new Map<string, Row>();
  readonly matchRecord = new Map<string, Row>();
  readonly matchPlayer: Row[] = [];
  readonly ratingHistory: Row[] = [];
  readonly matchSubmission = new Map<string, Row>();
  /** Every statement the worker sent, normalised — how a test proves "one batch, two inserts". */
  readonly statements: string[] = [];
  batches = 0;
  /** Force a statement to fail, to exercise the 500 path. */
  failWhen: ((sql: string) => boolean) | null = null;

  prepare(sql: string): unknown {
    return new FakeStatement(this, normalise(sql), []);
  }

  async batch(statements: unknown[]): Promise<{ success: boolean; results: unknown[] }> {
    this.batches += 1;
    const snapshot = this.snapshot();
    const results: unknown[] = [];
    try {
      for (const statement of statements) results.push((statement as FakeStatement).runSync());
    } catch (error) {
      this.restore(snapshot);
      throw error;
    }
    return { success: true, results };
  }

  async exec(): Promise<void> {
    throw new Error("FakeD1.exec is not used by the worker");
  }

  /** Seed a registered player: account + profile, the same pair `createAccount` writes. */
  seedPlayer(input: {
    readonly accountId: string;
    readonly clerkUserId?: string;
    readonly displayName?: string;
    readonly avatarId?: string;
    readonly rating?: number;
    readonly ratedMatches?: number;
    readonly status?: "active" | "deleted";
  }): void {
    const timestamp = "2026-11-01T00:00:00.000Z";
    this.account.set(input.accountId, {
      account_id: input.accountId,
      clerk_user_id: input.clerkUserId ?? `clerk_${input.accountId}`,
      status: input.status ?? "active",
      created_at: timestamp,
      last_seen_at: timestamp,
    });
    const displayName = input.displayName ?? `Player ${input.accountId.slice(0, 4)}`;
    this.profile.set(input.accountId, {
      account_id: input.accountId,
      display_name: displayName,
      display_name_key: displayName.toLowerCase(),
      avatar_id: input.avatarId ?? "avatar-01",
      rating: input.rating ?? 1200,
      rated_matches: input.ratedMatches ?? 0,
      updated_at: timestamp,
    });
  }

  execute(sql: string, args: readonly unknown[]): ExecResult {
    const statement = normalise(sql);
    if (this.failWhen?.(statement)) throw new Error("D1_ERROR: simulated failure");
    this.statements.push(statement);
    if (/^INSERT INTO /i.test(statement)) return this.insert(statement, args);
    if (/^UPDATE /i.test(statement)) return this.update(statement, args);
    if (/^SELECT /i.test(statement)) return this.select(statement, args);
    throw new Error(`FakeD1 has no handler for: ${statement}`);
  }

  private insert(statement: string, args: readonly unknown[]): ExecResult {
    // `ON CONFLICT … DO UPDATE` is an upsert: the fake keeps the later row, which is the same outcome.
    const [head = ""] = statement.split(/ ON CONFLICT /i);
    const match = /^INSERT INTO (\w+) \(([^)]+)\) VALUES \((.+)\)$/i.exec(head.trim());
    if (!match) throw new Error(`FakeD1 cannot parse insert: ${statement}`);
    const [, table = "", columns = "", values = ""] = match;
    let next = 0;
    const row: Row = {};
    for (const [index, column] of splitList(columns).entries()) {
      const raw = splitList(values)[index] ?? "";
      row[column] = raw === "?" ? ((args[next++] as string | number | null) ?? null) : this.literal(raw);
    }
    this.check(table, row);
    if (table === "match_player" || table === "rating_history") {
      (table === "match_player" ? this.matchPlayer : this.ratingHistory).push(row);
    } else if (table === "match_submission") {
      this.matchSubmission.set(String(row["idempotency_key"]), row);
    } else {
      this.store(table).set(String(row["account_id"] ?? row["match_id"]), row);
    }
    return { rows: [], first: null, changes: 1 };
  }

  private update(statement: string, args: readonly unknown[]): ExecResult {
    const match = /^UPDATE (\w+) SET (.+) WHERE (.+)$/i.exec(statement);
    if (!match) throw new Error(`FakeD1 cannot parse update: ${statement}`);
    const [, table = "", assignments = "", where = ""] = match;
    const sets = splitList(assignments);
    // WHERE placeholders come last, after the SET placeholders.
    const bound = sets.reduce((total, set) => total + (set.match(/\?/g)?.length ?? 0), 0);
    const target = [...this.store(table).values()].filter((row) => this.matches(row, where, args.slice(bound)));
    let index = 0;
    const computed = sets.map((set) => {
      const [column = "", expression = ""] = set.split("=").map((part) => part.trim());
      if (expression === "?") return { column, value: ((args[index++] ?? null) as string | number | null) };
      if (expression === `${column} + 1`) return { column, increment: true as const };
      return { column, value: this.literal(expression) };
    });
    for (const row of target) {
      for (const set of computed) {
        row[set.column] =
          "increment" in set ? Number(row[set.column] ?? 0) + 1 : (set.value as string | number | null);
      }
    }
    if (table === "profile") {
      for (const row of target) this.check("profile", row);
    }
    return { rows: [], first: null, changes: target.length };
  }

  private select(statement: string, args: readonly unknown[]): ExecResult {
    const one = (row: Row | undefined): ExecResult => ({ rows: row ? [row] : [], first: row ?? null, changes: 0 });

    if (statement.includes("FROM account WHERE clerk_user_id = ?")) {
      return one([...this.account.values()].find((row) => row["clerk_user_id"] === args[0]));
    }
    if (statement.includes("FROM account WHERE account_id = ?")) {
      return one(this.account.get(String(args[0])));
    }
    if (statement.startsWith("SELECT account_id FROM profile WHERE display_name_key = ?")) {
      const owner = [...this.profile.values()].find((row) => row["display_name_key"] === args[0]);
      return one(owner ? { account_id: owner["account_id"] as string } : undefined);
    }
    if (statement.includes("FROM profile WHERE account_id = ?")) {
      if (statement.includes("COUNT(*) AS rooms")) {
        const profile = this.profile.get(String(args[0]));
        const live = profile && String(profile["updated_at"]) > String(args[1]) ? 1 : 0;
        return one({ rooms: live });
      }
      return one(this.profile.get(String(args[0])));
    }
    if (statement.includes("AS matches") && statement.includes("FROM match_player")) {
      const rows = this.matchPlayer.filter((row) => row["account_id"] === args[0]);
      return one({
        matches: rows.length,
        wins: rows.filter((row) => row["result"] === "win").length,
        losses: rows.filter((row) => row["result"] === "loss").length,
        abandons: rows.filter((row) => row["result"] === "abandon").length,
        best_damage: rows.reduce((max, row) => Math.max(max, Number(row["damage_dealt"] ?? 0)), 0),
      });
    }
    if (statement.includes("AS ahead")) {
      const [, rating = 0, sameRating = 0, accountId = ""] = args;
      const ahead = this.activeProfiles().filter(
        (row) => Number(row["rating"]) > Number(rating) || (Number(row["rating"]) === Number(sameRating) && String(row["account_id"]) < String(accountId)),
      );
      return one({ ahead: ahead.length });
    }
    if (statement.includes("FROM profile WHERE (SELECT status")) {
      if (statement.startsWith("SELECT rating FROM profile")) {
        const profile = this.profile.get(String(args[0]));
        return one(profile ? { rating: profile["rating"] as number } : undefined);
      }
      const cursor = statement.includes("rating < ?");
      let rows = this.activeProfiles();
      if (cursor) {
        const [, , , , , , limit] = [0, ...args];
        const [rating, , ratedMatches, , , accountId] = args.map((value) => value) as [number, never, number, never, never, string];
        rows = rows.filter(
          (row) =>
            Number(row["rating"]) < Number(rating) ||
            (Number(row["rating"]) === Number(rating) && Number(row["rated_matches"]) < Number(ratedMatches)) ||
            (Number(row["rating"]) === Number(rating) &&
              Number(row["rated_matches"]) === Number(ratedMatches) &&
              String(row["account_id"]) > accountId),
        );
        void limit;
      }
      rows.sort(
        (left, right) =>
          Number(right["rating"]) - Number(left["rating"]) ||
          Number(right["rated_matches"]) - Number(left["rated_matches"]) ||
          String(left["account_id"]).localeCompare(String(right["account_id"])),
      );
      const limit = Number(args[args.length - 1] ?? 20);
      return { rows: rows.slice(0, limit), first: null, changes: 0 };
    }
    if (statement.includes("FROM match_submission WHERE idempotency_key = ?")) {
      return one(this.matchSubmission.get(String(args[0])));
    }
    if (statement.startsWith("SELECT match_id FROM match_record WHERE room_code = ? AND started_at = ?")) {
      const found = [...this.matchRecord.values()].find(
        (row) => row["room_code"] === args[0] && row["started_at"] === args[1],
      );
      return one(found ? { match_id: found["match_id"] as string } : undefined);
    }
    if (statement.includes("FROM match_player p LEFT JOIN profile pr")) {
      const matchIds = args.slice(0, -1).map(String);
      const viewer = String(args[args.length - 1]);
      const rows = this.matchPlayer
        .filter((row) => matchIds.includes(String(row["match_id"])) && String(row["account_id"]) !== viewer)
        .sort((left, right) =>
          String(left["match_id"]).localeCompare(String(right["match_id"])) ||
          Number(left["slot"]) - Number(right["slot"]),
        )
        .map((row) => ({
          match_id: row["match_id"] as string,
          team: row["team"] as string,
          display_name: (this.profile.get(String(row["account_id"]))?.["display_name"] ?? null) as string | null,
        }));
      return { rows, first: null, changes: 0 };
    }
    if (statement.startsWith("SELECT match_id FROM match_record WHERE match_id = ?")) {
      const record = this.matchRecord.get(String(args[0]));
      return one(record ? { match_id: record["match_id"] as string } : undefined);
    }
    if (statement.startsWith("SELECT request_hash")) {
      // `match_record` has no `request_hash` column: D1 answers "no such column", it does not return null.
      throw new Error("D1_ERROR: no such column: request_hash");
    }
    if (statement.startsWith("SELECT * FROM match_record WHERE match_id = ?")) {
      return one(this.matchRecord.get(String(args[0])));
    }
    if (statement.includes("FROM match_player p JOIN match_record m")) {
      const cursor = statement.includes("m.ended_at < ?");
      const accountId = String(args[0]);
      const limit = Number(args[args.length - 1] ?? 20);
      let rows = this.matchPlayer
        .filter((player) => player["account_id"] === accountId)
        .map((player) => ({ ...this.matchRecord.get(String(player["match_id"])), ...player }));
      if (cursor) {
        rows = rows.filter(
          (row) =>
            String(row["ended_at"]) < String(args[1]) ||
            (String(row["ended_at"]) === String(args[1]) && String(row["match_id"]) < String(args[2])),
        );
      }
      rows.sort(
        (left, right) =>
          String(right["ended_at"]).localeCompare(String(left["ended_at"])) ||
          String(right["match_id"]).localeCompare(String(left["match_id"])),
      );
      return { rows: rows.slice(0, limit), first: null, changes: 0 };
    }
    throw new Error(`FakeD1 has no handler for: ${statement}`);
  }

  private activeProfiles(): Row[] {
    return [...this.profile.values()].filter((row) => this.account.get(String(row["account_id"]))?.["status"] === "active");
  }

  private store(table: string): Map<string, Row> {
    switch (table) {
      case "account":
        return this.account;
      case "profile":
        return this.profile;
      case "match_record":
        return this.matchRecord;
      default:
        throw new Error(`FakeD1 has no table ${table}`);
    }
  }

  private matches(row: Row, where: string, args: readonly unknown[]): boolean {
    let index = 0;
    return splitList(where.replace(/ AND /gi, ",")).every((clause) => {
      const equality = /^"?(.+?)"? = (\?|'.*'|-?\d+)$/.exec(clause.trim());
      if (equality) {
        const [, column = "", raw = ""] = equality;
        const expected = raw === "?" ? args[index++] : this.literal(raw);
        return row[column.replace(/"/g, "")] === expected;
      }
      const comparison = /^"?(.+?)"? > (\?|'.*'|-?\d+)$/.exec(clause.trim());
      if (comparison) {
        const [, column = "", raw = ""] = comparison;
        const expected = raw === "?" ? args[index++] : this.literal(raw);
        return String(row[column.replace(/"/g, "")] ?? "") > String(expected);
      }
      throw new Error(`FakeD1 cannot evaluate WHERE clause: ${clause}`);
    });
  }

  private check(table: string, row: Row): void {
    const text = (value: unknown): string => String(value ?? "");
    const number = (value: unknown): number => Number(value ?? 0);
    if (table === "account") {
      if (!["active", "deleted", "purged"].includes(text(row["status"]))) throw new Error("CHECK constraint failed: status");
      for (const existing of this.account.values()) {
        if (existing["account_id"] !== row["account_id"] && existing["clerk_user_id"] === row["clerk_user_id"]) {
          throw new Error("UNIQUE constraint failed: account.clerk_user_id");
        }
      }
      return;
    }
    if (table === "profile") {
      const displayName = text(row["display_name"]);
      if (displayName.trim().length < 2 || displayName.trim().length > 16) {
        throw new Error("CHECK constraint failed: length(display_name) BETWEEN 2 AND 16");
      }
      if (number(row["rating"]) < 0 || number(row["rating"]) > 4000) throw new Error("CHECK constraint failed: rating");
      if (number(row["rated_matches"]) < 0) throw new Error("CHECK constraint failed: rated_matches");
      if (!this.account.has(text(row["account_id"]))) throw new Error("FOREIGN KEY constraint failed: profile.account_id");
      for (const existing of this.profile.values()) {
        if (existing["account_id"] !== row["account_id"] && existing["display_name_key"] === row["display_name_key"]) {
          throw new Error("UNIQUE constraint failed: profile.display_name_key");
        }
      }
      return;
    }
    if (table === "match_player") {
      if (text(row["team"]) !== "A" && text(row["team"]) !== "B") throw new Error("CHECK constraint failed: team");
      if (!["win", "loss", "abandon"].includes(text(row["result"]))) throw new Error("CHECK constraint failed: result");
      if (number(row["shots_fired"]) < 0 || number(row["hits"]) < 0 || number(row["hits"]) > number(row["shots_fired"])) {
        throw new Error("CHECK constraint failed: hits BETWEEN 0 AND shots_fired");
      }
      return;
    }
    if (table === "rating_history") {
      for (const column of ["rating_before", "rating_after"]) {
        if (number(row[column]) < 0 || number(row[column]) > 4000) throw new Error(`CHECK constraint failed: ${column}`);
      }
      return;
    }
    if (table === "match_record") {
      if (number(row["player_count"]) < 2 || number(row["player_count"]) > 8) throw new Error("CHECK constraint failed: player_count");
      if (number(row["duration_ms"]) < 60_000 || number(row["duration_ms"]) > 1_800_000) {
        throw new Error("CHECK constraint failed: duration_ms");
      }
      for (const existing of this.matchRecord.values()) {
        if (existing["room_code"] === row["room_code"] && existing["started_at"] === row["started_at"]) {
          throw new Error("UNIQUE constraint failed: match_record.room_code, match_record.started_at");
        }
      }
      return;
    }
  }

  private literal(raw: string): string | number | null {
    const token = raw.trim();
    if (token === "null" || token === "NULL") return null;
    if (/^'.*'$/.test(token)) return token.slice(1, -1);
    if (/^-?\d+(\.\d+)?$/.test(token)) return Number(token);
    throw new Error(`FakeD1 cannot parse literal: ${token}`);
  }

  private snapshot(): {
    account: Map<string, Row>;
    profile: Map<string, Row>;
    matchRecord: Map<string, Row>;
    matchPlayer: Row[];
    ratingHistory: Row[];
    matchSubmission: Map<string, Row>;
  } {
    return {
      account: new Map([...this.account].map(([key, row]) => [key, { ...row }])),
      profile: new Map([...this.profile].map(([key, row]) => [key, { ...row }])),
      matchRecord: new Map([...this.matchRecord].map(([key, row]) => [key, { ...row }])),
      matchPlayer: this.matchPlayer.map((row) => ({ ...row })),
      ratingHistory: this.ratingHistory.map((row) => ({ ...row })),
      matchSubmission: new Map([...this.matchSubmission].map(([key, row]) => [key, { ...row }])),
    };
  }

  private restore(snapshot: ReturnType<FakeD1["snapshot"]>): void {
    this.account.clear();
    for (const [key, row] of snapshot.account) this.account.set(key, row);
    this.profile.clear();
    for (const [key, row] of snapshot.profile) this.profile.set(key, row);
    this.matchRecord.clear();
    for (const [key, row] of snapshot.matchRecord) this.matchRecord.set(key, row);
    this.matchPlayer.length = 0;
    this.matchPlayer.push(...snapshot.matchPlayer);
    this.ratingHistory.length = 0;
    this.ratingHistory.push(...snapshot.ratingHistory);
    this.matchSubmission.clear();
    for (const [key, row] of snapshot.matchSubmission) this.matchSubmission.set(key, row);
  }
}

class FakeStatement {
  constructor(
    private readonly db: FakeD1,
    private readonly sql: string,
    private readonly args: readonly unknown[],
  ) {}

  bind(...args: unknown[]): FakeStatement {
    return new FakeStatement(this.db, this.sql, args);
  }

  runSync(): ExecResult {
    return this.db.execute(this.sql, this.args);
  }

  async first<T>(): Promise<T | null> {
    return this.runSync().first as T | null;
  }

  async run(): Promise<{ success: boolean; meta: { changes: number } }> {
    const result = this.runSync();
    return { success: true, meta: { changes: result.changes } };
  }

  async all<T>(): Promise<{ results: T[]; success: boolean; meta: Record<string, unknown> }> {
    return { results: this.runSync().rows as T[], success: true, meta: {} };
  }
}

export interface RoomCall {
  readonly path: string;
  readonly method: string;
  readonly body: unknown;
}

export interface FakeRooms {
  readonly namespace: Env["ROOMS"];
  readonly calls: RoomCall[];
}

export interface FakeRoomsOptions {
  /** The state the room answers for `GET /state`. */
  readonly state?: Record<string, unknown>;
  /** Override the response to `GET /ws` (the logging/CORS path that never throws). */
  readonly wsResponse?: () => Response;
  /** Answer `GET /state` with a specific response, e.g. a 410 from a closed room. */
  readonly stateResponse?: () => Response;
  /** Make every call fail, to exercise the 500 path. */
  readonly failure?: Error;
}

/** A `ROOMS` binding whose stub answers `join`, `state` and `ws` like `room-do.ts` does. */
export function fakeRooms(options: FakeRoomsOptions = {}): FakeRooms {
  const calls: RoomCall[] = [];
  const state = options.state ?? {
    roomCode: "ABC234",
    status: "lobby",
    // A room the stubs answer for has somebody in it: an empty roster is "no such room" (`rooms.md` 404).
    members: [{ playerId: "p1", accountId: "acc_1", guestId: null, role: "host", slot: 0, displayName: "Host" }],
    hostPlayerId: null,
    settings: { maxPlayers: 4, mode: "solo", mapId: "map-01", isPrivate: false },
  };
  const stub = {
    async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
      calls.push({ path: url.pathname, method, body });
      if (options.failure) throw options.failure;
      if (url.pathname === "/join" && body) {
        const settings = (body["settings"] as Record<string, unknown> | undefined) ?? state["settings"];
        return Response.json({ room: { settings, status: "lobby" }, member: { playerId: body["playerId"] } });
      }
      if (url.pathname === "/state" && options.stateResponse) return options.stateResponse();
      if (url.pathname === "/state") return Response.json(state);
      if (url.pathname === "/ws") {
        if (options.wsResponse) return options.wsResponse();
        return new Response(null, { status: 101, webSocket: null } as ResponseInit & { webSocket: null });
      }
      return Response.json({ type: "room-not-found" }, { status: 404 });
    },
  };
  const namespace = {
    idFromName: (name: string) => name,
    get: () => stub,
  };
  return { namespace: namespace as unknown as Env["ROOMS"], calls };
}

export interface TestEnvOptions {
  readonly db?: FakeD1;
  readonly rooms?: FakeRooms;
  readonly overrides?: Partial<Record<keyof Env, unknown>>;
}

export interface TestEnv {
  readonly env: Env;
  readonly db: FakeD1;
  readonly rooms: FakeRooms;
}

export function testEnv(options: TestEnvOptions = {}): TestEnv {
  const db = options.db ?? new FakeD1();
  const rooms = options.rooms ?? fakeRooms();
  const env = {
    GBW_DB: db as unknown as Env["GBW_DB"],
    ROOMS: rooms.namespace,
    SESSION_TOKEN_SECRET: TEST_SECRET,
    CLERK_ISSUER: TEST_ISSUER,
    TURN_KEY_ID: "",
    TURN_KEY_API_TOKEN: "",
    ALLOWED_ORIGINS: TEST_ORIGIN,
    ENVIRONMENT: "test",
    ...options.overrides,
  } as unknown as Env;
  return { env, db, rooms };
}

/** Capture the one JSON log line per request (`NFR-24`). The Worker writes with `console.info`. */
export function captureLog(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = console.info;
  console.info = (line: unknown) => {
    lines.push(String(line));
  };
  return {
    lines,
    restore: () => {
      console.info = original;
    },
  };
}

/** Parse captured lines, ignoring anything that is not a log record. */
export function logRecords(lines: readonly string[]): Record<string, unknown>[] {
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

export function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
