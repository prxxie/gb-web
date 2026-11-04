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

/** Reuse a live session, otherwise mint a guest one. Sign-in upgrades the stored session. */
export async function ensureSession(): Promise<Session> {
  const existing = currentSession();
  if (existing) return existing;
  return store(await api.createGuestSession());
}

export async function upgradeToAccount(clerkToken: string): Promise<Session> {
  const session = store(await api.createAccountSession(clerkToken));
  return session;
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
