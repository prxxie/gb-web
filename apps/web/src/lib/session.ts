/**
 * Client session state (`US-AUTH-001`).
 *
 * The session token lives in `sessionStorage`, not `localStorage`: closing the tab ends a guest
 * session, which is what a guest expects, and it keeps the token out of a shared device's persistent
 * storage. The signed-in identity itself stays with Clerk (`ADR-0002`).
 */
import { api, type SessionResponse } from "./api";

const KEY = "gbw.session";

export interface Session {
  readonly token: string;
  readonly expiresAt: number;
  readonly subject: SessionResponse["subject"];
}

function readRaw(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function currentSession(): Session | null {
  const raw = readRaw();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Session;
    if (parsed.expiresAt <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function store(response: SessionResponse): Session {
  const session: Session = {
    token: response.sessionToken,
    expiresAt: Date.parse(response.expiresAt),
    subject: response.subject,
  };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* private mode: the session lasts as long as this page */
  }
  return session;
}

/**
 * The mint that is in flight, shared by everyone who asks before it lands.
 *
 * A dev build mounts `SessionProvider`'s effect twice (`StrictMode`), and two mints used to race: the second
 * identity overwrote the first, so a join made with the first token found no seat when that page's socket
 * authenticated with the second (`US-ROOM-007` AC7 needs the seat to outlive the frame that made it). One page
 * load gets one guest.
 */
let minting: Promise<Session> | null = null;

/** Reuse a live session, otherwise mint a guest one. Sign-in upgrades the stored session. */
export async function ensureSession(): Promise<Session> {
  const existing = currentSession();
  if (existing) return existing;
  if (!minting) {
    // A sign-in or an account deletion that lands while this mint is in flight wins: the guest identity was only
    // ever a fallback for "no session yet", so it must not overwrite one that arrived first.
    const pending = api.createGuestSession().then((response) => currentSession() ?? store(response));
    minting = pending;
    const settle = (): void => {
      if (minting === pending) minting = null;
    };
    pending.then(settle, settle);
  }
  return minting;
}

export async function upgradeToAccount(clerkToken: string): Promise<Session> {
  const session = store(await api.createAccountSession(clerkToken));
  return session;
}

/**
 * Rewrite the stored identity after the player edits it (`US-AUTH-003` AC5/AC7).
 *
 * `ensureSession()` reuses the stored subject instead of asking `GET /me`, so without this a rename
 * would live only in the profile screen while the room join and the `auth` frame kept the old name.
 * Returns the merged session, or `null` when nothing is stored.
 */
export function updateSubject(patch: { displayName?: string; avatarId?: string }): Session | null {
  const session = currentSession();
  if (!session) return null;
  const next: Session = { ...session, subject: { ...session.subject, ...patch } };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode: the session lasts as long as this page */
  }
  return next;
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
}

export function isGuest(session: Session | null): boolean {
  return session === null || session.subject.kind === "guest";
}

export function displayNameOf(session: Session | null): string {
  return session?.subject.displayName ?? "Guest";
}
