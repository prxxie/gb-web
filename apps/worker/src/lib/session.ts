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

const HEADER = { alg: "HS256", typ: "JWT" } as const;

interface Claims {
  readonly sub: string;
  readonly kind: "guest" | "account";
  readonly guestId: string | null;
  readonly accountId: string | null;
  readonly iat: number;
  readonly exp: number;
}

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
  // An empty secret produces a zero-length HMAC key, which WebCrypto rejects with a cryptic
  // DataError. A missing binding is a configuration fault, so it is named as one (`rule 06`).
  if (secret.trim() === "") {
    throw new ProblemError("internal", "SESSION_TOKEN_SECRET is not configured");
  }
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
  const issuedAt = Math.floor(now / 1000);
  const claims: Claims = {
    sub: subject.accountId ?? subject.guestId ?? "",
    kind: subject.kind,
    guestId: subject.guestId,
    accountId: subject.accountId,
    iat: issuedAt,
    exp: issuedAt + SESSION_TTL_MS / 1000,
  };
  const header = b64url(new TextEncoder().encode(JSON.stringify(HEADER)));
  const encoded = b64url(new TextEncoder().encode(JSON.stringify(claims)));
  const signingInput = `${header}.${encoded}`;
  const signature = await crypto.subtle.sign("HMAC", await key(secret), new TextEncoder().encode(signingInput));
  return { token: `${signingInput}.${b64url(new Uint8Array(signature))}`, expiresAt: claims.exp * 1000 };
}

export async function verifySession(token: string, secret: string, now: number = Date.now()): Promise<SessionToken> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new ProblemError("unauthenticated", "Malformed session token");
  const [header, encoded, signature] = parts as [string, string, string];
  const valid = await crypto.subtle.verify(
    "HMAC",
    await key(secret),
    fromB64url(signature),
    new TextEncoder().encode(`${header}.${encoded}`),
  );
  if (!valid) throw new ProblemError("unauthenticated", "Session token does not verify");
  let claims: Claims;
  try {
    claims = JSON.parse(new TextDecoder().decode(fromB64url(encoded))) as Claims;
  } catch {
    throw new ProblemError("unauthenticated", "Session token is not readable");
  }
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now) {
    throw new ProblemError("unauthenticated", "Session token expired");
  }
  if (claims.kind !== "guest" && claims.kind !== "account") {
    throw new ProblemError("unauthenticated", "Session token has no subject kind");
  }
  return {
    sub: { kind: claims.kind, guestId: claims.guestId ?? null, accountId: claims.accountId ?? null },
    iat: Number(claims.iat) * 1000,
    exp: Number(claims.exp) * 1000,
  };
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
