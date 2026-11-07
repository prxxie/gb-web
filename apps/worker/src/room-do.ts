/**
 * `Room` Durable Object — the signalling hub for one room (`ADR-0004`).
 *
 * It owns nothing that decides the game: the host client runs the rules engine and streams snapshots,
 * and this object only keeps the roster, relays WebRTC offers/answers, stores the last snapshot so a
 * migrating host can adopt it, and enforces the room's lifecycle (idle sweep, 20 s grace, 24 h cap).
 * That split is what keeps the free plan viable — a room costs messages, not CPU-seconds of physics.
 *
 * Wire protocol: `docs/02-reference/api/signaling.md`.
 */
import {
  PING_INTERVAL_MS,
  PING_MISSES_BEFORE_GRACE,
  RULESET_VERSION,
  canStart,
  createRoom,
  electHost,
  isModeId,
  isRoomExpired,
  joinRoom,
  MOBILES_BY_ID,
  leaveRoom,
  markDisconnected,
  parseClientFrame,
  setRoomSettings,
  type ErrorCode,
  type JoinRequest,
  type LoadoutEntry,
  isForfeited,
  type MatchEndFrame,
  type Team,
  type MatchStat,
  type RoomMember,
  type RoomSettings,
  type RoomState,
  type Snapshot,
  type WireSnapshot,
  expandWire,
  isWireSnapshot,
  packSnapshot,
  TUNABLES,
} from "@gbw/core";
import type { Env } from "./lib/db.js";
import { verifySession, type SessionSubject } from "./lib/session.js";

const AUTH_TIMEOUT_MS = 5_000;
const CLOSE_UNAUTHENTICATED = 4401;
const CLOSE_ROOM_NOT_FOUND = 4404;
const CLOSE_ROOM_FULL = 4409;
const CLOSE_ROOM_CLOSED = 4410;
const CLOSE_RATE_LIMITED = 4429;

/**
 * The status the same refusal would carry on the REST side, so a log line and a problem body agree.
 * `problem.ts` cannot answer this: the frame codes include `payload-too-large` and the roster codes,
 * which no REST route returns.
 */
const FRAME_STATUS: Record<ErrorCode, number> = {
  "bad-request": 400,
  "unsupported-message": 422,
  "payload-too-large": 413,
  "rate-limited": 429,
  "not-host": 403,
  "invalid-state": 409,
  "room-not-full": 409,
  "not-enough-players": 422,
  "teams-not-balanced": 422,
  "peer-not-connected": 404,
  "snapshot-too-large": 413,
  internal: 500,
};

interface SocketMeta {
  playerId: string | null;
  authed: boolean;
  /** Identity the Worker verified for this connection; the client cannot set these headers (`NFR-11`). */
  accountId: string | null;
  guestId: string | null;
  /** The session the socket authenticated with, kept in memory only, used to record the match as the host. */
  token: string | null;
  /** Last heartbeat received; three missed ones move the member to `grace` (`US-ROOM-002` AC6). */
  lastPingAt: number;
  /** Per-second frame counters, reset when the window rolls over (`signaling.md` § 5). */
  window: { readonly startedAt: number; ping: number; signal: number; chat: number };
}

/** `signaling.md` § 5: what one socket may send per second, per frame kind. */
const BUDGETS = { ping: 10, signal: 20, chat: 2 } as const;
/** How long a promoted host has to prove it is live before the next candidate is tried (`US-ROOM-005` AC3). */
const HOST_MIGRATION_RECHECK_MS = 5_000;

/** Core refusal → the code the client branches on (`docs/02-reference/api/README.md`). */
const START_REJECTIONS: Record<NonNullable<ReturnType<typeof canStart>>, ErrorCode> = {
  "not-host": "not-host",
  "not-lobby": "invalid-state",
  "not-full": "room-not-full",
  "not-enough-players": "not-enough-players",
  "teams-unbalanced": "teams-not-balanced",
};

/** A mobile id is a stat line the host imports, so only a shipped `mbl-NN` may enter the roster. */
function isMobileId(value: string): boolean {
  return MOBILES_BY_ID.has(value);
}

