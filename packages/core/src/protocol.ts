/**
 * The room-socket wire protocol as one runtime-checked module (`docs/02-reference/api/signaling.md`).
 *
 * Before this file existed the client declared a union type and the Durable Object read whatever
 * arrived, so a renamed field turned into a silent no-op instead of an error — `team_assign` shipped
 * in exactly that state. Every frame now crosses `parseClientFrame`/`parseServerFrame`, which is the
 * single place that knows the field sets, the size budgets and the error codes.
 *
 * The parsers are pure: no DOM, no network, no Phaser (`NFR-22`), so the Worker, the browser and the
 * tests all run the same checks.
 */
import { MAPS_BY_ID } from "./data/maps.js";
import { isModeId } from "./data/modes.js";
import type { LoadoutEntry, ModeId, RoomState, Snapshot, Team } from "./types.js";

export const PROTOCOL_VERSION = 1;

/** `docs/02-reference/api/signaling.md` § Budgets. */
export const MAX_SIGNAL_BYTES = 8_192;
export const MAX_SNAPSHOT_BYTES = 8_192;
/** `US-ROOM-007`: a lobby loadout may hold at most eleven consumables in total. */
export const MAX_LOADOUT_QUANTITY = 11;
export const PING_INTERVAL_MS = 15_000;
/** Three missed heartbeats (45 s of silence) move a member to `grace`. */
export const PING_MISSES_BEFORE_GRACE = 3;

/** Codes from the [error catalogue](../docs/02-reference/api/README.md#error-catalogue) a socket may raise. */
export type ErrorCode =
  | "bad-request"
  | "unsupported-message"
  | "payload-too-large"
  | "rate-limited"
  | "not-host"
  | "invalid-state"
  | "room-not-full"
  | "not-enough-players"
  | "teams-not-balanced"
  | "peer-not-connected"
  | "snapshot-too-large"
  | "internal";

/**
 * The payload carries the WebRTC step (`kind`) as well as the artifact: without it a receiver cannot
 * tell an offer from an answer, and both are `{ sdp }`.
 */
export interface SignalPayload {
  readonly kind: "offer" | "answer" | "candidate";
  readonly sdp?: string;
  readonly candidate?: unknown;
}

export interface TeamAssignment {
  readonly playerId: string;
  readonly team: Team | null;
}

export type { LoadoutEntry };

export interface MatchStat {
  readonly slot: number;
  readonly damageDealt: number;
  readonly shotsFired: number;
  readonly hits: number;
  readonly forfeited?: boolean;
}

export interface MatchEndFrame {
  readonly t: "match_end";
  readonly winnerTeam: Team | null;
  readonly stats: readonly MatchStat[];
}

/** Client → Durable Object. § 2 and § 9 of the signalling reference. */
export type ClientFrame =
  | { readonly t: "auth"; readonly token: string; readonly mobileId?: string; readonly displayName?: string; readonly avatarId?: string }
  | { readonly t: "signal"; readonly to: string; readonly payload: SignalPayload }
  | { readonly t: "team_assign"; readonly assignments: readonly TeamAssignment[] }
  | { readonly t: "start_match" }
  | { readonly t: "snapshot_push"; readonly snapshot: Snapshot }
  | MatchEndFrame
  | {
      readonly t: "room_settings";
      readonly mode: ModeId;
      readonly mapId: string;
      readonly maxPlayers?: 2 | 4 | 6 | 8 | undefined;
      readonly isPrivate?: boolean | undefined;
    }
  | { readonly t: "loadout"; readonly items: readonly LoadoutEntry[] }
  | { readonly t: "move"; readonly direction: 0 | 1; readonly run: boolean }
  | { readonly t: "item"; readonly id: string }
  | { readonly t: "leave" }
  | { readonly t: "ping"; readonly at: number }
  | {
      /** A preset quick phrase or emote; a free `text` is allowed too, bounded to 120 characters. */
      readonly t: "chat";
      readonly kind?: "quick_phrase" | "emote" | undefined;
      readonly id?: string | undefined;
      readonly text?: string | undefined;
    };

export interface PeerLeftFrame {
  readonly t: "peer_left";
  readonly playerId: string;
  readonly reason: "left" | "grace" | "disconnected";
}

