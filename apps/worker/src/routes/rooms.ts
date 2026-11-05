/**
 * Room endpoints (`docs/02-reference/api/rooms.md`, `US-ROOM-001`, `US-ROOM-006`).
 *
 * The Worker holds no room state: it validates the request, picks a free code, and hands everything
 * to the `Room` Durable Object, which is the single writer for that code (`ADR-0003`).
 */
import {
  ALLOWED_CAPACITIES,
  isValidRoomCode,
  makeRoomCode,
  type RoomSettings,
  type Snapshot,
} from "@gbw/core";
import type { Env } from "../lib/db.js";
import { ProblemError } from "../lib/problem.js";
import { checkLimit, RULES } from "../lib/ratelimit.js";
import type { SessionToken } from "../lib/session.js";
import { Field, readJson } from "../lib/validation.js";

const CODE_ATTEMPTS = 5;

export interface RoomHandle {
  readonly roomCode: string;
  readonly wsUrl: string;
}

function stubFor(env: Env, roomCode: string): DurableObjectStub {
  const id = env.ROOMS.idFromName(roomCode);
  return env.ROOMS.get(id);
}

async function callRoom<T>(stub: DurableObjectStub, path: string, body?: unknown): Promise<T> {
  const response = await stub.fetch(`https://room.internal/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { type?: string };
    const type = (payload.type ?? "internal") as
      | "room-not-found"
      | "room-full"
      | "room-closed"
      | "not-host"
      | "internal";
    throw new ProblemError(type, `room service answered ${response.status}`);
  }
  return (await response.json()) as T;
}

export interface CreateRoomInput {
  readonly displayName: string;
  readonly mobileId: string;
  readonly avatarId: string;
  readonly maxPlayers: RoomSettings["maxPlayers"];
  readonly mode: RoomSettings["mode"];
  readonly mapId: string;
  readonly isPrivate: boolean;
}

export async function createRoom(
  request: Request,
  env: Env,
  session: SessionToken,
  originBase: string,
): Promise<Response> {
  const limit = checkLimit(`rooms:${request.headers.get("cf-connecting-ip") ?? "local"}`, RULES.roomsPerIp);
  if (!limit.allowed) throw new ProblemError("rate-limited", "Too many rooms created from this address");

  const body = await readJson(request);
  const field = new Field([]);
  const displayName = field.string(body["displayName"] ?? "Player", "displayName", { min: 2, max: 16 });
  const mobileId = field.string(body["mobileId"] ?? "mbl-01", "mobileId");
  const avatarId = field.string(body["avatarId"] ?? "avatar-01", "avatarId");
  const maxPlayers = field.oneOf(body["maxPlayers"] ?? 4, "maxPlayers", ALLOWED_CAPACITIES) as RoomSettings["maxPlayers"];
  const mode = field.oneOf(body["mode"] ?? "solo", "mode", ["solo", "score", "tag", "jewel"] as const);
  const mapId = field.string(body["mapId"] ?? "map-01", "mapId");
  const isPrivate = typeof body["isPrivate"] === "boolean" ? body["isPrivate"] : false;
  field.done();

  const playerId = crypto.randomUUID();
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const roomCode = makeRoomCode(() => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32);
    try {
      const joined = await callRoom<{ room: unknown; member: { playerId: string } }>(stubFor(env, roomCode), "join", {
        playerId,
        accountId: session.sub.accountId,
        guestId: session.sub.guestId,
        displayName,
        avatarId,
        mobileId,
        roomCode,
        settings: { maxPlayers, mode, mapId, isPrivate } satisfies Partial<RoomSettings>,
      });
      return Response.json(
        {
          roomCode,
          playerId: joined.member.playerId,
          wsUrl: `${originBase}/api/v1/rooms/${roomCode}/ws`,
          maxPlayers,
          settings: { maxPlayers, mode, mapId, isPrivate },
          expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        },
        { status: 201 },
      );
    } catch (error) {
      if (error instanceof ProblemError && error.type === "room-full") continue;
      if (error instanceof ProblemError && error.type === "internal") continue;
      throw error;
    }
  }
  throw new ProblemError("internal", "Could not allocate a room code");
}

/** Join an existing room by code (`US-ROOM-002`). The roster lives in the Durable Object. */
export async function joinRoomByCode(
  request: Request,
  env: Env,
  session: SessionToken,
  roomCode: string,
  originBase: string,
): Promise<Response> {
  if (!isValidRoomCode(roomCode)) throw new ProblemError("room-not-found", "Room codes are six characters");
  const body = await readJson(request);
  const field = new Field([]);
  const displayName = field.string(body["displayName"] ?? "Player", "displayName", { min: 2, max: 16 });
  const mobileId = field.string(body["mobileId"] ?? "mbl-01", "mobileId");
  const avatarId = field.string(body["avatarId"] ?? "avatar-01", "avatarId");
  field.done();

  const joined = await callRoom<{ room: { settings: RoomSettings; status: string }; member: { playerId: string } }>(
    stubFor(env, roomCode),
    "join",
    {
      playerId: crypto.randomUUID(),
      accountId: session.sub.accountId,
      guestId: session.sub.guestId,
      displayName,
      avatarId,
      mobileId,
      roomCode,
    },
  );
  return Response.json(
    {
      roomCode,
      playerId: joined.member.playerId,
      wsUrl: `${originBase}/api/v1/rooms/${roomCode}/ws`,
      maxPlayers: joined.room.settings.maxPlayers,
      settings: joined.room.settings,
    },
    { status: 200 },
  );
}

export async function roomPreview(env: Env, roomCode: string): Promise<Response> {
  if (!isValidRoomCode(roomCode)) throw new ProblemError("room-not-found", "Room codes are six characters");
  const state = await callRoom<Record<string, unknown>>(stubFor(env, roomCode), "state");
  const members = Array.isArray(state["members"]) ? (state["members"] as Record<string, unknown>[]) : [];
  return Response.json(
    {
      roomCode,
      status: state["status"],
      settings: state["settings"],
      joined: members.length,
      playerCount: members.length,
      maxPlayers: (state["settings"] as { maxPlayers?: number } | undefined)?.maxPlayers ?? members.length,
      joinable: state["status"] === "lobby",
      hostDisplayName:
        (members.find((member) => member["playerId"] === state["hostPlayerId"])?.["displayName"] as string) ?? null,
      host: members.find((member) => member["role"] === "host") !== undefined,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

/**
 * The socket is proxied, not parsed — the DO owns the handshake and the message protocol.
 *
 * A browser cannot set an `Authorization` header on a WebSocket, so the session token travels in the
 * first `auth` frame and the DO verifies it there (`docs/02-reference/api/signaling.md`). This route
 * therefore requires no bearer header; it only filters the upgrade through to the room.
 */
export async function roomSocket(env: Env, roomCode: string, request: Request): Promise<Response> {
  if (!isValidRoomCode(roomCode)) throw new ProblemError("room-not-found", "Room codes are six characters");
  // The DO is reached through a reserved host, so its own `request.url` can never tell it the public
  // origin. The proxy passes it explicitly: `match_end` needs it to call back into `POST /matches`.
  return await stubFor(env, roomCode).fetch(`https://room.internal/ws`, {
    headers: {
      upgrade: request.headers.get("upgrade") ?? "websocket",
      "x-room-origin": new URL(request.url).origin,
    },
  });
}

export interface IceServer {
  readonly urls: string | readonly string[];
  readonly username?: string;
  readonly credential?: string;
}

/**
 * Short-lived TURN credentials (`NFR-10`). The key never leaves the Worker; if TURN is not
 * configured in this environment we still return the public STUN server so local play works.
 */
export async function turnCredentials(env: Env): Promise<Response> {
  const stun: IceServer = { urls: "stun:stun.cloudflare.com:3478" };
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) {
    return Response.json(
      { iceServers: [stun], ttlSeconds: 3600, turn: false },
      { headers: { "cache-control": "no-store" } },
    );
  }
  const ttlSeconds = 3600;
  const response = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ ttl: ttlSeconds }),
    },
  );
  if (!response.ok) throw new ProblemError("internal", "TURN credential service refused the request");
  const payload = (await response.json()) as { iceServers?: IceServer | IceServer[] };
  const servers = Array.isArray(payload.iceServers) ? payload.iceServers : payload.iceServers ? [payload.iceServers] : [];
  return Response.json(
    { iceServers: [stun, ...servers], ttlSeconds, turn: servers.length > 0 },
    { headers: { "cache-control": "no-store" } },
  );
}

export type RoomSnapshot = Snapshot;
