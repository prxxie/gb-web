/**
 * A Clerk stand-in for the tests that need a verifiable JWT: a real RS256 key pair signed with `jose`,
 * and a JWKS document served through a patched `globalThis.fetch` (the seam `createRemoteJWKSet` uses).
 */
import { SignJWT, exportJWK, generateKeyPair } from "jose";

import { resetJwksCache } from "../../src/lib/jwt";
import { TEST_ISSUER } from "./fake-worker";

export interface FakeClerkOptions {
  readonly issuer?: string;
  readonly kid?: string;
  /** Serve a broken JWKS endpoint instead of the key, to exercise the verification-failure path. */
  readonly brokenJwks?: boolean;
  /** Lifetime of every token this key signs, e.g. `"1s"` for an expired-token test. */
  readonly expiresIn?: string;
}

export interface FakeClerk {
  /** Every URL the verifier fetched. */
  readonly calls: string[];
  sign(subject: string, email?: string, extra?: Record<string, unknown>): Promise<string>;
  restore(): void;
}

export async function fakeClerk(options: FakeClerkOptions = {}): Promise<FakeClerk> {
  const issuer = options.issuer ?? TEST_ISSUER;
  const kid = options.kid ?? "test-key";
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: "RS256", use: "sig" };
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    if (url === new URL("/.well-known/jwks.json", issuer).toString()) {
      if (options.brokenJwks) return new Response("upstream unavailable", { status: 502 });
      return Response.json({ keys: [jwk] });
    }
    throw new Error(`unexpected network call in a unit test: ${url}`);
  }) as typeof fetch;
  resetJwksCache();
  return {
    calls,
    sign: async (subject: string, email?: string, extra: Record<string, unknown> = {}) =>
      new SignJWT({ ...(email === undefined ? {} : { email }), ...extra })
        .setProtectedHeader({ alg: "RS256", kid })
        .setIssuer(issuer)
        .setSubject(subject)
        .setIssuedAt()
        .setExpirationTime(options.expiresIn ?? "5m")
        .sign(privateKey),
    restore: () => {
      globalThis.fetch = originalFetch;
      resetJwksCache();
    },
  };
}
