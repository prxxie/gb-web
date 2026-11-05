/**
 * Test harness for the `Room` Durable Object (`apps/worker/src/room-do.ts`).
 *
 * The object runs on the hibernation API, so a test cannot use a real socket. This file fabricates the
 * two things the object talks to — a `DurableObjectState`-shaped context with an in-memory storage and a
 * fake `WebSocket` — and drives the public entry points (`fetch`, `webSocketMessage`, `webSocketClose`,
 * `alarm`) exactly as workerd would. Private members are reached through one narrow cast, never by
 * editing `src` (`AGENTS.md` rule 6).
 *
 * Not collected: the vitest glob only picks up `*.test.ts`.
 */
import type { RoomMember, RoomState, Snapshot } from "@gbw/core";
import { mintSession, type SessionSubject } from "../../src/lib/session";
import { Room } from "../../src/room-do";

export const HARNESS_SECRET = "harness-secret-value";
export const ROOM_ORIGIN = "https://room.gbw.test";
export const ROOM_CODE = "ABCD23";

type WireFrame = Record<string, unknown> & { readonly t?: string };

/** Close call recorded by a fake socket; the DO closes instead of throwing. */
interface CloseCall {
  readonly code: number;
  readonly reason: string;
}

/** Stands in for one end of a `WebSocketPair`. */
export class FakeSocket {
  readyState = 1;
  readonly sent: string[] = [];
  readonly closes: CloseCall[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  close(code = 1000, reason = ""): void {
    this.closes.push({ code, reason });
    this.readyState = 3;
  }

  frames(): WireFrame[] {
    return this.sent.map((raw) => JSON.parse(raw) as WireFrame);
  }

  framesOf(t: string): WireFrame[] {
    return this.frames().filter((frame) => frame["t"] === t);
  }

  errors(): WireFrame[] {
    return this.framesOf("error");
  }

  clear(): void {
    this.sent.length = 0;
  }
}

/** The `WebSocketPair` the DO constructs; `Object.values` must yield `[client, server]`. */
class FakeWebSocketPair {
  readonly 0: FakeSocket;
  readonly 1: FakeSocket;

  constructor() {
    this[0] = new FakeSocket();
    this[1] = new FakeSocket();
  }
}

/** Node's `Response` refuses `status: 101`; the DO only needs the object to exist. */
class UpgradeResponse {
  readonly status: number;
  readonly webSocket: FakeSocket | null;

  constructor(_body: unknown, init?: { status?: number; webSocket?: FakeSocket }) {
    this.status = init?.status ?? 200;
    this.webSocket = init?.webSocket ?? null;
  }
}

/** `ctx.storage` as the DO uses it: async text keys plus a single alarm. */
export class FakeStorage {
  readonly values = new Map<string, unknown>();
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

  keys(): string[] {
    return [...this.values.keys()];
  }
}

/** The slice of `DurableObjectState` the DO touches. */
export class FakeContext {
  readonly storage = new FakeStorage();
  readonly accepted: FakeSocket[] = [];
  private blocking: Promise<unknown> = Promise.resolve();

  acceptWebSocket(socket: unknown): void {
    this.accepted.push(socket as FakeSocket);
  }

  blockConcurrencyWhile<T>(run: () => Promise<T>): Promise<T> {
    const started = run();
    this.blocking = started;
    return started;
  }

  /** The constructor restores from storage inside `blockConcurrencyWhile`; tests await it here. */
  async ready(): Promise<void> {
    await this.blocking;
  }
}

export interface HarnessPlayer {
  readonly playerId: string;
  readonly accountId?: string | null;
  readonly guestId?: string | null;
  readonly displayName?: string;
}

export class RoomHarness {
  readonly ctx = new FakeContext();
  readonly do: Room;
  private readonly origin: string | null;
  private readonly members = new Map<string, RoomMember>();

  /**
   * `origin` is the public base the object posts a finished match to (`US-RANK-001`). Tests that reach
   * `POST /matches` pass it and stub `fetch`; everything else leaves it out, so the request never happens.
   */
  constructor(options: { readonly origin?: string } = {}) {
    this.origin = options.origin ?? null;
    this.do = new Room(
      this.ctx as unknown as ConstructorParameters<typeof Room>[0],
      { SESSION_TOKEN_SECRET: HARNESS_SECRET } as unknown as ConstructorParameters<typeof Room>[1],
    );
  }

  async ready(): Promise<void> {
    await this.ctx.ready();
  }

  /** The roster the object holds, read through the one cast the harness is allowed. */
  state(): RoomState {
    return (this.do as unknown as { room: RoomState }).room;
  }

  storageKeys(): string[] {
    return this.ctx.storage.keys();
  }

  alarmAt(): number | null {
    return this.ctx.storage.alarmAt;
  }

