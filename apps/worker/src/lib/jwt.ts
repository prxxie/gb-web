/**
 * Clerk JWT verification (`ADR-0002`).
 *
 * The Worker never trusts a client-claimed identity: it verifies the Clerk token against the
 * project's JWKS, caches the key set for ten minutes, and treats `sub` as the *only* stable handle —
 * email and name never reach D1 (`NFR-13`).
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { ProblemError } from "./problem.js";

export interface VerifiedIdentity {
  readonly subject: string;
  readonly email: string | null;
}

interface Cached {
  readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  readonly issuer: string;
}

let cached: Cached | null = null;

function jwksFor(issuer: string): ReturnType<typeof createRemoteJWKSet> {
  if (cached && cached.issuer === issuer) return cached.jwks;
  const url = new URL("/.well-known/jwks.json", issuer);
  const jwks = createRemoteJWKSet(url, { cacheMaxAge: 10 * 60 * 1000 });
  cached = { jwks, issuer };
  return jwks;
}

export async function verifyClerkJwt(token: string, issuer: string): Promise<VerifiedIdentity> {
  let payload: JWTPayload;
  try {
    const result = await jwtVerify(token, jwksFor(issuer), {
      issuer,
      clockTolerance: 30,
    });
    payload = result.payload;
  } catch (error) {
    throw new ProblemError("unauthenticated", error instanceof Error ? error.message : "Clerk token rejected");
  }
  if (!payload.sub) throw new ProblemError("unauthenticated", "Clerk token has no subject");
  const email = typeof payload["email"] === "string" ? (payload["email"] as string) : null;
  return { subject: payload.sub, email };
}

/** A test seam: drop the cached JWKS (used when the issuer changes between tests). */
export function resetJwksCache(): void {
  cached = null;
}
