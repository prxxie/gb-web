/**
 * `Room` Durable Object — the signalling hub for one room (`ADR-0004`).
 *
 * It owns nothing that decides the game: the host client runs the rules engine and streams snapshots, and this
 * object only keeps the roster, relays WebRTC offers/answers, stores the last snapshot so a migrating host can
 * adopt it, and enforces the room's lifecycle (idle sweep, 20 s grace, 24 h cap). That split is what keeps the
 * free plan viable — a room costs messages, not CPU-seconds of physics.
 *
 * What stays here is what only a Durable Object can do: the sockets, their metadata, the alarm wiring,
 * `ctx.storage` and the one `persist()`. Every rule it applies lives in `./room/`, as a function taking the
 * roster (and the socket map) explicitly and answering with the room to commit, the frames that announce it, or
 * the refusal to send: `presence` (seat, grace, silence) · `identity` (name, avatar, mobile) · `seats` (teams,
 * loadout, settings) · `election` (the role and its 5 s recheck) · `snapshot-relay` (the 10 Hz path) ·
 * `match-lifecycle` (`match_started`, a `match_end`'s guards) · `records` (`POST /matches`) · `relay` (`signal`,
 * `move`, `item`) · `sweep` (the alarm's order of events) · `rate-limit` (the budget) · `handshake` (upgrade,
 * `auth`, the gate before a frame is routed) · `rest` (join, leave, state) · `wire` (frames, delivery) ·
 * `protocol` (close codes, the refusal table).
 *
 * Wire protocol: `docs/02-reference/api/signaling.md`.
 */