  /** `POST …/join`, the pre-socket step the web app performs (`room-do.ts` `handleJoin`). */
  async join(player: HarnessPlayer): Promise<RoomMember> {
    const body = {
      playerId: player.playerId,
      accountId: player.accountId ?? null,
      guestId: player.guestId ?? (player.accountId ? null : `guest-${player.playerId}`),
      displayName: player.displayName ?? player.playerId,
      avatarId: "av-01",
      mobileId: "mbl-01",
      roomCode: ROOM_CODE,
    };
    const response = await this.do.fetch(
      new Request(`${ROOM_ORIGIN}/rooms/${ROOM_CODE}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    if (response.status !== 200) throw new Error(`join ${player.playerId} failed with ${response.status}`);
    const payload = (await response.json()) as { member: RoomMember | null };
    if (!payload.member) throw new Error(`join ${player.playerId} returned no member`);
    this.members.set(player.playerId, payload.member);
    return payload.member;
  }

  /** Opens the socket upgrade and hands back the server half the DO accepted. */
  async upgrade(): Promise<FakeSocket> {
    const globals = globalThis as unknown as { WebSocketPair: unknown; Response: unknown };
    const realPair = globals.WebSocketPair;
    const realResponse = globals.Response;
    globals.WebSocketPair = FakeWebSocketPair;
    globals.Response = UpgradeResponse;
    try {
      const response = (await this.do.fetch(
        new Request(`${ROOM_ORIGIN}/rooms/${ROOM_CODE}/ws`, {
          headers: this.origin === null ? { upgrade: "websocket" } : { upgrade: "websocket", "x-room-origin": this.origin },
        }),
      )) as unknown as UpgradeResponse;
      if (response.status !== 101) throw new Error(`upgrade failed with ${response.status}`);
      const server = this.ctx.accepted[this.ctx.accepted.length - 1];
      if (!server) throw new Error("upgrade did not accept a socket");
      return server;
    } finally {
      globals.WebSocketPair = realPair;
      globals.Response = realResponse;
    }
  }

  /** Upgrade plus `auth`, using a token minted for the member's identity. */
  async connect(playerId: string): Promise<FakeSocket> {
    const member = this.members.get(playerId);
    if (!member) throw new Error(`join ${playerId} before connecting`);
    const subject: SessionSubject = member.accountId
      ? { kind: "account", accountId: member.accountId, guestId: null }
      : { kind: "guest", accountId: null, guestId: member.guestId ?? `guest-${playerId}` };
    const { token } = await mintSession(subject, HARNESS_SECRET);
    const socket = await this.upgrade();
    await this.message(socket, { t: "auth", token });
    return socket;
  }

  async message(socket: FakeSocket, frame: unknown): Promise<void> {
    const raw = typeof frame === "string" ? frame : JSON.stringify(frame);
    await this.do.webSocketMessage(socket as unknown as Parameters<Room["webSocketMessage"]>[0], raw);
  }

  async close(socket: FakeSocket): Promise<void> {
    await this.do.webSocketClose(socket as unknown as Parameters<Room["webSocketClose"]>[0]);
  }

  async alarm(): Promise<void> {
    await this.do.alarm();
  }

  clearAll(sockets: Iterable<FakeSocket>): void {
    for (const socket of sockets) socket.clear();
  }

  /**
   * Join, connect, seat teams `A/B/A/B` and start: the four-slot lobby every `playing` test needs.
   * Returns the sockets by player id.
   */
  async startPlaying(ids: readonly string[]): Promise<Map<string, FakeSocket>> {
    for (const id of ids) await this.join({ playerId: id, accountId: `acct-${id}` });
    const sockets = new Map<string, FakeSocket>();
    for (const id of ids) sockets.set(id, await this.connect(id));
    const hostId = ids[0];
    if (!hostId) throw new Error("startPlaying needs at least one player");
    const host = sockets.get(hostId);
    if (!host) throw new Error("startPlaying lost the host socket");
    await this.message(host, {
      t: "team_assign",
      assignments: ids.map((id, index) => ({ playerId: id, team: index % 2 === 0 ? "A" : "B" })),
    });
    await this.message(host, { t: "start_match" });
    return sockets;
  }
}

/** Smallest payload that satisfies `parseSnapshot` and the `Snapshot` shape. */
export function makeSnapshot(seq: number, hostGeneration = 1): Snapshot {
  return {
    seq,
    hostGeneration,
    turn: { activeSlot: 0, number: 1, round: 1, deadlineAt: 0, extended: false, actedSlots: [] },
    weather: { wind: { magnitude: 0, directionDeg: 0, sector: 0 }, rolledAtRound: 1 },
    players: [
      {
        slot: 0,
        hp: 100,
        shield: 0,
        energy: 0,
        x: 0,
        y: 0,
        facing: 1 as const,
        delay: 0,
        eliminated: false,
        weaponSlot: 0 as const,
      },
    ],
    projectiles: [],
    scores: { score: { A: 0, B: 0 }, activeTeam: "A", jewels: [] },
    status: "playing",
    winnerTeam: null,
  };
}
