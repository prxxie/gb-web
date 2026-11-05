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
  isIdle,
  isModeId,
  isRoomExpired,
  joinRoom,
  leaveRoom,
  markDisconnected,
  parseClientFrame,
  type ErrorCode,
  type JoinRequest,
  type LoadoutEntry,
  type MatchEndFrame,
  type MatchStat,
  type RoomMember,
  type RoomSettings,
  type RoomState,
  type Snapshot,
} from "@gbw/core";
import type { Env } from "./lib/db.js";
import { verifySession, type SessionSubject } from "./lib/session.js";

const AUTH_TIMEOUT_MS = 5_000;
const CLOSE_UNAUTHENTICATED = 4401;
const CLOSE_ROOM_NOT_FOUND = 4404;
const CLOSE_ROOM_CLOSED = 4410;

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
}

/** Core refusal → the code the client branches on (`docs/02-reference/api/README.md`). */
const START_REJECTIONS: Record<NonNullable<ReturnType<typeof canStart>>, ErrorCode> = {
  "not-host": "not-host",
  "not-lobby": "invalid-state",
  "not-full": "room-not-full",
  "not-enough-players": "not-enough-players",
  "teams-unbalanced": "teams-not-balanced",
};

export class Room implements DurableObject {
  private room: RoomState;
  private readonly sockets = new Map<string, WebSocket>();
  private readonly meta = new WeakMap<WebSocket, SocketMeta>();
  /** When `match_started` was sent; the match id and duration come from it, not from the client. */
  private matchStartedAt: number | null = null;
  /** Public origin of the Worker that opened the socket, so `match_end` can call `POST /api/v1/matches`. */
  private origin: string | null = null;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {
    this.room = createRoom({ roomCode: "AAAAAA", now: Date.now() });
    void this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<RoomState>("room");
      const storedSnapshot = await this.ctx.storage.get<Snapshot>("snapshot");
      const storedStart = await this.ctx.storage.get<number>("matchStartedAt");
      const storedOrigin = await this.ctx.storage.get<string>("origin");
      if (stored) this.room = storedSnapshot ? { ...stored, lastSnapshot: storedSnapshot } : stored;
      this.matchStartedAt = storedStart ?? null;
      this.origin = storedOrigin ?? null;
    });
  }

  private async persist(): Promise<void> {
    await this.ctx.storage.put("room", this.room);
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
    const outcome = joinRoom(this.room, { ...body, now: Date.now() });
    if (outcome.rejection) {
      const status = outcome.rejection === "room-full" ? 409 : outcome.rejection === "room-closed" ? 410 : 400;
      return Response.json({ type: outcome.rejection }, { status });
    }
    this.room = this.withActivity({ ...outcome.room });
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
    });
    this.origin = new URL(request.url).origin;
    await this.ctx.storage.put("origin", this.origin);
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
      case "ping": {
        this.meta.set(ws, { ...meta, lastPingAt: Date.now() });
        this.send(ws, { t: "pong", at: frame.at, now: Date.now() });
        await this.scheduleHeartbeatSweep();
        return;
      }
    }
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

  private async pushSnapshot(ws: WebSocket, playerId: string, frame: { snapshot: Snapshot }): Promise<void> {
    if (playerId !== this.room.hostPlayerId) {
      this.reject(ws, "not-host", "only the host pushes snapshots");
      return;
    }
    if (this.room.status !== "playing") {
      this.reject(ws, "invalid-state", "the room is not playing");
      return;
    }
    const snapshot = frame.snapshot;
    if (this.room.lastSnapshot && snapshot.seq <= this.room.lastSnapshot.seq) return;
    this.room = { ...this.room, lastSnapshot: snapshot, lastActivityAt: Date.now() };
    await this.ctx.storage.put("snapshot", snapshot);
    for (const [targetId, socket] of this.sockets) {
      if (targetId === playerId) continue;
      this.send(socket, { t: "snapshot_state", snapshot });
    }
  }

  /** Host-only, lobby-only settings (`US-ROOM-007`). */
  private async applySettings(ws: WebSocket, playerId: string, frame: { mode: string; mapId: string }): Promise<void> {
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
    this.room = this.withActivity({ ...this.room, settings: { ...this.room.settings, mode: frame.mode, mapId: frame.mapId } });
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
    if (this.room.status !== "playing") {
      this.reject(ws, "invalid-state", "the room is not playing");
      return;
    }
    const endedAt = Date.now();
    this.room = this.withActivity({ ...this.room, status: "ended" });
    await this.persist();
    this.broadcast({ t: "room_state", room: this.publicState() });
    const recorded = await this.recordMatch(meta.token, frame, endedAt);
    if (recorded.ok) {
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
        abandoned: false,
        players,
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
            result: frame.winnerTeam === null ? "loss" : player.team === frame.winnerTeam ? "win" : "loss",
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
      ws.close(CLOSE_ROOM_NOT_FOUND, "unknown player");
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
    this.room = this.withActivity({
      ...this.room,
      members: this.room.members.map((candidate) =>
        candidate.playerId === playerId
          ? {
              ...candidate,
              connectionState: "connected",
              seenConnected: true,
              ...(message.mobileId ? { mobileId: message.mobileId } : {}),
              ...(message.displayName ? { displayName: message.displayName } : {}),
            }
          : candidate,
      ),
    });
    await this.persist();
    this.send(ws, { t: "room_state", room: this.publicState(), you: { playerId, slot: member.slot } });
    this.broadcast({ t: "peer_joined", playerId, slot: member.slot, room: this.publicState() }, playerId);
    if (this.room.status === "playing" && this.room.lastSnapshot) {
      this.send(ws, { t: "snapshot_state", snapshot: this.room.lastSnapshot });
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
    await this.electIfHostGone(playerId);
    await this.ctx.storage.setAlarm(Date.now() + 20_000);
  }

  /**
   * Election happens in exactly one place (`US-ROOM-005`): the longest-connected peer becomes host,
   * `hostGeneration` goes up by one, and every peer is told to drop snapshots from the old generation.
   */
  private async electIfHostGone(previousHostId: string): Promise<void> {
    if (this.room.hostPlayerId !== previousHostId) return;
    this.room = { ...this.room, hostPlayerId: electHost(this.room) };
    await this.announceHostChange(previousHostId);
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

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  /** Alarms do the lifecycle work: grace expiry, forfeit, idle expiry. */
  async alarm(): Promise<void> {
    const now = Date.now();
    await this.sweepSilentSockets(now);
    const inGrace = this.room.members.filter((member) => member.connectionState === "grace");
    let next = this.room;
    for (const member of inGrace) {
      next = {
        ...next,
        members: next.members.map((candidate) =>
          candidate.playerId === member.playerId ? { ...candidate, connectionState: "disconnected" } : candidate,
        ),
      };
    }
    if (isRoomExpired(next, now) || isIdle(next, now)) {
      next = { ...next, status: "abandoned" };
      this.room = next;
      await this.ctx.storage.deleteAll();
      this.broadcast({ t: "room_closed", room: this.publicState() });
      for (const socket of this.sockets.values()) socket.close(CLOSE_ROOM_CLOSED, "room closed");
      return;
    }
    this.room = next;
    await this.persist();
    await this.scheduleSweep();
  }

  /**
   * A `ping` every `PING_INTERVAL_MS` with three missed ones allowed (`US-ROOM-002` AC6). The client
   * cannot lie about this: silence is what is measured, not a claimed timestamp.
   */
  private async sweepSilentSockets(now: number): Promise<void> {
    const deadline = PING_INTERVAL_MS * PING_MISSES_BEFORE_GRACE;
    let silent: string | null = null;
    for (const socket of this.sockets.values()) {
      const meta = this.meta.get(socket);
      if (!meta?.playerId || !meta.authed) continue;
      if (now - meta.lastPingAt <= deadline) continue;
      silent = meta.playerId;
      this.sockets.delete(meta.playerId);
      this.meta.delete(socket);
      if (socket.readyState === 1) socket.close(4408, "heartbeat timeout");
      const outcome = markDisconnected(this.room, meta.playerId, now);
      this.room = this.withActivity(outcome.room);
      this.broadcast({ t: "peer_left", playerId: meta.playerId, reason: "grace" });
      await this.electIfHostGone(meta.playerId);
    }
    if (silent) await this.persist();
  }

  private async scheduleHeartbeatSweep(): Promise<void> {
    const at = Date.now() + PING_INTERVAL_MS * PING_MISSES_BEFORE_GRACE;
    const existing = await this.ctx.storage.getAlarm();
    if (existing === null || existing > at) await this.ctx.storage.setAlarm(at);
  }

  private async scheduleSweep(): Promise<void> {
    if (this.sockets.size > 0) return;
    const at = this.room.lastActivityAt + 60_000;
    const existing = await this.ctx.storage.getAlarm();
    if (existing === null || existing > at) await this.ctx.storage.setAlarm(at);
  }

  /** One shape for every refusal: `{t:"error", code, detail}` (`signaling.md` § 3). */
  private reject(ws: WebSocket, code: ErrorCode, detail: string): void {
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