export class Room implements DurableObject {
  private room: RoomState;
  private readonly sockets = new Map<string, WebSocket>();
  private readonly meta = new WeakMap<WebSocket, SocketMeta>();
  /** When `match_started` was sent; the match id and duration come from it, not from the client. */
  private matchStartedAt: number | null = null;
  /** Public origin of the Worker that opened the socket, so `match_end` can call `POST /api/v1/matches`. */
  private origin: string | null = null;
  /** What was written to storage, so a reconnect does not rewrite an unchanging constant (`N8`). */
  private persistedOrigin: string | null = null;
  /**
   * Candidates already tried since the host vanished (`US-ROOM-005` AC3). Empty means "no migration in
   * flight"; a non-empty list means the next alarm must check that the promoted host is actually live.
   */
  private hostCheck: readonly string[] = [];
  /** The `match_recorded` payload, kept so a host retry after a network blip can be answered, not refused. */
  private recorded: { matchId: string; winnerTeam: "A" | "B" | null; ranked: boolean; ratings: readonly { accountId: string; before: number; after: number; delta: number }[]; players: readonly { slot: number; result: "win" | "loss" | "abandon" }[] } | null = null;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {
    // An unnamed room: the Worker mints the code and hands it over with the host's first join, so a code
    // that was never minted leaves this empty — that is what tells a real room from a ghost (`rooms.md` § 404).
    this.room = createRoom({ roomCode: "", now: Date.now() });
    void this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<RoomState>("room");
      const storedSnapshot = await this.ctx.storage.get<Snapshot>("snapshot");
      const storedStart = await this.ctx.storage.get<number>("matchStartedAt");
      const storedOrigin = await this.ctx.storage.get<string>("origin");
      const storedHostCheck = await this.ctx.storage.get<string[]>("hostCheck");
      if (stored) this.room = storedSnapshot ? { ...stored, lastSnapshot: storedSnapshot } : stored;
      this.matchStartedAt = storedStart ?? null;
      this.origin = storedOrigin ?? null;
      this.persistedOrigin = storedOrigin ?? null;
      this.hostCheck = storedHostCheck ?? [];
    });
  }

  private async persist(): Promise<void> {
    await this.ctx.storage.put("room", this.room);
    await this.ctx.storage.put("hostCheck", this.hostCheck);
    if (this.room.lastSnapshot) await this.ctx.storage.put("snapshot", this.room.lastSnapshot);
  }

  private withActivity(patch: Partial<RoomState>): RoomState {
    return { ...this.room, ...patch, lastActivityAt: Date.now() };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.pathname.split("/").pop() ?? "";

    if (action === "ws") return this.handleUpgrade(request);
    if (action === "join") return this.handleJoin(request);
    if (action === "leave") return this.handleLeave(request);
    if (action === "state") return Response.json(this.publicState());
    // `POST …/settings` and `POST …/start` used to live here. Both bypassed the socket guards and the
    // second one stamped `rulesetVersion: settings.mode`, which would rank a match under the wrong
    // ruleset; `room_settings` and `start_match` now own those two jobs (`signaling.md` § Contract status).
    return new Response("not found", { status: 404 });
  }

  private publicState(): Omit<RoomState, "lastSnapshot"> & { lastSnapshotSeq: number | null } {
    const { lastSnapshot, ...rest } = this.room;
    return { ...rest, lastSnapshotSeq: lastSnapshot?.seq ?? null };
  }

  /** The web app joins the room *before* opening the socket, so the roster exists when `room_state` lands. */
  private async handleJoin(request: Request): Promise<Response> {
    const body = (await request.json()) as JoinRequest & {
      roomCode?: string;
      settings?: Partial<RoomSettings>;
    };
    // The first join names the room: the object is created by the Worker before it knows the code, so the
    // code and the requested settings arrive with the host's first request (`docs/02-reference/data/room-state.md`).
    if (this.room.members.length === 0) {
      this.room = {
        ...this.room,
        ...(body.roomCode ? { roomCode: body.roomCode } : {}),
        ...(body.settings && this.room.status === "lobby"
          ? { settings: { ...this.room.settings, ...body.settings } }
          : {}),
      };
    }
    const wasGraceHost =
      this.room.hostPlayerId === body.playerId &&
      this.room.members.find((member) => member.playerId === body.playerId)?.connectionState === "grace";
    // A join is idempotent for the same session: a page that mounts twice (React's StrictMode does) must not
    // take two seats, and a reloaded lobby must land back on the seat it already owns rather than on a new
    // one (`US-ROOM-001` AC3). The identity is the one the session token carries, not the client's word.
    const existing = this.room.members.find(
      (member) =>
        (body.accountId !== null && member.accountId === body.accountId) ||
        (body.guestId !== null && member.guestId === body.guestId),
    );
    if (existing) {
      this.room = this.withActivity({ ...this.room, members: this.room.members.map((member) => member.playerId === existing.playerId ? { ...member, seenConnected: true } : member) });
      await this.persist();
      return Response.json({ room: this.publicState(), member: existing });
    }
    const outcome = joinRoom(this.room, { ...body, now: Date.now() });
    if (outcome.rejection) {
      const status = outcome.rejection === "room-full" ? 409 : outcome.rejection === "room-closed" ? 410 : 400;
      return Response.json({ type: outcome.rejection }, { status });
    }
    this.room = this.withActivity({ ...outcome.room });
    // `NFR-07`: a host that comes back inside its grace window keeps its slot, not the role — the room has
    // already been handed on, and taking it back would be a second silent migration.
    if (wasGraceHost) {
      const promoted = electHost(this.room);
      if (promoted) {
        this.room = {
          ...this.room,
          hostPlayerId: promoted,
          hostGeneration: this.room.hostGeneration + 1,
          members: this.room.members.map((member) =>
            member.playerId === promoted
              ? { ...member, role: "host" as const }
              : member.role === "host"
                ? { ...member, role: "player" as const }
                : member,
          ),
        };
        this.broadcast({ t: "host_changed", hostPlayerId: promoted, hostGeneration: this.room.hostGeneration, lastSnapshot: this.room.lastSnapshot ?? null, room: this.publicState() });
      }
    }
    await this.persist();
    await this.scheduleSweep();
    return Response.json({ room: this.publicState(), member: outcome.member });
  }

  private async handleLeave(request: Request): Promise<Response> {
    const { playerId } = (await request.json()) as { playerId: string };
    const outcome = leaveRoom(this.room, playerId, Date.now());
    this.room = this.withActivity(outcome.room);
    await this.persist();
    this.broadcast({ t: "peer_left", playerId, reason: "left" });
    this.broadcast({ t: "room_state", room: this.publicState() });
    return Response.json({ room: this.publicState() });
  }

  private async handleUpgrade(request: Request): Promise<Response> {
    if (this.room.status === "ended" || this.room.status === "abandoned") {
      return new Response("room closed", { status: 410 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    void request;
    this.ctx.acceptWebSocket(server);
    this.meta.set(server, {
      playerId: null,
      authed: false,
      accountId: null,
      guestId: null,
      token: null,
      lastPingAt: 0,
      window: { startedAt: 0, ping: 0, signal: 0, chat: 0 },
    });
    // `request.url` here is the proxy's `https://room.internal/...` stub, so the public origin comes in
    // on a header. Storage keeps it for the alarms, which run with no request in hand.
    const declared = request.headers.get("x-room-origin");
    if (declared) {
      this.origin = declared;
      if (this.persistedOrigin !== declared) {
        this.persistedOrigin = declared;
        await this.ctx.storage.put("origin", declared);
      }
    }
    setTimeout(() => {
      const meta = this.meta.get(server);
      if (meta && !meta.authed && server.readyState === 1) {
        server.close(CLOSE_UNAUTHENTICATED, "auth timeout");
      }
    }, AUTH_TIMEOUT_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    const parsed = parseClientFrame(text);
    if (!parsed.ok) {
      this.reject(ws, parsed.code, parsed.detail);
      return;
    }
    const frame = parsed.frame;
    if (frame.t === "auth") {
      await this.authenticate(ws, frame);
      return;
    }
    const meta = this.meta.get(ws);
    if (!meta?.authed || !meta.playerId) {
      ws.close(CLOSE_UNAUTHENTICATED, "auth required");
      return;
    }
    // The budget is charged before the frame is interpreted, so a flood costs the same whether or not
    // the payload is well formed (`US-NET-004` §5).
    const charged = this.charge(ws, meta, frame.t);
    if (!charged) {
      const limit = frame.t === "ping" ? BUDGETS.ping : frame.t === "signal" ? BUDGETS.signal : BUDGETS.chat;
      this.reject(ws, "rate-limited", `more than ${limit} ${frame.t} frames in a second`);
      // One refusal, then the socket goes: flooding must not cost the room a frame per attempt, and
      // `4429` is the close code `signaling.md` documents for exactly this (`US-NET-004` §5).
      this.meta.delete(ws);
      ws.close(CLOSE_RATE_LIMITED, "rate limited");
      return;
    }
    const playerId = meta.playerId;
    switch (frame.t) {
      case "signal":
        return this.relaySignal(ws, playerId, frame);
      case "team_assign":
        return this.assignTeams(ws, playerId, frame);
      case "start_match":
        return this.startMatch(ws, playerId);
      case "snapshot_push":
        return this.pushSnapshot(ws, playerId, frame);
      case "match_end":
        return this.endMatch(ws, meta, frame);
      case "room_settings":
        return this.applySettings(ws, playerId, frame);
      case "loadout":
        return this.setLoadout(ws, playerId, frame);
      case "move":
      case "item":
        return this.relayInput(ws, playerId, frame);
      case "leave": {
        const wasHost = this.room.hostPlayerId === playerId;
        const outcome = leaveRoom(this.room, playerId, Date.now());
        this.room = this.withActivity(outcome.room);
        await this.persist();
        this.sockets.delete(playerId);
        this.meta.delete(ws);
        this.broadcast({ t: "peer_left", playerId, reason: "left" });
        if (wasHost) await this.announceHostChange(playerId);
        this.broadcast({ t: "room_state", room: this.publicState() });
        return;
      }
      case "chat": {
        // Preset quick phrases go to everyone else; the limit is the budget above, and the DO never
        // stores what was said (`US-NET-004` §4).
        // Only the id crosses: the parser has already refused a free-text frame, and the copy is the receiver's
        // own locale (`US-MATCH-004` AC5, AC7).
        this.broadcast({ t: "chat", from: playerId, kind: frame.kind, id: frame.id }, playerId);
        return;
      }
      case "ping": {
        this.meta.set(ws, { ...charged, lastPingAt: Date.now() });
        this.send(ws, { t: "pong", at: frame.at, now: Date.now() });
        await this.scheduleHeartbeatSweep();
        return;
      }
    }
  }

  /**
   * Charges one frame against the socket's per-second budget. Returns the updated metadata (with a
   * fresh window when the second rolled over) or `null` when the budget is spent.
   */
  private charge(ws: WebSocket, meta: SocketMeta, kind: "ping" | "signal" | "chat" | string): SocketMeta | null {
    const now = Date.now();
    const fresh = now - meta.window.startedAt >= 1_000;
    const window = fresh ? { startedAt: now, ping: 0, signal: 0, chat: 0 } : { ...meta.window };
    if (kind !== "ping" && kind !== "signal" && kind !== "chat") {
      this.meta.set(ws, { ...meta, window });
      return { ...meta, window };
    }
    if (window[kind] >= BUDGETS[kind]) {
      this.meta.set(ws, { ...meta, window });
      return null;
    }
    window[kind] += 1;
    const next = { ...meta, window };
    this.meta.set(ws, next);
    return next;
  }

  /** `signal` reaches only its `to`, and never the sender (`US-ROOM-006`, TC-ROOM-050). */
  private relaySignal(ws: WebSocket, playerId: string, frame: { to: string; payload: unknown }): void {
    if (frame.to === playerId) {
      this.reject(ws, "bad-request", "a client cannot signal itself");
      return;
    }
    const target = this.sockets.get(frame.to);
    const member = this.room.members.find((candidate) => candidate.playerId === frame.to);
    if (!target || !member) {
      // An offline peer and a stranger are answered identically, so the socket cannot be used to probe
      // who is in the room (`US-ROOM-006` AC2).
      this.reject(ws, "peer-not-connected", "the peer has no open socket");
      return;
    }
    this.send(target, { t: "signal", from: playerId, payload: frame.payload });
  }

  /** One frame carries the whole roster, so a half-applied assignment cannot exist (`US-ROOM-003`). */
  private async assignTeams(ws: WebSocket, playerId: string, frame: { assignments: readonly { playerId: string; team: "A" | "B" | null }[] }): Promise<void> {
    if (playerId !== this.room.hostPlayerId) {
      this.reject(ws, "not-host", "only the host assigns teams");
      return;
    }
    if (this.room.status !== "lobby") {
      this.reject(ws, "invalid-state", "teams are locked once the match starts");
      return;
    }
    const known = new Set(this.room.members.map((member) => member.playerId));
    const unknown = frame.assignments.find((assignment) => !known.has(assignment.playerId));
    if (unknown) {
      this.reject(ws, "bad-request", `${unknown.playerId} is not in this room`);
      return;
    }
    const members = this.room.members.map((member) => {
      const found = frame.assignments.find((assignment) => assignment.playerId === member.playerId);
      return found ? { ...member, team: found.team } : member;
    });
    const next: RoomState = { ...this.room, members };
    // Equality is `start_match`'s rule, not this one: a host has to be able to seat the first player.
    // What is enforced here is capacity — a team never holds more than its share of the seats.
    const seats = Math.floor(this.room.settings.maxPlayers / 2);
    const counts = { A: 0, B: 0 };
    for (const member of members) if (member.team) counts[member.team] += 1;
    if (counts.A > seats || counts.B > seats) {
      this.reject(ws, "bad-request", `a team holds at most ${seats} players at ${this.room.settings.maxPlayers} seats`);
      return;
    }
    this.room = this.withActivity(next);
    await this.persist();
    this.broadcast({ t: "room_state", room: this.publicState() });
  }

  private async startMatch(ws: WebSocket, playerId: string): Promise<void> {
    const rejection = canStart(this.room, playerId);
    if (rejection) {
      this.reject(ws, START_REJECTIONS[rejection], "the room is not ready to start");
      return;
    }
    const startedAt = Date.now();
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
    this.room = this.withActivity({ ...this.room, status: "playing" });
    this.matchStartedAt = startedAt;
    await this.persist();
    await this.ctx.storage.put("matchStartedAt", startedAt);
    this.broadcast({
      t: "match_started",
      startedAt,
      seed,
      hostPlayerId: this.room.hostPlayerId,
      hostGeneration: this.room.hostGeneration,
      // Stamped by the deployed build, never by the client (`US-ROOM-003` AC4).
      rulesetVersion: RULESET_VERSION,
      assignments: this.room.members.map((member) => ({
        playerId: member.playerId,
        slot: member.slot,
        team: member.team,
        mobileId: member.mobileId,
        accountId: member.accountId,
        loadout: member.loadout ?? [],
      })),
      room: this.publicState(),
    });
    await this.ctx.storage.setAlarm(startedAt + 24 * 60 * 60 * 1000);
  }

  private async pushSnapshot(
    ws: WebSocket,
    playerId: string,
    frame: { snapshot: Snapshot | WireSnapshot },
  ): Promise<void> {
    if (playerId !== this.room.hostPlayerId) {
      this.reject(ws, "not-host", "only the host pushes snapshots");
      return;
    }
    if (this.room.status !== "playing") {
      this.reject(ws, "invalid-state", "the room is not playing");
      return;
    }
    // The host sends the packed form to save uplink (`US-NET-002` AC7); the DO stores and relays the expanded object,
    // because a rejoin replay is one message and every client reads it the same way.
    const snapshot = isWireSnapshot(frame.snapshot) ? expandWire(frame.snapshot) : frame.snapshot;
    if (this.room.lastSnapshot && snapshot.seq <= this.room.lastSnapshot.seq) return;
    this.room = { ...this.room, lastSnapshot: snapshot, lastActivityAt: Date.now() };
    await this.ctx.storage.put("snapshot", snapshot);
    // Relayed packed as well: the relay is the 10 Hz path on a congested room and the point of AC7 is that no
    // snapshot on the wire is bigger than 800 B (`US-NET-002`).
    const wire = packSnapshot(snapshot);
    for (const [targetId, socket] of this.sockets) {
      if (targetId === playerId) continue;
      this.send(socket, { t: "snapshot_state", snapshot: wire });
    }
  }

  /** Host-only, lobby-only settings (`US-ROOM-007`). */
  private async applySettings(
    ws: WebSocket,
    playerId: string,
    frame: { mode: string; mapId: string; maxPlayers?: 2 | 4 | 6 | 8 | undefined; isPrivate?: boolean | undefined },
  ): Promise<void> {
    if (playerId !== this.room.hostPlayerId) {
      this.reject(ws, "not-host", "only the host changes the room settings");
      return;
    }
    if (this.room.status !== "lobby") {
      this.reject(ws, "invalid-state", "settings are locked once the match starts");
      return;
    }
    if (!isModeId(frame.mode)) {
      this.reject(ws, "bad-request", `${frame.mode} is not a mode`);
      return;
    }
    // The rule lives in core, next to `createRoom`, so a test can hold it without a Durable Object.
    const outcome = setRoomSettings(this.room, {
      mode: frame.mode,
      mapId: frame.mapId,
      ...(frame.maxPlayers === undefined ? {} : { maxPlayers: frame.maxPlayers }),
      ...(frame.isPrivate === undefined ? {} : { isPrivate: frame.isPrivate }),
    });
    if (!outcome.ok) {
      this.reject(ws, "invalid-state", `${this.room.members.length} players are already seated`);
      return;
    }
    this.room = this.withActivity(outcome.room);
    await this.persist();
    this.broadcast({ t: "room_state", room: this.publicState() });
  }

  /** Any member, lobby only; the eleven-item budget is checked by the parser (`US-ROOM-007`). */
  private async setLoadout(ws: WebSocket, playerId: string, frame: { items: readonly LoadoutEntry[] }): Promise<void> {
    if (this.room.status !== "lobby") {
      this.reject(ws, "invalid-state", "the loadout is locked once the match starts");
      return;
    }
    this.room = this.withActivity({
      ...this.room,
      members: this.room.members.map((member) => (member.playerId === playerId ? { ...member, loadout: frame.items } : member)),
    });
    await this.persist();
    this.broadcast({ t: "room_state", room: this.publicState() });
  }

  /**
   * `move` and `item` are validated by the host, not here: the Worker has no board, no energy and no
   * inventory. Relaying them keeps the room socket from being a gameplay authority (`ADR-0004`).
   */
  private relayInput(ws: WebSocket, playerId: string, frame: { t: "move"; direction: 0 | 1; run: boolean } | { t: "item"; id: string }): void {
    if (playerId === this.room.hostPlayerId) return;
    if (this.room.status !== "playing") {
      this.reject(ws, "invalid-state", "the match has not started");
      return;
    }
    // Only the active slot may act (`US-NET-004` AC2, `TC-NET-067`); the last snapshot is the DO's only view of
    // the turn, and before the first one no slot is active, so nothing may be relayed yet.
    const activeSlot = this.room.lastSnapshot?.turn.activeSlot;
    const senderSlot = this.room.members.find((member) => member.playerId === playerId)?.slot;
    if (activeSlot === undefined) {
      this.reject(ws, "unsupported-message", "No slot is active yet");
      return;
    }
    if (senderSlot !== undefined && senderSlot !== activeSlot) {
      this.reject(ws, "unsupported-message", "only the active player may act");
      return;
    }
    const host = this.room.hostPlayerId ? this.sockets.get(this.room.hostPlayerId) : undefined;
    if (!host) {
      this.reject(ws, "peer-not-connected", "the host has no open socket");
      return;
    }
    this.send(host, frame.t === "move"
      ? { t: "move", from: playerId, direction: frame.direction, run: frame.run }
      : { t: "item", from: playerId, id: frame.id });
  }

  private async endMatch(ws: WebSocket, meta: SocketMeta, frame: MatchEndFrame): Promise<void> {
    if (meta.playerId !== this.room.hostPlayerId) {
      this.reject(ws, "not-host", "only the host ends the match");
      return;
    }
    // An `ended` room answers a retry with the stored result instead of `invalid-state`: the host may
    // have lost the broadcast to a network blip, and `documented recovery` is a retry (`signaling.md` §2).
    if (this.room.status === "ended") {
      if (this.recorded) {
        this.broadcast({ t: "match_recorded", ...this.recorded });
        return;
      }
      this.reject(ws, "invalid-state", "the match was already ended and not yet recorded");
      return;
    }
    if (this.room.status !== "playing") {
      this.reject(ws, "invalid-state", "the room is not playing");
      return;
    }
    const endedAt = Date.now();
    this.room = this.withActivity({ ...this.room, status: "ended" });
    await this.persist();
    this.broadcast({ t: "room_state", room: this.publicState() });
    let recorded: Awaited<ReturnType<typeof this.recordMatch>>;
    try {
      recorded = await this.recordMatch(meta.token, frame, endedAt);
    } catch (error) {
      // The subrequest failed (DNS, a 500, a timeout): the host must hear an error, never a dead socket.
      this.reject(ws, "internal", error instanceof Error ? error.message : "the match could not be recorded");
      return;
    }
    if (recorded.ok) {
      this.recorded = recorded.value;
      this.broadcast({ t: "match_recorded", ...recorded.value });
      return;
    }
    this.reject(ws, "internal", recorded.detail);
  }

  /**
   * `POST /api/v1/matches` from inside the object (`US-RANK-001`). The id and the timestamps come from
   * the DO, so the host cannot backdate a match or record one twice: `409 match-already-recorded` on a
   * retry counts as success.
   */
  private async recordMatch(
    token: string | null,
    frame: MatchEndFrame,
    endedAt: number,
    options: { readonly abandoned?: boolean } = {},
  ): Promise<{ ok: true; value: { matchId: string; winnerTeam: "A" | "B" | null; ranked: boolean; ratings: readonly { accountId: string; before: number; after: number; delta: number }[]; players: readonly { slot: number; result: "win" | "loss" | "abandon" }[] } } | { ok: false; detail: string }> {
    const startedAt = this.matchStartedAt ?? endedAt;
    const matchId = `${this.room.roomCode}-${startedAt}`;
    const players = this.matchPlayers(frame.stats);
    const unranked = {
      matchId,
      winnerTeam: frame.winnerTeam,
      ranked: false,
      ratings: [] as readonly { accountId: string; before: number; after: number; delta: number }[],
      players: [] as readonly { slot: number; result: "win" | "loss" | "abandon" }[],
    };
    if (!this.origin || !token || !players.every((player) => player.accountId !== null)) {
      // A guest room, or a host promoted mid-match, cannot be rated; the results screen still needs a winner.
      return { ok: true, value: unranked };
    }
    const response = await fetch(new URL("/api/v1/matches", this.origin).toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "idempotency-key": matchId,
      },
      body: JSON.stringify({
        matchId,
        roomCode: this.room.roomCode,
        rulesetVersion: RULESET_VERSION,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date(endedAt).toISOString(),
        winnerTeam: frame.winnerTeam,
        abandoned: options.abandoned ?? false,
        players,
        delayTable: frame.delayTable ?? [],
      }),
    });
    if (response.status === 409) return { ok: true, value: unranked };
    if (response.status === 201) {
      const body = (await response.json()) as {
        matchId: string;
        ranked: boolean;
        ratings: readonly { accountId: string; before: number | null; after: number | null }[];
      };
      return {
        ok: true,
        value: {
          matchId: body.matchId,
          winnerTeam: frame.winnerTeam,
          ranked: body.ranked,
          ratings: body.ratings
            .filter((rating) => rating.before !== null && rating.after !== null)
            .map((rating) => ({
              accountId: rating.accountId,
              before: rating.before as number,
              after: rating.after as number,
              delta: (rating.after as number) - (rating.before as number),
            })),
          players: players.map((player) => ({
            slot: player.slot,
            result:
              frame.winnerTeam === null
                ? "loss"
                : player.team === frame.winnerTeam
                  ? "win"
                  : options.abandoned === true
                    ? "abandon"
                    : "loss",
          })),
        },
      };
    }
    const detail = await response.text();
    return { ok: false, detail: `the match record was refused (${response.status}): ${detail.slice(0, 120)}` };
  }

  private matchPlayers(stats: readonly MatchStat[]) {
    return stats.map((stat) => {
      const member = this.room.members.find((candidate) => candidate.slot === stat.slot);
      return {
        slot: stat.slot,
        team: member?.team ?? ("A" as const),
        accountId: member?.accountId ?? null,
        damageDealt: stat.damageDealt,
        shotsFired: stat.shotsFired,
        hits: stat.hits,
      };
    });
  }

  /**
   * Bind the socket to the member the Worker already authenticated (`docs/02-reference/api/signaling.md`).
   * The mobile id and display name arrive on the frame; identity comes from the proxy headers.
   */
  private async authenticate(
    ws: WebSocket,
    message: { token: string; mobileId?: string; displayName?: string; avatarId?: string },
  ): Promise<void> {
    const meta = this.meta.get(ws);
    if (!meta) return;
    let subject: SessionSubject;
    try {
      subject = (await verifySession(message.token, this.env.SESSION_TOKEN_SECRET)).sub;
    } catch {
      ws.close(CLOSE_UNAUTHENTICATED, "invalid session token");
      return;
    }
    const member = this.room.members.find(
      (candidate) =>
        (subject.accountId !== null && candidate.accountId === subject.accountId) ||
        (subject.guestId !== null && candidate.guestId === subject.guestId),
    );
    if (!member) {
      // A socket with no seat in a room that is full is the ninth player of an eight-slot room
      // (`US-ROOM-002` AC3): `4409`, and the roster does not change.
      ws.close(
        this.room.members.length >= this.room.settings.maxPlayers ? CLOSE_ROOM_FULL : CLOSE_ROOM_NOT_FOUND,
        this.room.members.length >= this.room.settings.maxPlayers ? "room full" : "unknown player",
      );
      return;
    }
    const playerId = member.playerId;
    const previous = this.sockets.get(playerId);
    if (previous && previous !== ws) {
      this.send(previous, { t: "error", code: "unsupported-message", detail: "replaced by a newer connection" });
      previous.close(4408, "replaced");
    }
    this.meta.set(ws, { ...meta, playerId, authed: true, token: message.token, lastPingAt: Date.now() });
    this.sockets.set(playerId, ws);
    // A host coming back inside its grace window keeps its slot but not the role (`NFR-07`): the room has
    // already learned to live without it, so the role goes to the longest-connected peer that stayed.
    const returningHost = member.connectionState === "grace" && this.room.hostPlayerId === playerId;
    const returned = returningHost
      ? this.room.members.some(
          (candidate) => candidate.playerId !== playerId && candidate.connectionState === "connected",
        )
      : false;
    this.room = this.withActivity({
      ...this.room,
      members: this.room.members.map((candidate) =>
        candidate.playerId === playerId
          ? {
              ...candidate,
              connectionState: "connected",
              seenConnected: true,
              // Gameplay data is the host's to validate, but a mobile id is a stat line the host imports,
              // so the DO refuses an unknown one and only accepts a swap in the lobby (`US-ROOM-001`).
              ...(message.mobileId && this.room.status === "lobby" && isMobileId(message.mobileId)
                ? { mobileId: message.mobileId }
                : {}),
              ...(message.displayName && this.room.status === "lobby" ? { displayName: message.displayName } : {}),
              // The avatar is a cosmetic pick, so it may change wherever the name may (`US-AUTH-003` AC5):
              // the roster a peer renders reads it from the member record, not from the profile row.
              ...(message.avatarId && this.room.status === "lobby" ? { avatarId: message.avatarId } : {}),
            }
          : candidate,
      ),
    });
    if (returned) {
      const promoted = electHost(this.room);
      if (promoted) {
        this.room = {
          ...this.room,
          hostPlayerId: promoted,
          hostGeneration: this.room.hostGeneration + 1,
          members: this.room.members.map((candidate) =>
            candidate.playerId === promoted
              ? { ...candidate, role: "host" as const }
              : candidate.role === "host"
                ? { ...candidate, role: "player" as const }
                : candidate,
          ),
        };
        await this.announceHostChange(promoted);
      }
    }
    await this.persist();
    this.send(ws, { t: "room_state", room: this.publicState(), you: { playerId, slot: member.slot } });
    this.broadcast({ t: "peer_joined", playerId, slot: member.slot, room: this.publicState() }, playerId);
    if (this.room.status === "playing" && this.room.lastSnapshot) {
      this.send(ws, { t: "snapshot_state", snapshot: packSnapshot(this.room.lastSnapshot) });
    }
    await this.scheduleSweep();
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const meta = this.meta.get(ws);
    if (!meta?.playerId) return;
    const playerId = meta.playerId;
    this.sockets.delete(playerId);
    this.meta.delete(ws);
    // A dropped socket starts the 20 s grace timer instead of removing the member (`US-ROOM-004`).
    const outcome = markDisconnected(this.room, playerId, Date.now());
    this.room = this.withActivity(outcome.room);
    await this.persist();
    this.broadcast({ t: "peer_left", playerId, reason: "grace" });
    this.broadcast({ t: "room_state", room: this.publicState() });
    // The seat keeps its grace window (`US-ROOM-004`), but the host *role* is authority over physics and it
    // cannot wait 20 s (`US-ROOM-005` AC1, NFR-06). A returning host comes back as a plain peer (AC4).
    const wasHost = playerId === this.room.hostPlayerId;
    if (wasHost) await this.migrateHost();
    // Keep whichever alarm is sooner: this must not clobber the 24 h match cap set on `start_match`. A host
    // drop needs its 5 s recheck, a peer drop only the seat's grace window.
    const at = Date.now() + (wasHost ? HOST_MIGRATION_RECHECK_MS : TUNABLES.roomGraceMs);
    const existing = await this.ctx.storage.getAlarm();
    if (existing === null || existing > at) await this.ctx.storage.setAlarm(at);
  }

  /** Broadcasts `host_changed` for a host that is already known to be gone. */
  private async announceHostChange(previousHostId: string): Promise<void> {
    const nextHost = this.room.hostPlayerId;
    if (!nextHost) {
      this.room = this.withActivity({
        ...this.room,
        status: this.room.status === "playing" ? "abandoned" : this.room.status,
      });
      await this.persist();
      this.broadcast({ t: "room_state", room: this.publicState() });
      return;
    }
    this.room = this.withActivity({
      ...this.room,
      hostGeneration: this.room.hostGeneration + (previousHostId === nextHost ? 0 : 1),
      members: this.room.members.map((member) =>
        member.playerId === nextHost
          ? { ...member, role: "host" as const }
          : member.role === "host"
            ? { ...member, role: "player" as const }
            : member,
      ),
    });
    await this.persist();
    this.broadcast({
      t: "host_changed",
      hostPlayerId: nextHost,
      hostGeneration: this.room.hostGeneration,
      lastSnapshot: this.room.lastSnapshot ?? null,
      room: this.publicState(),
    });
    this.broadcast({ t: "room_state", room: this.publicState() });
  }

  /**
   * Promotes the oldest connected peer and remembers who was tried (`US-ROOM-005` AC1/AC3). If the new host
   * never comes online, the alarm retries once with the next candidate and then abandons the room.
   */
  private async migrateHost(): Promise<void> {
    const promoted = this.nextHostCandidate();
    const previousHostId = this.room.hostPlayerId ?? "";
    if (!promoted) {
      // Nobody left to promote. A lobby simply waits; a live match is over (`AC3`).
      if (this.room.status === "playing") {
        this.room = this.withActivity({ ...this.room, status: "abandoned" });
        await this.persist();
        this.broadcast({ t: "room_state", room: this.publicState() });
      }
      return;
    }
    this.hostCheck = [...this.hostCheck, promoted];
    this.room = { ...this.room, hostPlayerId: promoted };
    await this.announceHostChange(previousHostId);
    // The recheck is what turns "promoted" into "playable" — five seconds is the NFR-06 budget.
    const at = Date.now() + HOST_MIGRATION_RECHECK_MS;
    const existing = await this.ctx.storage.getAlarm();
    if (existing === null || existing > at) await this.ctx.storage.setAlarm(at);
  }

  /** The oldest member that is connected right now and has not already been tried (`AC1`, `AC3`). */
  private nextHostCandidate(): string | null {
    return (
      this.room.members
        .filter(
          (member) =>
            member.playerId !== undefined &&
            member.playerId !== this.room.hostPlayerId &&
            !this.hostCheck.includes(member.playerId) &&
            this.sockets.has(member.playerId) &&
            member.connectionState === "connected",
        )
        .sort((left, right) => left.joinedAt - right.joinedAt || left.slot - right.slot)[0]?.playerId ?? null
    );
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  /** Alarms do the lifecycle work: grace expiry, forfeit, idle expiry. */
  async alarm(): Promise<void> {
    const now = Date.now();

    // `US-ROOM-005` AC3: a migration that did not produce a live host inside 5 s retries once with the next
    // candidate and then gives the room up. This runs before the grace sweep so a dead host cannot be
    // "re-elected" by the code below.
    if (this.hostCheck.length > 0) {
      const host = this.room.members.find((member) => member.playerId === this.room.hostPlayerId);
      const hostLive = host?.connectionState === "connected" && this.sockets.has(host.playerId ?? "");
      if (!hostLive) {
        const next = this.nextHostCandidate();
        if (next) {
          this.room = { ...this.room, hostPlayerId: next };
          this.hostCheck = [...this.hostCheck, next];
          await this.announceHostChange(host?.playerId ?? "");
          await this.persist();
          const at = Date.now() + HOST_MIGRATION_RECHECK_MS;
          const existing = await this.ctx.storage.getAlarm();
          if (existing === null || existing > at) await this.ctx.storage.setAlarm(at);
          return;
        }
        // Every candidate is exhausted: the match cannot continue (`AC3`).
        if (this.room.status === "playing") {
          this.room = { ...this.room, status: "abandoned" };
          await this.persist();
        }
      }
      this.hostCheck = [];
      await this.persist();
    }

    // A grace that ran out becomes `disconnected`, and every peer hears about it (`US-ROOM-004` AC3).
    // The sweep that *creates* a grace runs after this block: a seat marked `grace` in this pass must be
    // visible as `grace` to the peers before the next alarm can expire it (`US-ROOM-002` AC6).
    const expired = this.room.members.filter((member) => member.connectionState === "grace");
    this.room = {
      ...this.room,
      members: this.room.members.map((member) =>
        member.playerId !== undefined && expired.some((gone) => gone.playerId === member.playerId)
          ? { ...member, connectionState: "disconnected" as const }
          : member,
      ),
    };
    for (const member of expired) {
      this.broadcast({ t: "peer_left", playerId: member.playerId, reason: "disconnected" });
    }
    if (expired.length > 0) this.broadcast({ t: "room_state", room: this.publicState() });

    // A team that lost every member forfeits, and the match is recorded as abandoned (`US-ROOM-004` AC5/AC6)
    // before the "nobody is connected any more" rule below gets a chance to hide the winner.
    if (this.room.status === "playing") {
      const forfeited = isForfeited(this.room);
      if (forfeited !== null) {
        this.room = { ...this.room, status: "abandoned" };
        await this.persist();
        this.broadcast({ t: "room_state", room: this.publicState() });
        await this.recordAbandoned(forfeited);
      }
    }

    // Nobody connected and nobody left in the roster: the room is over, not merely quiet (`US-ROOM-005`).
    const anyConnected = this.room.members.some((member) => member.connectionState === "connected");
    if (!anyConnected && this.room.status === "playing") {
      this.room = { ...this.room, status: "abandoned" };
    }

    // Silence is noticed last, so a socket that stops answering is announced as `grace` (not as gone) and the
    // expiry pass above can only retire it on a later alarm.
    await this.sweepSilentSockets(now);

    // The host role moves only once the grace window it was given has run out (`US-ROOM-005`: a host that is
    // merely `grace` is not replaced) — and only to a peer that is actually connected.
    const host = this.room.members.find((member) => member.playerId === this.room.hostPlayerId);
    if (!host || host.connectionState === "disconnected") {
      const promoted = this.room.members.some((member) => member.connectionState === "connected")
        ? electHost(this.room)
        : null;
      if (promoted && promoted !== this.room.hostPlayerId) {
        const previousHostId = this.room.hostPlayerId ?? "";
        this.room = { ...this.room, hostPlayerId: promoted };
        await this.announceHostChange(previousHostId);
      }
    }

    // An empty lobby goes sixty seconds after its last member left; everything else rides the idle window
    // and the 24 h cap measured from the match start (`workflow-state-machine.md`).
    const emptyLobby =
      this.room.members.length === 0 && this.room.status !== "playing" && now - this.room.lastActivityAt >= 60_000;
    const gone = emptyLobby || isRoomExpired(this.room, now, this.matchStartedAt);

    if (gone) {
      this.room = { ...this.room, status: "abandoned" };
      await this.ctx.storage.deleteAll();
      this.broadcast({ t: "room_closed", reason: emptyLobby ? "empty" : this.room.members.length > 0 ? "expired" : "closed" });
      for (const socket of this.sockets.values()) socket.close(CLOSE_ROOM_CLOSED, "room closed");
      return;
    }
    await this.persist();
    await this.scheduleSweep();
  }

  /**
   * A `ping` every `PING_INTERVAL_MS` with three missed ones allowed (`US-ROOM-002` AC6). The client
   * cannot lie about this: silence is what is measured, not a claimed timestamp.
   */
  /**
   * Record a forfeited match (`US-ROOM-004` AC6). The abandoning team's seats are reported as `abandon`, the
   * survivors as `win`, and the numbers are zeros because nobody was there to report them. Any connected
   * participant's token will do: `POST /matches` authorises the submitter as a player, not as the host.
   */
  private async recordAbandoned(winnerTeam: Team): Promise<void> {
    const token = this.participantToken();
    if (!token || !this.origin) return;
    const stats = this.room.members.map((member) => ({
      slot: member.slot,
      damageDealt: 0,
      shotsFired: 0,
      hits: 0,
    }));
    const frame: MatchEndFrame = { t: "match_end", winnerTeam, stats };
    const endedAt = Date.now();
    const recorded = await this.recordMatch(token, frame, endedAt, { abandoned: true }).catch(() => null);
    if (recorded?.ok) {
      this.recorded = recorded.value;
      this.broadcast({ t: "match_recorded", ...recorded.value });
    }
  }

  /** The first socket that still has a session token, host first (`POST /matches` accepts any player). */
  private participantToken(): string | null {
    const hostSocket = this.room.hostPlayerId === null ? undefined : this.sockets.get(this.room.hostPlayerId);
    const ordered = hostSocket === undefined ? [...this.sockets.values()] : [hostSocket, ...this.sockets.values()];
    for (const socket of ordered) {
      const token = this.meta.get(socket)?.token;
      if (token) return token;
    }
    return null;
  }

  /**
   * Silence is noticed per socket, but the announcement is made *before* the socket is dropped: a peer that
   * is still listening must hear `peer_left` even when every silent socket is swept in the same pass
   * (`US-ROOM-002` AC4 — the roster has to show `grace` at least once).
   */
  private async sweepSilentSockets(now: number): Promise<void> {
    const deadline = PING_INTERVAL_MS * PING_MISSES_BEFORE_GRACE;
    const silent = [...this.sockets.entries()].filter(([, socket]) => {
      const meta = this.meta.get(socket);
      if (!meta?.playerId || !meta.authed) return false;
      return now - meta.lastPingAt > deadline;
    });
    if (silent.length === 0) return;
    for (const [playerId] of silent) {
      const outcome = markDisconnected(this.room, playerId, now);
      this.room = this.withActivity(outcome.room);
      this.broadcast({ t: "peer_left", playerId, reason: "grace" });
    }
    this.broadcast({ t: "room_state", room: this.publicState() });
    for (const [playerId, socket] of silent) {
      this.sockets.delete(playerId);
      this.meta.delete(socket);
      if (socket.readyState === 1) socket.close(4408, "heartbeat timeout");
    }
    await this.scheduleHeartbeatSweep();
    await this.persist();
  }

  private async scheduleHeartbeatSweep(): Promise<void> {
    const at = Date.now() + PING_INTERVAL_MS * PING_MISSES_BEFORE_GRACE;
    const existing = await this.ctx.storage.getAlarm();
    if (existing === null || existing > at) await this.ctx.storage.setAlarm(at);
  }

  private async scheduleSweep(): Promise<void> {
    if (this.sockets.size > 0) return;
    // `workflow-state-machine.md`: a lobby whose last member left is deleted sixty seconds later; an
    // ended room rides the normal idle window.
    const at =
      this.room.status === "lobby" || this.room.members.length === 0
        ? this.room.lastActivityAt + 60_000
        : this.room.lastActivityAt + TUNABLES.roomIdleMs;
    const existing = await this.ctx.storage.getAlarm();
    if (existing === null || existing > at) await this.ctx.storage.setAlarm(at);
  }

  /** One shape for every refusal: `{t:"error", code, detail}` (`signaling.md` § 3). */
  /**
   * Refuse a frame: tell the sender, and write one structured line about it.
   *
   * The line carries the identity the socket authenticated as — never a `playerId` from the frame, which any browser
   * can edit (`US-NET-004` AC5) — and none of the refused payload, because a snapshot holds every player's HP and a
   * `signal` holds SDP (`NFR-13`, `NFR-24`). `detail` stays out too: it quotes field names from the message.
   */
  private reject(ws: WebSocket, code: ErrorCode, detail: string): void {
    const meta = this.meta.get(ws);
    console.info(
      JSON.stringify({
        level: "warn",
        request_id: crypto.randomUUID(),
        route: "WS /api/v1/rooms/:code/ws",
        method: "WS",
        status: FRAME_STATUS[code],
        duration_ms: 0,
        room_code: this.room.roomCode,
        player_id: meta?.playerId ?? undefined,
        code,
      }),
    );
    this.send(ws, { t: "error", code, detail });
  }

  private send(ws: WebSocket, payload: unknown): void {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      /* the socket is gone; webSocketClose handles the roster */
    }
  }

  private broadcast(payload: unknown, exceptPlayerId?: string): void {
    for (const [playerId, socket] of this.sockets) {
      if (exceptPlayerId && playerId === exceptPlayerId) continue;
      this.send(socket, payload);
    }
  }

  /** Exposed for tests: the roster as the browser sees it. */
  debugState(): readonly RoomMember[] {
    return this.room.members;
  }
}
