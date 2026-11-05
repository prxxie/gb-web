/**
 * The Worker's bindings, fabricated for the route-level tests.
 *
 * Two of the three bindings are real rather than mocked: `GBW_DB` is a `node:sqlite` database with the
 * committed migrations applied, so a test asserts against the SQL the Worker ships instead of against a
 * fixture; `ROOMS` builds actual `Room` Durable Objects, so `POST /rooms` exercises the same join path
 * the socket does. Only the hibernation `DurableObjectState` is a double — a test process has no
 * `acceptWebSocket`, and no route under test opens a socket.
 *
 * Not collected: the vitest glob only picks up `*.test.ts`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import type { Env } from "../../src/lib/db.js";
import { mintSession, type SessionSubject } from "../../src/lib/session.js";
import { Room } from "../../src/room-do.js";

export const TEST_SECRET = "route-harness-secret";
export const TEST_ORIGIN = "https://gbw.test";
const MIGRATIONS = fileURLToPath(new URL("../../migrations/", import.meta.url));

/** Every committed migration, in filename order — the same sequence `wrangler d1 migrations apply` runs. */
function schema(): string {
  return readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(`${MIGRATIONS}${file}`, "utf8"))
    .join("\n");
}

export interface RunResult {
  readonly success: boolean;
  readonly meta: { readonly changes: number | bigint; readonly lastInsertRowid: number | bigint };
}

/** One `prepare()`d statement, with the `bind/all/first/run` surface the Worker calls. */
export class FakeStatement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly text: string,
    private readonly params: readonly unknown[] = [],
  ) {}

  bind(...params: readonly unknown[]): FakeStatement {
    return new FakeStatement(this.db, this.text, params);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const rows = this.rows<T>();
    return rows[0] ?? null;
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }> {
    return { results: this.rows<T>(), success: true };
  }

  async run(): Promise<RunResult> {
    const info = this.db.prepare(this.text).run(...(this.params as never[]));
    return { success: true, meta: { changes: info.changes, lastInsertRowid: info.lastInsertRowid } };
  }

  private rows<T>(): T[] {
    return this.db.prepare(this.text).all(...(this.params as never[])) as T[];
  }
}

/** `D1Database` over an in-memory SQLite database, batched inside one transaction like D1 does. */
export class FakeDb {
  readonly sql: DatabaseSync;
  readonly batches: number = 0;

  constructor(ddl: string = schema()) {
    this.sql = new DatabaseSync(":memory:");
    this.sql.exec(ddl);
  }

  prepare(text: string): FakeStatement {
    return new FakeStatement(this.sql, text);
  }

  async batch(statements: readonly FakeStatement[]): Promise<RunResult[]> {
    (this as { batches: number }).batches += 1;
    this.sql.exec("BEGIN");
    try {
      const results: RunResult[] = [];
      for (const statement of statements) results.push(await statement.run());
      this.sql.exec("COMMIT");
      return results;
    } catch (error) {
      this.sql.exec("ROLLBACK");
      throw error;
    }
  }

  /** Every row of `table`, for the "was it written" half of an assertion. */
  rows<T = Record<string, unknown>>(table: string): T[] {
    return this.sql.prepare(`SELECT * FROM ${table}`).all() as T[];
  }

  close(): void {
    this.sql.close();
  }
}

/** The slice of `DurableObjectState` a lazily built `Room` touches during hydration. */
class RouteContext {
  readonly storage = new RouteStorage();
  private blocking: Promise<unknown> = Promise.resolve();

  blockConcurrencyWhile<T>(run: () => Promise<T>): Promise<T> {
    const started = run();
    this.blocking = started;
    return started;
  }

  acceptWebSocket(): void {
    /* no route under test opens a socket */
  }

  ready(): Promise<unknown> {
    return this.blocking;
  }
}

class RouteStorage {
  private readonly values = new Map<string, unknown>();
  alarmAt: number | null = null;

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }

  async deleteAll(): Promise<void> {
    this.values.clear();
    this.alarmAt = null;
  }

  async getAlarm(): Promise<number | null> {
    return this.alarmAt;
  }

  async setAlarm(at: number): Promise<void> {
    this.alarmAt = at;
  }
}

/** A Durable Object namespace that hands out real `Room` instances, one per room code. */
export class FakeRooms {
  readonly byCode = new Map<string, Room>();
  private readonly contexts = new Map<string, RouteContext>();
  private readonly secret: string;

