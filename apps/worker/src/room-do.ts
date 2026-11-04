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
  canStart,
  createRoom,
  electHost,
  joinRoom,
  leaveRoom,
  markDisconnected,
  isIdle,
  isRoomExpired,
  type JoinRequest,
  type RoomMember,
  type RoomState,
  type Snapshot,
} from "@gbw/core";
import type { Env } from "./lib/db.js";

const AUTH_TIMEOUT_MS = 5_000;
const CLOSE_UNAUTHENTICATED = 4401;
const CLOSE_ROOM_NOT_FOUND = 4404;
const CLOSE_ROOM_CLOSED = 4410;

type ClientMessage =
  | { t: "auth"; playerId: string; sessionToken: string }
  | { t: "signal"; to: string; data: unknown }
  | { t: "team_assign"; playerId: string; team: "A" | "B" | null }
  | { t: "start_match" }
  | { t: "snapshot_push"; snapshot: Snapshot }
  | { t: "match_end"; winner: "A" | "B" | null }
  | { t: "leave" }
  | { t: "ping" };

interface SocketMeta {
  playerId: string | null;
  authed: boolean;
}

export class Room implements DurableObject {
  private room: RoomState;
  private readonly sockets = new Map<string, WebSocket>();
  private readonly meta = new WeakMap<WebSocket, SocketMeta>();

  constructor(
    private readonly ctx: DurableObjectState,
    env: Env,
  ) {
    void env;
    this.room = createRoom({ roomCode: "AAAAAA", now: Date.now() });
    void this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<RoomState>("room");
      const storedSnapshot = await this.ctx.storage.get<Snapshot>("snapshot");
      if (stored) this.room = storedSnapshot ? { ...stored, lastSnapshot: storedSnapshot } : stored;
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
    if (action === "settings") return this.handleSettings(request);
    if (action === "start") return this.handleStart(request);
    if (action === "state") return Response.json(this.publicState());
    return new Response("not found", { status: 404 });
  }

  private publicState(): Omit<RoomState, "lastSnapshot"> & { lastSnapshotSeq: number | null } {
    const { lastSnapshot, ...rest } = this.room;
    return { ...rest, lastSnapshotSeq: lastSnapshot?.seq ?? null };
  }

  /** The web app joins the room *before* opening the socket, so the roster exists when `room_state` lands. */
  private async handleJoin(request: Request): Promise<Response> {
    const body = (await request.json()) as JoinRequest & { roomCode?: string };
    if (body.roomCode && body.roomCode !== this.room.roomCode) {
      this.room = { ...this.room, roomCode: body.roomCode };
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
    this.broadcast({ t: "peer_left", playerId, room: this.publicState() });
    return Response.json({ room: this.publicState() });
  }

  private async handleSettings(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      playerId: string;
      settings?: Partial<RoomState["settings"]>;
      teamAssignments?: readonly { playerId: string; team: "A" | "B" | null }[];
    };
    if (body.playerId !== this.room.hostPlayerId) {
      return Response.json({ type: "not-host" }, { status: 403 });
    }
    let next: RoomState = {
      ...this.room,
      settings: { ...this.room.settings, ...(body.settings ?? {}) },
    };
    for (const assignment of body.teamAssignments ?? []) {
      next = {
        ...next,
        members: next.members.map((member) =>
          member.playerId === assignment.playerId ? { ...member, team: assignment.team } : member,
        ),
      };
    }
    this.room = this.withActivity(next);
    await this.persist();
    this.broadcast({ t: "room_state", room: this.publicState() });
    return Response.json({ room: this.publicState() });
  }

  private async handleStart(request: Request): Promise<Response> {
    const { playerId, seed } = (await request.json()) as { playerId: string; seed: number };
    const rejection = canStart(this.room, playerId);
    if (rejection) return Response.json({ type: rejection }, { status: rejection === "not-host" ? 403 : 409 });
    const startedAt = Date.now();
    this.room = this.withActivity({ ...this.room, status: "playing" });
    await this.persist();
    this.broadcast({
      t: "match_started",
      startedAt,
      seed,
      rulesetVersion: this.room.settings.mode,
      room: this.publicState(),
    });
    await this.ctx.storage.setAlarm(startedAt + 24 * 60 * 60 * 1000);
    return Response.json({ room: this.publicState() });
  }

