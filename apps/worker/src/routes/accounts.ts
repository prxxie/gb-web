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
  if (!limit.allowed) {
    throw new ProblemError("rate-limited", "Too many sessions from this address", [], limit.retryAfterSeconds, "ip_sessions");
  }

  const body = await readJson(request);
  const field = new Field([]);
  // `accounts.md` § POST /sessions documents `kind`, `displayName` and `clerkToken`; an extra key is named back
  // (`422 errors[]`), because a misspelled `displayname` would otherwise silently drop the name.
  for (const key of Object.keys(body)) {
    const IGNORED_IDENTITY = new Set(["accountId", "guestId", "clerkUserId", "subject"]);
    if (IGNORED_IDENTITY.has(key)) continue; // never honoured: identity comes from the verified token
    if (key !== "kind" && key !== "displayName" && key !== "clerkToken") field.fail(key, "is not a documented field");
  }
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
  readonly losses: number;
  readonly abandons: number;
}

async function statsFor(env: Env, accountId: string): Promise<PlayerStats> {
  const row = await env.GBW_DB.prepare(
    `SELECT COUNT(*) AS matches,
            COALESCE(SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END), 0) AS wins,
            COALESCE(SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END), 0) AS losses,
            COALESCE(SUM(CASE WHEN result = 'abandon' THEN 1 ELSE 0 END), 0) AS abandons
       FROM match_player WHERE account_id = ?`,
  )
    .bind(accountId)
    .first<{ matches: number; wins: number; losses: number; abandons: number }>();
  return {
    matches: row?.matches ?? 0,
    wins: row?.wins ?? 0,
    losses: row?.losses ?? 0,
    abandons: row?.abandons ?? 0,
  };
}

/**
 * `GET /me` shape, exactly as `accounts.md` lists it: no `updatedAt`, no internal timestamps, and
 * `deletionScheduledFor` present (null while nothing is pending) so a client never probes for it.
 */
