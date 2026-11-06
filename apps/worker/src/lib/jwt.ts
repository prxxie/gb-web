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

/**
 * Was the failure ours (we could not fetch the keys) or the token's?
 *
 * A rejected signature is the caller's problem; an unreachable JWKS with nothing cached is ours, and the
 * client should retry rather than sign in again (`US-AUTH-002` AC4).
 */
function isKeyFetchFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && code.startsWith("ERR_JWKS")) return true;
  // `jose` reports a non-200 JWKS response as a generic error carrying this message, so match on it: a
  // broken upstream and a forged token must not share an answer (`US-AUTH-002` AC4).
  const message = error instanceof Error ? error.message : "";
  return code === "ERR_JOSE_GENERIC" && /JSON Web Key Set HTTP response/i.test(message);
}

export interface VerifyOptions {
  /** The `azp` values a token may carry: the project's own origins (`US-AUTH-002` AC3). */
  readonly authorizedParties?: readonly string[];
}

export async function verifyClerkJwt(
  token: string,
  issuer: string,
  options: VerifyOptions = {},
): Promise<VerifiedIdentity> {
  let payload: JWTPayload;
  try {
    const result = await jwtVerify(token, jwksFor(issuer), {
      issuer,
      clockTolerance: 30,
    });
    payload = result.payload;
  } catch (error) {
    if (isKeyFetchFailure(error)) {
      throw new ProblemError("unavailable", "Clerk's key set is unreachable", [], 5);
    }
    throw new ProblemError("unauthenticated", error instanceof Error ? error.message : "Clerk token rejected");
  }
  if (!payload.sub) throw new ProblemError("unauthenticated", "Clerk token has no subject");
  const parties = options.authorizedParties ?? [];
  if (parties.length > 0 && typeof payload.azp === "string" && !parties.includes(payload.azp)) {
    // A token minted for another application is not ours to accept, even when Clerk signed it.
    throw new ProblemError("unauthenticated", "Clerk token was issued for another application");
  }
  const email = typeof payload["email"] === "string" ? (payload["email"] as string) : null;
  return { subject: payload.sub, email };
}

/** A test seam: drop the cached JWKS (used when the issuer changes between tests). */
export function resetJwksCache(): void {
  cached = null;
}