  constructor(secret: string = TEST_SECRET) {
    this.secret = secret;
  }

  readonly namespace = {
    idFromName: (name: string) => name,
    get: (code: string) => ({
      fetch: async (input: string, init?: RequestInit): Promise<Response> => this.roomFetch(code, input, init),
    }),
  } as unknown as DurableObjectNamespace;

  private async roomFetch(code: string, input: string, init?: RequestInit): Promise<Response> {
    const room = await this.room(code);
    return room.fetch(new Request(input, init));
  }

  /** The live object for a code, hydrated and ready to be driven directly. */
  async room(code: string): Promise<Room> {
    const existing = this.byCode.get(code);
    if (existing) return existing;
    const ctx = new RouteContext();
    const room = new Room(ctx as unknown as ConstructorParameters<typeof Room>[0], {
      SESSION_TOKEN_SECRET: this.secret,
    } as unknown as ConstructorParameters<typeof Room>[1]);
    await ctx.ready();
    this.contexts.set(code, ctx);
    this.byCode.set(code, room);
    return room;
  }
}

export interface TestRig {
  readonly env: Env;
  readonly db: FakeDb;
  readonly rooms: FakeRooms;
  /** `fetch` through the Worker's real router (`apps/worker/src/index.ts`). */
  request(
    method: string,
    path: string,
    init?: { body?: unknown; token?: string; headers?: Record<string, string> },
  ): Promise<Response>;
  /** A 60-minute session token for the subject, already formatted for the `Authorization` header. */
  token(subject: SessionSubject): Promise<string>;
}

export interface RigOptions {
  readonly turnKeyId?: string;
  readonly turnKeyToken?: string;
}

/** A fresh Worker environment per test: new database, new Durable Objects, empty rate-limit buckets. */
export function createRig(options: RigOptions = {}): TestRig {
  const db = new FakeDb();
  const rooms = new FakeRooms();
  const env = {
    GBW_DB: db as unknown as Env["GBW_DB"],
    ROOMS: rooms.namespace,
    SESSION_TOKEN_SECRET: TEST_SECRET,
    ENVIRONMENT: "test",
    ALLOWED_ORIGINS: "https://gbw.example",
    ...(options.turnKeyId ? { TURN_KEY_ID: options.turnKeyId } : {}),
    ...(options.turnKeyToken ? { TURN_KEY_API_TOKEN: options.turnKeyToken } : {}),
  } as unknown as Env;
  return {
    env,
    db,
    rooms,
    async request(method, path, init = {}) {
      const headers: Record<string, string> = {};
      if (init.token) headers["authorization"] = `Bearer ${init.token}`;
      if (init.body !== undefined) headers["content-type"] = "application/json";
      Object.assign(headers, init.headers ?? {});
      const { handleFetch } = await import("../../src/index.js");
      return handleFetch(
        new Request(`${TEST_ORIGIN}/api/v1${path}`, {
          method,
          headers,
          ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        }),
        env,
      );
    },
    async token(subject) {
      const { token } = await mintSession(subject, TEST_SECRET);
      return token;
    },
  };
}

export function accountSubject(accountId: string): SessionSubject {
  return { kind: "account", accountId, guestId: null };
}

export function guestSubject(guestId: string): SessionSubject {
  return { kind: "guest", accountId: null, guestId };
}

export interface SeedProfile {
  readonly accountId: string;
  readonly displayName: string;
  readonly rating?: number;
  readonly ratedMatches?: number;
  readonly avatarId?: string;
  readonly status?: "active" | "deleted";
}

/** Insert one account + profile row pair, the two tables `GET /leaderboard` and `POST /matches` read. */
export function seedProfile(db: FakeDb, seed: SeedProfile): void {
  const now = "2026-11-05T00:00:00.000Z";
  db.sql
    .prepare("INSERT INTO account (account_id, clerk_user_id, status, created_at, last_seen_at) VALUES (?,?,?,?,?)")
    .run(seed.accountId, `clerk_${seed.accountId}`, seed.status ?? "active", now, now);
  db.sql
    .prepare(
      "INSERT INTO profile (account_id, display_name, display_name_key, avatar_id, rating, rated_matches, updated_at) VALUES (?,?,?,?,?,?,?)",
    )
    .run(
      seed.accountId,
      seed.displayName,
      seed.displayName.toLowerCase(),
      seed.avatarId ?? "av-01",
      seed.rating ?? 1200,
      seed.ratedMatches ?? 0,
      now,
    );
}