export function profileBody(
  profile: ProfileRow,
  stats: PlayerStats,
  account: { readonly created_at: string; readonly status: string; readonly deleted_at?: string | null },
) {
  const purgeAt =
    account.status === "deleted"
      ? new Date(Date.parse(account.deleted_at ?? account.created_at) + 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;
  return {
    accountId: profile.account_id,
    displayName: profile.display_name,
    avatarId: profile.avatar_id,
    rating: profile.rating,
    ratedMatches: profile.rated_matches,
    stats,
    createdAt: account.created_at,
    deletionScheduledFor: purgeAt,
  };
}

/** A deleted account keeps a valid token until it expires; every authenticated call must still refuse. */
interface ActiveAccount {
  readonly clerk_user_id: string;
  readonly created_at: string;
  readonly status: string;
  readonly deleted_at?: string | null;
}

async function activeAccount(env: Env, accountId: string): Promise<ActiveAccount> {
  const account = await findAccountById(env.GBW_DB, accountId);
  if (!account) throw new ProblemError("unauthenticated", "Account no longer exists");
  if (account.status === "deleted") throw new ProblemError("unauthenticated", "This account was deleted");
  return account;
}

export async function getMe(env: Env, session: SessionToken): Promise<Response> {
  const accountId = requireAccountId(session);
  const account = await activeAccount(env, accountId);
  const profile = await findProfile(env.GBW_DB, accountId);
  if (!profile) throw new ProblemError("unauthenticated", "Account no longer exists");
  return Response.json(profileBody(profile, await statsFor(env, accountId), account), {
    headers: { "cache-control": "no-store" },
  });
}

export async function patchMe(request: Request, env: Env, session: SessionToken): Promise<Response> {
  const accountId = requireAccountId(session);
  const body = await readJson(request);
  const field = new Field([]);
  // `US-AUTH-003` §5 and `accounts.md` § PATCH /me draw the line in two places: the read-model fields a client
  // may echo back (`rating`, `ratedMatches`, `stats`) are **ignored**, because a form that round-trips a profile
  // must not fail on save; anything else is rejected and named, so a typo or an attempt to set `clerkUserId`
  // never looks like a successful save.
  const ECHO_FIELDS = new Set(["rating", "ratedMatches", "stats"]);
  const writable = Object.keys(body).some((key) => key === "displayName" || key === "avatarId");
  for (const key of Object.keys(body)) {
    if (key === "displayName" || key === "avatarId") continue;
    // A read-model field echoed back by a form is ignored — but a body made only of them has nothing to
    // write, so it is refused and named rather than answered with a silent 200.
    if (ECHO_FIELDS.has(key) && writable) continue;
    field.fail(key, "is not a writable field");
  }
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
  await activeAccount(env, accountId);

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
  const account = await activeAccount(env, accountId);
  return Response.json(profileBody(profile, await statsFor(env, accountId), account));
}

export async function deleteMe(env: Env, session: SessionToken): Promise<Response> {
  const accountId = requireAccountId(session);
  const account = await activeAccount(env, accountId);

  // `TC-AUTH-069`: deleting mid-match would strand the other players in a room whose host record is gone.
  const live = await liveRoomFor(env, accountId);
  if (live) throw new ProblemError("invalid-state", `A match is still in progress in room ${live}`);

  // Clerk first, D1 second: if the purge is scheduled and Clerk kept the user, the account could sign
  // back in and be recreated under the same Clerk subject (`accounts.md` § DELETE /me).
  await deleteClerkUser(env, account.clerk_user_id);
  await scheduleDeletion(env.GBW_DB, accountId);
  return new Response(null, { status: 204 });
}

/**
 * The rooms an account is currently playing in. Rooms live in Durable Objects, so this asks each room
 * the profile knows about; v1 keeps the list small (a player is in at most one match) and an
 * unreachable room is treated as not playing, because deletion must not hang on a DO.
 */
async function liveRoomFor(env: Env, accountId: string): Promise<string | null> {
  // The lookup is best-effort: a room that cannot be reached, or a query that fails, must not make an
  // account undeletable — the delete is the user's request, the in-match guard is a courtesy (`TC-AUTH-069`).
  const remembered = await env.GBW_DB.prepare("SELECT current_room_code FROM profile WHERE account_id = ?")
    .bind(accountId)
    .all<{ current_room_code: string | null }>()
    .catch(() => ({ results: [] as { current_room_code: string | null }[] }));
  const codes = (remembered.results ?? [])
    .map((row) => row.current_room_code)
    .filter((code): code is string => typeof code === "string" && code.length > 0);
  for (const code of codes) {
    try {
      const state = (await (
        await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch("https://room.internal/state")
      ).json()) as { status?: string; members?: { accountId?: string | null }[] };
      const inRoom = (state.members ?? []).some((member) => member.accountId === accountId);
      if (state.status === "playing" && inRoom) return code;
    } catch {
      // A room that cannot answer is not a match in progress for this account.
    }
  }
  const rows = await env.GBW_DB.prepare(
    "SELECT room_code FROM match_record WHERE submitted_by = ? ORDER BY created_at DESC LIMIT 5",
  )
    .bind(accountId)
    .all<{ room_code: string }>()
    .catch(() => ({ results: [] as { room_code: string }[] }));
  for (const row of rows.results ?? []) {
    try {
      const state = (await (
        await env.ROOMS.get(env.ROOMS.idFromName(row.room_code)).fetch("https://room.internal/state")
      ).json()) as { status?: string; members?: { accountId?: string | null }[] };
      const inRoom = (state.members ?? []).some((member) => member.accountId === accountId);
      if (state.status === "playing" && inRoom) return row.room_code;
    } catch {
      // A room that cannot answer is not a match in progress for this account.
    }
  }
  return null;
}

/** Clerk's admin API; a failure must not leave the account undeletable, so it is logged, not thrown. */
async function deleteClerkUser(env: Env, clerkUserId: string): Promise<void> {
  const secret = (env as Env & { CLERK_SECRET_KEY?: string }).CLERK_SECRET_KEY;
  if (!clerkUserId) return;
  try {
    await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${secret ?? ""}` },
    });
  } catch {
    // The purge still runs; a stale Clerk user is reported by the nightly reconciliation, not here.
  }
}