/** Durable Object → client. § 3 of the signalling reference. */
export type ServerFrame =
  | { readonly t: "room_state"; readonly room: RoomState; readonly you?: { readonly playerId: string; readonly slot: number } }
  | { readonly t: "peer_joined"; readonly playerId: string; readonly slot: number; readonly room: RoomState }
  | PeerLeftFrame
  | { readonly t: "signal"; readonly from: string; readonly payload: SignalPayload }
  | { readonly t: "host_changed"; readonly hostPlayerId: string; readonly hostGeneration: number; readonly lastSnapshot: Snapshot | null; readonly room: RoomState }
  | {
      readonly t: "match_started";
      readonly startedAt: number;
      readonly seed: number;
      readonly hostPlayerId: string | null;
      readonly hostGeneration: number;
      readonly rulesetVersion: string;
      readonly assignments: readonly {
        readonly playerId: string;
        readonly slot: number;
        readonly team: Team | null;
        readonly mobileId: string;
        readonly accountId: string | null;
        readonly loadout: readonly LoadoutEntry[];
      }[];
      readonly room: RoomState;
    }
  | { readonly t: "snapshot_state"; readonly snapshot: Snapshot }
  | {
      readonly t: "match_recorded";
      readonly matchId: string;
      readonly winnerTeam: Team | null;
      readonly ranked: boolean;
      readonly ratings: readonly { readonly accountId: string; readonly before: number; readonly after: number; readonly delta: number }[];
      readonly players: readonly { readonly slot: number; readonly result: "win" | "loss" | "abandon" }[];
    }
  | { readonly t: "move"; readonly from: string; readonly direction: 0 | 1; readonly run: boolean }
  | { readonly t: "item"; readonly from: string; readonly id: string }
  | { readonly t: "room_closed"; readonly reason: "expired" | "empty" | "closed" }
  | { readonly t: "pong"; readonly at: number; readonly now: number }
  | { readonly t: "error"; readonly code: ErrorCode; readonly detail: string };

export type ParseResult<T> = { readonly ok: true; readonly frame: T } | { readonly ok: false; readonly code: ErrorCode; readonly detail: string };

const ok = <T>(frame: T): ParseResult<T> => ({ ok: true, frame });
const fail = <T>(code: ErrorCode, detail: string): ParseResult<T> => ({ ok: false, code, detail });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isTeam(value: unknown): value is Team {
  return value === "A" || value === "B";
}

/** Rejects anything the frame is not allowed to carry, so a typo surfaces here and not in the room. */
function onlyKeys(frame: Record<string, unknown>, allowed: readonly string[], t: string): string | null {
  for (const key of Object.keys(frame)) {
    if (!allowed.includes(key)) return `${t} does not accept "${key}"`;
  }
  return null;
}

/**
 * UTF-8 length without `TextEncoder`: `packages/core/tsconfig.json` pins `lib: ES2023` and `types: []`,
 * which is what keeps DOM and Node globals out of the engine (`TC-FND-018`).
 */
