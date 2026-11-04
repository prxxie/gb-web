/**
 * Session tokens (`ADR-0002`, `docs/02-reference/api/accounts.md`).
 *
 * Two audiences, one format: a signed-in player proves identity with a **Clerk JWT** for the REST
 * calls that touch their profile, and everything that must also work for a guest (rooms, TURN,
 * signalling) uses a **60-minute session token** minted here. The token is an HMAC-SHA256 JWT-lite
 * (`base64url(payload).base64url(mac)`) signed with `SESSION_TOKEN_SECRET`; it carries no email and
 * expires on its own, so a leaked token is bounded in time and worthless for identity (`NFR-13`).
 */
import { ProblemError } from "./problem.js";

export interface SessionSubject {
  readonly kind: "guest" | "account";
  readonly guestId: string | null;
  readonly accountId: string | null;
}

export interface SessionToken {
  readonly sub: SessionSubject;
  readonly iat: number;
  readonly exp: number;
}

export const SESSION_TTL_MS = 60 * 60 * 1000;

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function mintSession(
  subject: SessionSubject,
  secret: string,
  now: number = Date.now(),
): Promise<{ token: string; expiresAt: number }> {
  const payload: SessionToken = { sub: subject, iat: now, exp: now + SESSION_TTL_MS };
  const encoded = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await key(secret), new TextEncoder().encode(encoded));
  return { token: `${encoded}.${b64url(new Uint8Array(signature))}`, expiresAt: payload.exp };
}

export async function verifySession(token: string, secret: string, now: number = Date.now()): Promise<SessionToken> {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) throw new ProblemError("unauthenticated", "Malformed session token");
  const valid = await crypto.subtle.verify(
    "HMAC",
    await key(secret),
    fromB64url(signature),
    new TextEncoder().encode(encoded),
  );
  if (!valid) throw new ProblemError("unauthenticated", "Session token does not verify");
  let payload: SessionToken;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromB64url(encoded))) as SessionToken;
  } catch {
    throw new ProblemError("unauthenticated", "Session token is not readable");
  }
  if (payload.exp <= now) throw new ProblemError("unauthenticated", "Session token expired");
  return payload;
}

/** Read `Authorization: Bearer <token>` or `X-Session-Token`. */
export function bearerOf(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  const custom = request.headers.get("x-session-token");
  return custom ? custom.trim() : null;
}

/** The guest id of a guest session; an account session has none. */
export function guestIdFor(token: SessionToken): string | null {
  return token.sub.guestId ?? null;
}
