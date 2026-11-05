/**
 * Session and profile endpoints (`docs/02-reference/api/accounts.md`).
 *
 * One endpoint mints both kinds of session: a guest is a first-class participant who can play and
 * never appears on a leaderboard, and a signed-in player is the same shape plus a Clerk-verified
 * `accountId` (`ADR-0002`, `US-AUTH-001`, `US-AUTH-002`).
 */
import type { Env } from "../lib/db.js";
import {
  createAccount,
  findAccountByClerkId,
  findAccountById,
  findDisplayNameOwner,
  findProfile,
  now,
  scheduleDeletion,
  touchAccount,
  updateProfile,
  type ProfileRow,
} from "../lib/db.js";
import { verifyClerkJwt } from "../lib/jwt.js";
import { ProblemError } from "../lib/problem.js";
import { checkLimit, RULES } from "../lib/ratelimit.js";
import { bearerOf, mintSession, type SessionToken } from "../lib/session.js";
import { Field, readJson } from "../lib/validation.js";

/** `Display Name` → `displayname`; NFD, strip combining marks, collapse whitespace, lowercase. */
export function displayNameKey(displayName: string): string {
  return displayName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isValidDisplayName(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 16) return false;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(trimmed)) return false;
  return /\p{L}/u.test(trimmed);
}

const AVATAR_PATTERN = /^avatar-(0[1-9]|1[0-2])$/;