function utf8Bytes(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const point = char.codePointAt(0) ?? 0;
    if (point < 0x80) bytes += 1;
    else if (point < 0x800) bytes += 2;
    else if (point < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

function parseSignal(to: unknown, payload: unknown): ParseResult<SignalPayload> {
  if (typeof to !== "string" || to.length === 0) return fail("bad-request", "signal.to must be a player id");
  if (!isRecord(payload)) return fail("bad-request", "signal.payload must be an object");
  const kind = payload["kind"];
  if (kind !== "offer" && kind !== "answer" && kind !== "candidate") {
    return fail("bad-request", "signal.payload.kind must be offer, answer or candidate");
  }
  if (kind === "candidate") {
    if (!isRecord(payload["candidate"])) return fail("bad-request", "a candidate signal needs a candidate object");
    return ok({ kind, candidate: payload["candidate"] });
  }
  const sdp = payload["sdp"];
  if (typeof sdp !== "string" || sdp.length === 0) return fail("bad-request", `${kind} needs an sdp`);
  if (utf8Bytes(sdp) > MAX_SIGNAL_BYTES) {
    return fail("payload-too-large", `an sdp over ${MAX_SIGNAL_BYTES} bytes is refused`);
  }
  return ok({ kind, sdp });
}

function parseAssignments(value: unknown): ParseResult<readonly TeamAssignment[]> {
  if (!Array.isArray(value) || value.length === 0) return fail("bad-request", "team_assign needs a non-empty assignments[]");
  const assignments: TeamAssignment[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return fail("bad-request", "each assignment must be an object");
    const playerId = entry["playerId"];
    const team = entry["team"];
    if (typeof playerId !== "string" || playerId.length === 0) return fail("bad-request", "assignment.playerId is required");
    if (team !== null && !isTeam(team)) return fail("bad-request", "assignment.team must be A, B or null");
    assignments.push({ playerId, team: team ?? null });
  }
  return ok(assignments);
}

function parseLoadout(value: unknown): ParseResult<readonly LoadoutEntry[]> {
  if (!Array.isArray(value)) return fail("bad-request", "loadout.items must be an array");
  const items: LoadoutEntry[] = [];
  let total = 0;
  for (const entry of value) {
    if (!isRecord(entry)) return fail("bad-request", "each loadout entry must be an object");
    const id = entry["id"];
    const qty = entry["qty"];
    if (typeof id !== "string" || id.length === 0) return fail("bad-request", "loadout entry needs an id");
    if (!isInteger(qty) || qty < 0) return fail("bad-request", "loadout qty must be a whole number");
    total += qty;
    items.push({ id, qty });
  }
  if (total > MAX_LOADOUT_QUANTITY) {
    return fail("bad-request", `a loadout may hold at most ${MAX_LOADOUT_QUANTITY} items in total`);
  }
  return ok(items);
}

/**
 * A snapshot is the one frame a peer trusts without looking, so every field the peer dereferences is
 * checked here: an empty `players: []` used to be accepted and then threw inside the peer's React tree.
 */
function parseSnapshot(value: unknown): ParseResult<Snapshot> {
  if (!isRecord(value)) return fail("bad-request", "snapshot_push needs a snapshot");
  if (!isInteger(value["seq"]) || (value["seq"] as number) < 0) return fail("bad-request", "snapshot.seq must be a whole number");
  if (!isInteger(value["hostGeneration"])) return fail("bad-request", "snapshot.hostGeneration is required");
  if (!Array.isArray(value["players"])) return fail("bad-request", "snapshot.players must be an array");
  const players = value["players"];
  if (players.length === 0) return fail("bad-request", "snapshot.players cannot be empty");
  if (players.length > 8) return fail("bad-request", "snapshot.players cannot exceed eight slots");
  for (const entry of players) {
    if (!isRecord(entry)) return fail("bad-request", "each snapshot player must be an object");
    if (!isInteger(entry["slot"]) || (entry["slot"] as number) < 0 || (entry["slot"] as number) > 7) {
      return fail("bad-request", "snapshot player.slot must be 0–7");
    }
    for (const field of ["hp", "shield", "energy", "x", "y", "facing", "delay"]) {
      if (typeof entry[field] !== "number" || !Number.isFinite(entry[field] as number)) {
        return fail("bad-request", `snapshot player.${field} must be a finite number`);
      }
    }
  }
  const turn = value["turn"];
  if (!isRecord(turn)) return fail("bad-request", "snapshot.turn is required");
  if (!isInteger(turn["activeSlot"]) || (turn["activeSlot"] as number) < 0 || (turn["activeSlot"] as number) > 7) {
    return fail("bad-request", "snapshot.turn.activeSlot is required");
  }
  if (!isInteger(turn["round"]) || (turn["round"] as number) < 1) return fail("bad-request", "snapshot.turn.round is required");
  if (value["status"] !== "playing" && value["status"] !== "ended") {
    return fail("bad-request", "snapshot.status must be playing or ended");
  }
  if (value["terrain"] !== undefined && typeof value["terrain"] !== "string") {
    return fail("bad-request", "snapshot.terrain must be an RLE string");
  }
  const bytes = utf8Bytes(JSON.stringify(value));
  if (bytes > MAX_SNAPSHOT_BYTES) {
    return fail("snapshot-too-large", `a snapshot over ${MAX_SNAPSHOT_BYTES} bytes is refused`);
  }
  return ok(value as unknown as Snapshot);
}

function parseMatchEnd(frame: Record<string, unknown>): ParseResult<MatchEndFrame> {
  const winner = frame["winnerTeam"];
  // `winnerTeam` is not optional: an absent value silently means a draw, which is a result, not a default.
  if (winner !== null && !isTeam(winner)) {
    return fail("bad-request", "match_end.winnerTeam must be A, B or null");
  }
  const rawStats = frame["stats"];
  if (!Array.isArray(rawStats)) return fail("bad-request", "match_end needs stats[]");
  const stats: MatchStat[] = [];
  for (const entry of rawStats) {
    if (!isRecord(entry)) return fail("bad-request", "each match_end stat must be an object");
    const slot = entry["slot"];
    const damageDealt = entry["damageDealt"];
    const shotsFired = entry["shotsFired"];
    const hits = entry["hits"];
    if (!isInteger(slot) || slot < 0 || slot > 7) return fail("bad-request", "stat.slot must be 0–7");
    if (!isInteger(damageDealt) || damageDealt < 0) return fail("bad-request", "stat.damageDealt must be a whole number");
    if (!isInteger(shotsFired) || shotsFired < 0) return fail("bad-request", "stat.shotsFired must be a whole number");
    if (!isInteger(hits) || hits < 0) return fail("bad-request", "stat.hits must be a whole number");
    stats.push({
      slot,
      damageDealt,
      shotsFired,
      hits,
      ...(entry["forfeited"] === true ? { forfeited: true } : {}),
    });
  }
  return ok({ t: "match_end", winnerTeam: (winner ?? null) as Team | null, stats });
}

/** Parse one inbound frame. `raw` is the decoded text of a single WebSocket message. */
export function parseClientFrame(raw: string): ParseResult<ClientFrame> {
  if (utf8Bytes(raw) > MAX_SNAPSHOT_BYTES * 2) return fail("payload-too-large", "frame is larger than the socket budget");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail("bad-request", "body is not JSON");
  }
  if (!isRecord(parsed)) return fail("bad-request", "a frame must be a JSON object");
  const t = parsed["t"];
  if (typeof t !== "string" || t.length === 0) return fail("bad-request", "a frame needs a t");

  switch (t) {
    case "auth": {
      const extra = onlyKeys(parsed, ["t", "token", "mobileId", "displayName", "avatarId"], t);
      if (extra) return fail("bad-request", extra);
      if (typeof parsed["token"] !== "string" || parsed["token"].length === 0) {
        return fail("bad-request", "auth needs a token");
      }
      return ok({
        t: "auth",
        token: parsed["token"],
        ...(typeof parsed["mobileId"] === "string" ? { mobileId: parsed["mobileId"] } : {}),
        ...(typeof parsed["displayName"] === "string" ? { displayName: parsed["displayName"] } : {}),
        ...(typeof parsed["avatarId"] === "string" ? { avatarId: parsed["avatarId"] } : {}),
      });
    }
    case "signal": {
      const extra = onlyKeys(parsed, ["t", "to", "payload"], t);
      if (extra) return fail("bad-request", extra);
      const signal = parseSignal(parsed["to"], parsed["payload"]);
      return signal.ok ? ok({ t: "signal", to: parsed["to"] as string, payload: signal.frame }) : fail(signal.code, signal.detail);
    }
    case "team_assign": {
      const extra = onlyKeys(parsed, ["t", "assignments"], t);
      if (extra) return fail("bad-request", extra);
      const assignments = parseAssignments(parsed["assignments"]);
      return assignments.ok ? ok({ t: "team_assign", assignments: assignments.frame }) : fail(assignments.code, assignments.detail);
    }
    case "start_match": {
      const extra = onlyKeys(parsed, ["t"], t);
      return extra ? fail("bad-request", extra) : ok({ t: "start_match" });
    }
    case "snapshot_push": {
      const extra = onlyKeys(parsed, ["t", "snapshot"], t);
      if (extra) return fail("bad-request", extra);
      const snapshot = parseSnapshot(parsed["snapshot"]);
      return snapshot.ok ? ok({ t: "snapshot_push", snapshot: snapshot.frame }) : fail(snapshot.code, snapshot.detail);
    }
    case "match_end": {
      const extra = onlyKeys(parsed, ["t", "winnerTeam", "stats"], t);
      if (extra) return fail("bad-request", extra);
      return parseMatchEnd(parsed);
    }
    case "room_settings": {
      const extra = onlyKeys(parsed, ["t", "mode", "mapId", "maxPlayers", "isPrivate"], t);
      if (extra) return fail("bad-request", extra);
      const rawMode = parsed["mode"];
      // An unknown mode must die here, not at `createMatch`: the room would otherwise cast a string into a
      // mode the rules engine has never heard of (`US-CORE-010` AC7).
      if (typeof rawMode !== "string" || !isModeId(rawMode)) {
        return fail("bad-request", "room_settings.mode must be one of solo, score, tag, jewel");
      }
      if (typeof parsed["mapId"] !== "string" || !MAPS_BY_ID.has(parsed["mapId"])) {
        return fail("bad-request", `room_settings.mapId is not a known map: ${String(parsed["mapId"])}`);
      }
      const rawCapacity = parsed["maxPlayers"];
      if (rawCapacity !== undefined && rawCapacity !== 2 && rawCapacity !== 4 && rawCapacity !== 6 && rawCapacity !== 8) {
        return fail("bad-request", "room_settings.maxPlayers must be 2, 4, 6 or 8");
      }
      const rawPrivate = parsed["isPrivate"];
      if (rawPrivate !== undefined && typeof rawPrivate !== "boolean") {
        return fail("bad-request", "room_settings.isPrivate must be a boolean");
      }
      return ok({
        t: "room_settings",
        mode: rawMode,
        mapId: parsed["mapId"] as string,
        ...(rawCapacity === undefined ? {} : { maxPlayers: rawCapacity as 2 | 4 | 6 | 8 }),
        ...(rawPrivate === undefined ? {} : { isPrivate: rawPrivate as boolean }),
      });
    }
    case "loadout": {
      const extra = onlyKeys(parsed, ["t", "items"], t);
      if (extra) return fail("bad-request", extra);
      const items = parseLoadout(parsed["items"]);
      return items.ok ? ok({ t: "loadout", items: items.frame }) : fail(items.code, items.detail);
    }
    case "move": {
      const extra = onlyKeys(parsed, ["t", "direction", "run"], t);
      if (extra) return fail("bad-request", extra);
      const direction = parsed["direction"];
      if (direction !== 0 && direction !== 1) return fail("bad-request", "move.direction must be 0 or 1");
      if (typeof parsed["run"] !== "boolean") return fail("bad-request", "move.run must be a boolean");
      return ok({ t: "move", direction, run: parsed["run"] });
    }
    case "item": {
      const extra = onlyKeys(parsed, ["t", "id"], t);
      if (extra) return fail("bad-request", extra);
      if (typeof parsed["id"] !== "string" || parsed["id"].length === 0) return fail("bad-request", "item needs an id");
      return ok({ t: "item", id: parsed["id"] });
    }
    case "leave": {
      const extra = onlyKeys(parsed, ["t"], t);
      if (extra) return fail("bad-request", extra);
      return ok({ t: "leave" });
    }
    case "chat": {
      const extra = onlyKeys(parsed, ["t", "kind", "id", "text"], t);
      if (extra) return fail("bad-request", extra);
      const rawKind = parsed["kind"];
      const rawId = parsed["id"];
      const rawText = parsed["text"];
      if (rawKind !== undefined && rawKind !== "quick_phrase" && rawKind !== "emote") {
        return fail("bad-request", 'chat.kind must be "quick_phrase" or "emote"');
      }
      if (rawId !== undefined && typeof rawId !== "string") return fail("bad-request", "chat.id must be a string");
      if (rawText !== undefined && (typeof rawText !== "string" || rawText.length > 120)) {
        return fail("bad-request", "chat.text must be a string of at most 120 characters");
      }
      if (rawKind === undefined && rawText === undefined) return fail("bad-request", "chat needs a kind or a text");
      const chatKind = rawKind as "quick_phrase" | "emote" | undefined;
      const chatId = rawId as string | undefined;
      const chatText = rawText as string | undefined;
      return ok({
        t: "chat",
        ...(chatKind === undefined ? {} : { kind: chatKind }),
        ...(chatId === undefined ? {} : { id: chatId }),
        ...(chatText === undefined ? {} : { text: chatText }),
      });
    }
    case "ping": {
      const extra = onlyKeys(parsed, ["t", "at"], t);
      if (extra) return fail("bad-request", extra);
      if (!isInteger(parsed["at"])) return fail("bad-request", "ping.at must be a whole-millisecond timestamp");
      return ok({ t: "ping", at: parsed["at"] as number });
    }
    default:
      return fail("unsupported-message", `${t} is not a client frame`);
  }
}

/**
 * Client-side counterpart. The browser trusts the server less than the server trusts the browser: an
 * unknown or malformed frame is dropped instead of throwing into the React tree.
 */
export function parseServerFrame(raw: string): ParseResult<ServerFrame> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail("bad-request", "body is not JSON");
  }
  if (!isRecord(parsed)) return fail("bad-request", "a frame must be a JSON object");
  const t = parsed["t"];
  switch (t) {
    case "room_state":
    case "peer_joined":
    case "peer_left":
    case "signal":
    case "host_changed":
    case "match_started":
    case "snapshot_state":
    case "match_recorded":
    case "move":
    case "item":
    case "pong":
      return ok(parsed as unknown as ServerFrame);
    case "room_closed": {
      const reason = parsed["reason"];
      if (reason !== "expired" && reason !== "empty" && reason !== "closed") {
        return fail("bad-request", "room_closed.reason must be expired, empty or closed");
      }
      return ok({ t: "room_closed", reason });
    }
    case "error":
      return ok(parsed as unknown as ServerFrame);
    default:
      return fail("unsupported-message", `${String(t)} is not a server frame`);
  }
}