  private async handleUpgrade(_request: Request): Promise<Response> {
    if (this.room.status === "ended" || this.room.status === "abandoned") {
      return new Response("room closed", { status: 410 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    this.meta.set(server, { playerId: null, authed: false });
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
    let message: ClientMessage;
    try {
      message = JSON.parse(text) as ClientMessage;
    } catch {
      this.send(ws, { t: "error", code: "unsupported-message", detail: "body is not JSON" });
      return;
    }
    const meta = this.meta.get(ws) ?? { playerId: null, authed: false };
    if (message.t === "auth") {
      await this.authenticate(ws, message);
      return;
    }
    if (!meta.authed || !meta.playerId) {
      ws.close(CLOSE_UNAUTHENTICATED, "auth required");
      return;
    }
    switch (message.t) {
      case "signal": {
        const target = this.sockets.get(message.to);
        if (!target) {
          this.send(ws, { t: "error", code: "unsupported-message", detail: "peer is not connected" });
          return;
        }
        this.send(target, { t: "signal", from: meta.playerId, data: message.data });
        return;
      }
      case "team_assign": {
        if (meta.playerId !== this.room.hostPlayerId) {
          this.send(ws, { t: "error", code: "not-host" });
          return;
        }
        this.room = this.withActivity({
          ...this.room,
          members: this.room.members.map((member) =>
            member.playerId === message.playerId ? { ...member, team: message.team } : member,
          ),
        });
        await this.persist();
        this.broadcast({ t: "room_state", room: this.publicState() });
        return;
      }
      case "start_match": {
        const rejection = canStart(this.room, meta.playerId);
        if (rejection) {
          this.send(ws, { t: "error", code: rejection });
          return;
        }
        const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
        this.room = this.withActivity({ ...this.room, status: "playing" });
        await this.persist();
        this.broadcast({ t: "match_started", startedAt: Date.now(), seed, room: this.publicState() });
        return;
      }
      case "snapshot_push": {
        if (meta.playerId !== this.room.hostPlayerId) {
          this.send(ws, { t: "error", code: "not-host" });
          return;
        }
        const snapshot = message.snapshot;
        if (JSON.stringify(snapshot).length > 8_192) {
          this.send(ws, { t: "error", code: "snapshot-too-large" });
          return;
        }
        if (this.room.lastSnapshot && snapshot.seq <= this.room.lastSnapshot.seq) return;
        this.room = { ...this.room, lastSnapshot: snapshot, lastActivityAt: Date.now() };
        await this.ctx.storage.put("snapshot", snapshot);
        for (const [playerId, socket] of this.sockets) {
          if (playerId === meta.playerId) continue;
          this.send(socket, { t: "snapshot", snapshot });
        }
        return;
      }
      case "match_end": {
        if (meta.playerId !== this.room.hostPlayerId) {
          this.send(ws, { t: "error", code: "not-host" });
          return;
        }
        this.room = this.withActivity({ ...this.room, status: "ended" });
        await this.persist();
        this.broadcast({ t: "match_ended", winner: message.winner, room: this.publicState() });
        return;
      }
      case "leave": {
        const outcome = leaveRoom(this.room, meta.playerId, Date.now());
        this.room = this.withActivity(outcome.room);
        await this.persist();
        this.sockets.delete(meta.playerId);
        this.broadcast({ t: "peer_left", playerId: meta.playerId, room: this.publicState() });
        return;
      }
      case "ping":
        this.send(ws, { t: "pong", at: Date.now() });
        return;
      default:
        this.send(ws, { t: "error", code: "unsupported-message" });
    }
  }

  private async authenticate(ws: WebSocket, message: { playerId: string; sessionToken: string }): Promise<void> {
    const member = this.room.members.find((candidate) => candidate.playerId === message.playerId);
    if (!member) {
      ws.close(CLOSE_ROOM_NOT_FOUND, "unknown player");
      return;
    }
    const previous = this.sockets.get(message.playerId);
    if (previous && previous !== ws) {
      this.send(previous, { t: "error", code: "unsupported-message", detail: "replaced by a newer connection" });
      previous.close(4408, "replaced");
    }
    this.meta.set(ws, { playerId: message.playerId, authed: true });
    this.sockets.set(message.playerId, ws);
    this.room = this.withActivity({
      ...this.room,
      members: this.room.members.map((candidate) =>
        candidate.playerId === message.playerId
          ? { ...candidate, connectionState: "connected", seenConnected: true }
          : candidate,
      ),
    });
    await this.persist();
    this.send(ws, { t: "room_state", room: this.publicState(), you: message.playerId });
    this.broadcast({ t: "peer_joined", playerId: message.playerId, room: this.publicState() }, message.playerId);
    if (this.room.status === "playing" && this.room.lastSnapshot) {
      this.send(ws, { t: "snapshot_state", snapshot: this.room.lastSnapshot });
    }
    await this.scheduleSweep();
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const meta = this.meta.get(ws);
    if (!meta?.playerId) return;
    this.sockets.delete(meta.playerId);
    const outcome = markDisconnected(this.room, meta.playerId, Date.now());
    const next: RoomState = { ...outcome.room };
    const hostGone = this.room.hostPlayerId === meta.playerId;
    this.room = this.withActivity(hostGone ? { ...next, hostPlayerId: electHost(next) } : next);
    await this.persist();
    this.broadcast({ t: "peer_left", playerId: meta.playerId, room: this.publicState() });
    if (hostGone && this.room.hostPlayerId) {
      this.broadcast({
        t: "host_changed",
        hostPlayerId: this.room.hostPlayerId,
        hostGeneration: this.room.hostGeneration + 1,
        lastSnapshot: this.room.lastSnapshot,
        room: this.publicState(),
      });
      this.room = { ...this.room, hostGeneration: this.room.hostGeneration + 1 };
      await this.persist();
    }
    await this.ctx.storage.setAlarm(Date.now() + 20_000);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  /** Alarms do the lifecycle work: grace expiry, forfeit, idle expiry. */
  async alarm(): Promise<void> {
    const now = Date.now();
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

  private async scheduleSweep(): Promise<void> {
    if (this.sockets.size > 0) return;
    const at = this.room.lastActivityAt + 60_000;
    const existing = await this.ctx.storage.getAlarm();
    if (existing === null || existing > at) await this.ctx.storage.setAlarm(at);
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