import {
  TUNABLES, createRoom, isCurrentRuleset, type ErrorCode, type MatchEndFrame, type RoomMember, type RoomState, type Snapshot,
  type Team, type WireSnapshot,
} from "@gbw/core";
import type { Env } from "./lib/db.js";
import { hostOf, isLiveHost, planPromotion, withHostChange } from "./room/election.js";
import { withKnownMobiles } from "./room/identity.js";
import { armAuthTimeout, freshMeta, gateFrame, openSocket, refuseFrame, type SocketBinding } from "./room/handshake.js";
import { abandonedEnd, matchStarted, planEnd, startRoom, withStatus } from "./room/match-lifecycle.js";
import {
  dropSilentSockets, planDeparture, planDisconnect, silenceDeadline, silentSeats, withActivity,
} from "./room/presence.js";
import { CLOSE_ROOM_CLOSED, HOST_MIGRATION_RECHECK_MS, type RecordedMatch, type SocketMeta } from "./room/protocol.js";
import { participantToken, recordMatch, type RecordOutcome } from "./room/records.js";
import { relayInput, relaySignal } from "./room/relay.js";
import { joinRequest, leaveRequest, stateResponse, type RestOutcome } from "./room/rest.js";
import { applyLoadout, applyRoomSettings, assignTeams } from "./room/seats.js";
import { pushSnapshot, relaySnapshot } from "./room/snapshot-relay.js";
import { planSweep, sweepAt } from "./room/sweep.js";
import {
  broadcastFrame, deliver, hostChanged, matchRecorded, roomClosed, roomState, sendFrame, type Decision,
} from "./room/wire.js";

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
   * Candidates already tried since the host vanished (`US-ROOM-005` AC3). Empty means "no migration in flight";
   * a non-empty list means the next alarm must check that the promoted host is actually live.
   */
  private hostCheck: readonly string[] = [];
  /** The `match_recorded` payload, kept so a host retry after a network blip can be answered, not refused. */
  private recorded: RecordedMatch | null = null;
  /** Whether a player still holds an open socket; the election and both sweeps ask this. */
  private readonly isOpen = (playerId: string): boolean => this.sockets.has(playerId);
  /** The session a socket still holds; `POST /matches` accepts any player's, host first. */
  private readonly tokenOf = (socket: WebSocket): string | null => this.meta.get(socket)?.token ?? null;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {
    // An unnamed room: the Worker mints the code and hands it over with the host's first join, so a code that was
    // never minted leaves this empty — that is what tells a real room from a ghost (`rooms.md` § 404).
    this.room = createRoom({ roomCode: "", now: Date.now() });
    void this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<RoomState>("room");
      const storedSnapshot = await this.ctx.storage.get<Snapshot>("snapshot");
      const storedStart = await this.ctx.storage.get<number>("matchStartedAt");
      const storedOrigin = await this.ctx.storage.get<string>("origin");
      const storedHostCheck = await this.ctx.storage.get<string[]>("hostCheck");
      // A journal from another ruleset cannot be replayed: the flight constants moved (`US-BAL-004` AC5), so drop it.
      const snapshot = storedSnapshot && isCurrentRuleset(storedSnapshot) ? storedSnapshot : null;
      if (storedSnapshot && !snapshot) console.warn("refusing a stored snapshot from another ruleset", storedSnapshot.rulesetVersion);
      // A stored roster may name a dropped machine; `withKnownMobiles` substitutes the first one (`US-BAL-005` § 5).
      if (stored) this.room = withKnownMobiles({ ...stored, ...(snapshot ? { lastSnapshot: snapshot } : {}) });
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

  async fetch(request: Request): Promise<Response> {
    const action = new URL(request.url).pathname.split("/").pop() ?? "";
    if (action === "ws") return this.handleUpgrade(request);
    if (action === "join") return this.commitRest(await joinRequest(request, this.room));
    if (action === "leave") return this.commitRest(await leaveRequest(request, this.room));
    if (action === "state") return stateResponse(this.room);
    // `POST …/settings` and `POST …/start` used to live here; both bypassed the socket guards and the second one
    // stamped `rulesetVersion: settings.mode`. `room_settings` and `start_match` own those jobs (`signaling.md`).
    return new Response("not found", { status: 404 });
  }

  /** Commits what a REST call decided: the room, its record, the frames, and the sweep it may owe. */
  private async commitRest(outcome: RestOutcome): Promise<Response> {
    if (outcome.room) {
      this.room = outcome.room;
      await this.persist();
    }
    deliver(this.sockets, outcome.out ?? []);
    if (outcome.sweep) await this.scheduleSweep();
    return outcome.response;
  }

  private async handleUpgrade(request: Request): Promise<Response> {
    const opening = openSocket(request, this.room);
    if (!opening) return new Response("room closed", { status: 410 });
    this.ctx.acceptWebSocket(opening.server);
    this.meta.set(opening.server, freshMeta());
    this.origin = opening.origin ?? this.origin;
    // The origin is a constant per deployment, so it is written once and never rewritten (`N8`).
    if (opening.origin && this.persistedOrigin !== opening.origin) {
      this.persistedOrigin = opening.origin;
      await this.ctx.storage.put("origin", opening.origin);
    }
    armAuthTimeout(opening.server, this.meta);
    return new Response(null, { status: 101, webSocket: opening.client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const gate = { ws, raw, room: this.room, sockets: this.sockets, meta: this.meta, secret: this.env.SESSION_TOKEN_SECRET };
    const gated = await gateFrame(gate);
    if (gated.kind === "drop") return;
    if (gated.kind === "auth") return this.acceptSeat(gated.binding);
    const { frame, playerId, meta } = gated;
    switch (frame.t) {
      case "signal":
        return this.apply(ws, relaySignal(this.room, this.sockets, playerId, frame));
      case "team_assign":
        return this.apply(ws, assignTeams(this.room, playerId, frame.assignments));
      case "room_settings":
        return this.apply(ws, applyRoomSettings(this.room, playerId, frame));
      case "loadout":
        return this.apply(ws, applyLoadout(this.room, playerId, frame));
      case "move":
      case "item":
        return this.apply(ws, relayInput(this.room, this.sockets, playerId, frame));
      case "start_match":
        return this.onStartMatch(ws, playerId);
      case "snapshot_push":
        return this.onSnapshotPush(ws, playerId, frame);
      case "match_end":
        return this.onMatchEnd(ws, meta, frame);
      case "leave":
        return this.onLeave(ws, playerId);
      // Preset quick phrases go to everyone else and are never stored (`US-NET-004` § 4): only the id crosses, and
      // the copy is the receiver's own locale (`US-MATCH-004`).
      case "chat":
        return void broadcastFrame(this.sockets, { t: "chat", from: playerId, kind: frame.kind, id: frame.id }, playerId);
      case "ping":
        this.meta.set(ws, { ...meta, lastPingAt: Date.now() });
        sendFrame(ws, { t: "pong", at: frame.at, now: Date.now() });
        return void (await this.scheduleHeartbeatSweep());
    }
  }

  /** An `auth` frame: the seat, the role a returning host may have lost, then the frames that say so. */
  private async acceptSeat(bound: SocketBinding | null): Promise<void> {
    if (!bound) return;
    this.room = bound.room;
    if (bound.promoted) await this.announceHostChange(bound.promoted);
    await this.persist();
    deliver(this.sockets, bound.out);
    await this.scheduleSweep();
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const playerId = this.meta.get(ws)?.playerId;
    if (!playerId) return;
    this.sockets.delete(playerId);
    this.meta.delete(ws);
    // The seat keeps a 20 s grace (`US-ROOM-004`); the host *role* cannot wait that long (`US-ROOM-005` AC1).
    const plan = planDisconnect(this.room, playerId, Date.now());
    this.room = plan.room;
    await this.persist();
    deliver(this.sockets, plan.out);
    if (plan.previousHostId) await this.migrateHost();
    // Keep whichever alarm is sooner: this must not clobber the 24 h match cap set on `start_match`.
    await this.setAlarmIfSooner(Date.now() + (plan.previousHostId ? HOST_MIGRATION_RECHECK_MS : TUNABLES.roomGraceMs));
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  private async onStartMatch(ws: WebSocket, playerId: string): Promise<void> {
    const started = startRoom(this.room, playerId);
    if (!started.ok) return this.reject(ws, started.code, started.detail);
    this.matchStartedAt = started.startedAt;
    // Stored before the status, so a room can never be `playing` without the start its record is keyed on.
    await this.ctx.storage.put("matchStartedAt", started.startedAt);
    this.room = started.room;
    await this.persist();
    broadcastFrame(this.sockets, matchStarted(this.room, started.startedAt, started.seed));
    await this.ctx.storage.setAlarm(started.startedAt + 24 * 60 * 60 * 1000);
  }

  private async onSnapshotPush(
    ws: WebSocket,
    playerId: string,
    frame: { snapshot: Snapshot | WireSnapshot },
  ): Promise<void> {
    const pushed = pushSnapshot(this.room, playerId, frame.snapshot);
    if (!pushed.ok) return this.reject(ws, pushed.code, pushed.detail);
    if (!pushed.accepted) return;
    this.room = pushed.accepted.room;
    await this.ctx.storage.put("snapshot", pushed.accepted.snapshot);
    const recipients = [...this.sockets.keys()].filter((targetId) => targetId !== playerId);
    deliver(this.sockets, relaySnapshot(pushed.accepted.snapshot, recipients));
  }

  private async onMatchEnd(ws: WebSocket, meta: SocketMeta, frame: MatchEndFrame): Promise<void> {
    const plan = planEnd(this.room, meta.playerId, this.recorded);
    if (plan.kind === "refuse") return this.reject(ws, plan.code, plan.detail);
    if (plan.kind === "replay") {
      if (this.recorded) broadcastFrame(this.sockets, matchRecorded(this.recorded));
      return;
    }
    this.room = plan.room;
    await this.persist();
    broadcastFrame(this.sockets, roomState(this.room));
    const recorded = await this.submit(meta.token, frame, plan.endedAt, false);
    if (!recorded.ok) return this.reject(ws, "internal", recorded.detail);
    this.recorded = recorded.value;
    broadcastFrame(this.sockets, matchRecorded(recorded.value));
  }

  /** `POST /api/v1/matches`, with everything the object knows and a client cannot claim (`room/records.ts`). */
  private submit(token: string | null, frame: MatchEndFrame, endedAt: number, abandoned: boolean): Promise<RecordOutcome> {
    const { room, origin, matchStartedAt, recorded } = this;
    return recordMatch({ room, origin, token, matchStartedAt, frame, endedAt, abandoned, recorded });
  }

  /** `leave` on the socket: the seat goes now, and the role moves if it was the host's. */
  private async onLeave(ws: WebSocket, playerId: string): Promise<void> {
    const plan = planDeparture(this.room, playerId);
    this.room = plan.room;
    await this.persist();
    this.sockets.delete(playerId);
    this.meta.delete(ws);
    deliver(this.sockets, plan.out);
    if (plan.previousHostId) await this.announceHostChange(plan.previousHostId);
    broadcastFrame(this.sockets, roomState(this.room));
  }

  /** Broadcasts `host_changed` for a host that is already known to be gone. */
  private async announceHostChange(previousHostId: string): Promise<void> {
    const status = this.room.status === "playing" ? "abandoned" : this.room.status;
    this.room = this.room.hostPlayerId
      ? withHostChange(this.room, previousHostId)
      : withActivity(withStatus(this.room, status));
    await this.persist();
    if (this.room.hostPlayerId) broadcastFrame(this.sockets, hostChanged(this.room));
    broadcastFrame(this.sockets, roomState(this.room));
  }

  /**
   * Promotes the oldest connected peer and remembers who was tried (`US-ROOM-005` AC1/AC3). If the new host never
   * comes online, the alarm retries once with the next candidate and then abandons the room.
   */
  private async migrateHost(): Promise<void> {
    const plan = planPromotion(this.room, this.hostCheck, this.isOpen);
    this.room = plan.room;
    this.hostCheck = plan.hostCheck;
    if (!plan.promoted) {
      // Nobody left to promote. A lobby simply waits; a live match is over (`AC3`).
      if (!plan.abandoned) return;
      this.room = withActivity(this.room);
      await this.persist();
      broadcastFrame(this.sockets, roomState(this.room));
      return;
    }
    await this.announceHostChange(plan.previousHostId);
    // The recheck is what turns "promoted" into "playable" — five seconds is the NFR-06 budget.
    await this.setAlarmIfSooner(Date.now() + HOST_MIGRATION_RECHECK_MS);
  }

  /** Alarms do the lifecycle work: grace expiry, forfeit, idle expiry. `room/sweep.ts` holds the order. */
  async alarm(): Promise<void> {
    const now = Date.now();
    if (this.hostCheck.length > 0 && (await this.recheckHost())) return;
    const silent = silentSeats(this.sockets, this.meta, now);
    for (const action of planSweep({ room: this.room, matchStartedAt: this.matchStartedAt, silent, now })) {
      switch (action.kind) {
        case "commit":
          this.room = action.room;
          if (action.persist) await this.persist();
          deliver(this.sockets, action.out);
          break;
        case "forfeit": await this.recordAbandoned(action.winnerTeam); break;
        case "silence": dropSilentSockets(this.sockets, this.meta, action.playerIds); break;
        case "heartbeat": await this.scheduleHeartbeatSweep(); break;
        case "promote":
          this.room = { ...this.room, hostPlayerId: action.hostPlayerId };
          await this.announceHostChange(action.previousHostId);
          break;
        case "close":
          this.room = action.room;
          await this.ctx.storage.deleteAll();
          broadcastFrame(this.sockets, roomClosed(action.reason));
          for (const socket of this.sockets.values()) socket.close(CLOSE_ROOM_CLOSED, "room closed");
          return;
      }
    }
    await this.persist();
    await this.scheduleSweep();
  }

  /**
   * `US-ROOM-005` AC3: a migration that did not produce a live host inside 5 s retries once with the next candidate
   * and then gives the room up. Runs before the grace sweep, so a dead host cannot be "re-elected" by it.
   * Returns `true` when this alarm must stop here.
   */
  private async recheckHost(): Promise<boolean> {
    if (isLiveHost(this.room, this.isOpen)) {
      this.hostCheck = [];
      await this.persist();
      return false;
    }
    const previousHostId = hostOf(this.room)?.playerId ?? "";
    const plan = planPromotion(this.room, this.hostCheck, this.isOpen);
    this.room = plan.room;
    this.hostCheck = plan.hostCheck;
    if (!plan.promoted) {
      // Every candidate is exhausted: the match cannot continue (`AC3`).
      if (plan.abandoned) await this.persist();
      this.hostCheck = [];
      await this.persist();
      return false;
    }
    await this.announceHostChange(previousHostId);
    await this.persist();
    await this.setAlarmIfSooner(Date.now() + HOST_MIGRATION_RECHECK_MS);
    return true;
  }

  /**
   * Record a forfeited match (`US-ROOM-004` AC6). The abandoning team's seats are reported as `abandon`, the
   * survivors as `win`, and the numbers are zeros because nobody was there to report them. Any connected
   * participant's token will do: `POST /matches` authorises the submitter as a player, not as the host.
   */
  private async recordAbandoned(winnerTeam: Team): Promise<void> {
    const token = participantToken(this.room.hostPlayerId, this.sockets, this.tokenOf);
    if (!token || !this.origin) return;
    const recorded = await this.submit(token, abandonedEnd(this.room, winnerTeam), Date.now(), true);
    if (!recorded.ok) return;
    this.recorded = recorded.value;
    broadcastFrame(this.sockets, matchRecorded(recorded.value));
  }

  private async scheduleHeartbeatSweep(): Promise<void> {
    await this.setAlarmIfSooner(Date.now() + silenceDeadline());
  }

  private async scheduleSweep(): Promise<void> {
    const at = sweepAt(this.room, this.sockets.size, Date.now());
    if (at !== null) await this.setAlarmIfSooner(at);
  }

  /** Keeps whichever alarm is sooner, so a heartbeat sweep never clobbers the 24 h match cap. */
  private async setAlarmIfSooner(at: number): Promise<void> {
    const existing = await this.ctx.storage.getAlarm();
    if (existing === null || existing > at) await this.ctx.storage.setAlarm(at);
  }

  /** Applies a frame's decision: the roster change, its record, then the frames a collaborator produced. */
  private async apply(ws: WebSocket, decision: Decision): Promise<void> {
    if (!decision.ok) return this.reject(ws, decision.code, decision.detail);
    if (decision.room) {
      this.room = decision.room;
      await this.persist();
    }
    deliver(this.sockets, decision.out ?? []);
  }

  /** One refusal: the sender hears `{t:"error"}`, and the runbook gets one structured line (see `refuseFrame`). */
  private reject(ws: WebSocket, code: ErrorCode, detail: string): void {
    refuseFrame(ws, this.room.roomCode, this.meta, code, detail);
  }

  /** Exposed for tests: the roster as the browser sees it. */
  debugState(): readonly RoomMember[] {
    return this.room.members;
  }
}