export async function createSession(request: Request, env: Env): Promise<Response> {
  const limit = checkLimit(`sessions:${request.headers.get("cf-connecting-ip") ?? "local"}`, RULES.sessionsPerIp);
  if (!limit.allowed) throw new ProblemError("rate-limited", "Too many sessions from this address");

  const body = await readJson(request);
  const field = new Field([]);
  const kind = field.oneOf(body["kind"] ?? "guest", "kind", ["guest", "account"] as const);
  const displayName = typeof body["displayName"] === "string" ? body["displayName"] : null;
  field.done();

  if (kind === "guest") {
    const guestId = crypto.randomUUID();
    const minted = await mintSession({ kind: "guest", guestId, accountId: null }, env.SESSION_TOKEN_SECRET);
    return Response.json(
      {
        sessionToken: minted.token,
        expiresAt: new Date(minted.expiresAt).toISOString(),
        subject: { kind: "guest", guestId, displayName: displayName ?? `Guest ${guestId.slice(0, 4)}` },
      },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  }

  const clerkToken = bearerOf(request) ?? (typeof body["clerkToken"] === "string" ? body["clerkToken"] : null);
  if (!clerkToken) throw new ProblemError("unauthenticated", "Sign in requires a Clerk token");
  const identity = await verifyClerkJwt(clerkToken, env.CLERK_ISSUER);

  let account = await findAccountByClerkId(env.GBW_DB, identity.subject);
  if (!account) {
    const accountId = crypto.randomUUID();
    const proposed = (displayName ?? identity.email?.split("@")[0] ?? "Player").slice(0, 16);
    const name = isValidDisplayName(proposed) ? proposed : `Player ${accountId.slice(0, 4)}`;
    const key = displayNameKey(name);
    const taken = await findDisplayNameOwner(env.GBW_DB, key);
    const finalName = taken ? `${name.slice(0, 12)} ${accountId.slice(0, 4)}`.slice(0, 16) : name;
    await createAccount(env.GBW_DB, {
      accountId,
      clerkUserId: identity.subject,
      displayName: finalName,
      displayNameKey: displayNameKey(finalName),
    });
    account = await findAccountById(env.GBW_DB, accountId);
  }
  if (!account) throw new ProblemError("internal", "Account could not be created");
  if (account.status === "deleted") throw new ProblemError("forbidden", "This account is scheduled for deletion");
  await touchAccount(env.GBW_DB, account.account_id);

  const minted = await mintSession(
    { kind: "account", guestId: null, accountId: account.account_id },
    env.SESSION_TOKEN_SECRET,
  );
  const profile = await findProfile(env.GBW_DB, account.account_id);
  return Response.json(
    {
      sessionToken: minted.token,
      expiresAt: new Date(minted.expiresAt).toISOString(),
      subject: {
        kind: "account",
        accountId: account.account_id,
        displayName: profile?.display_name ?? "Player",
        avatarId: profile?.avatar_id ?? "avatar-01",
        rating: profile?.rating ?? 1200,
        ratedMatches: profile?.rated_matches ?? 0,
      },
    },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
}

function requireAccountId(session: SessionToken): string {
  if (session.sub.kind !== "account" || !session.sub.accountId) {
    throw new ProblemError("unauthenticated", "This endpoint needs a signed-in account");
  }
  return session.sub.accountId;
}

export interface PlayerStats {
  readonly matches: number;
  readonly wins: number;
  readonly bestDamage: number;
}

async function statsFor(env: Env, accountId: string): Promise<PlayerStats> {
  const row = await env.GBW_DB.prepare(
    `SELECT COUNT(*) AS matches,
            COALESCE(SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END), 0) AS wins,
            COALESCE(MAX(damage_dealt), 0) AS best_damage
       FROM match_player WHERE account_id = ?`,
  )
    .bind(accountId)
    .first<{ matches: number; wins: number; best_damage: number }>();
  return { matches: row?.matches ?? 0, wins: row?.wins ?? 0, bestDamage: row?.best_damage ?? 0 };
}

export function profileBody(profile: ProfileRow, stats: PlayerStats) {
  return {
    accountId: profile.account_id,
    displayName: profile.display_name,
    avatarId: profile.avatar_id,
    rating: profile.rating,
    ratedMatches: profile.rated_matches,
    updatedAt: profile.updated_at,
    stats,
  };
}

export async function getMe(env: Env, session: SessionToken): Promise<Response> {
  const accountId = requireAccountId(session);
  const profile = await findProfile(env.GBW_DB, accountId);
  if (!profile) throw new ProblemError("unauthenticated", "Account no longer exists");
  return Response.json(profileBody(profile, await statsFor(env, accountId)), {
    headers: { "cache-control": "no-store" },
  });
}

export async function patchMe(request: Request, env: Env, session: SessionToken): Promise<Response> {
  const accountId = requireAccountId(session);
  const body = await readJson(request);
  const field = new Field([]);
  const displayName = typeof body["displayName"] === "string" ? body["displayName"].trim() : undefined;
  const avatarId = typeof body["avatarId"] === "string" ? body["avatarId"].trim() : undefined;
  if (displayName !== undefined && !isValidDisplayName(displayName)) {
    field.fail("displayName", "must be 2–16 letters, digits, spaces, dots, dashes or underscores");
  }
  if (avatarId !== undefined && !AVATAR_PATTERN.test(avatarId)) field.fail("avatarId", "must be avatar-01…avatar-12");
  field.done();
  if (displayName === undefined && avatarId === undefined) {
    throw new ProblemError("validation", "Nothing to update", [{ field: "body", detail: "at least one field" }]);
  }

  let key: string | undefined;
  if (displayName !== undefined) {
    key = displayNameKey(displayName);
    const owner = await findDisplayNameOwner(env.GBW_DB, key);
    if (owner && owner !== accountId) throw new ProblemError("display-name-taken", "That name is already in use");
  }
  const profile = await updateProfile(env.GBW_DB, accountId, {
    ...(displayName === undefined ? {} : { displayName, displayNameKey: key! }),
    ...(avatarId === undefined ? {} : { avatarId }),
  });
  if (!profile) throw new ProblemError("internal", "Profile could not be updated");
  return Response.json(profileBody(profile, await statsFor(env, accountId)));
}

export async function deleteMe(env: Env, session: SessionToken): Promise<Response> {
  const accountId = requireAccountId(session);
  const live = await env.GBW_DB.prepare(
    "SELECT COUNT(*) AS rooms FROM profile WHERE account_id = ? AND updated_at > ?",
  )
    .bind(accountId, new Date(Date.now() - 60_000).toISOString())
    .first<{ rooms: number }>();
  void live;
  await scheduleDeletion(env.GBW_DB, accountId);
  const purgeAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  return Response.json({ deletionScheduledFor: purgeAt, deletedAt: now() }, { status: 202 });
}
