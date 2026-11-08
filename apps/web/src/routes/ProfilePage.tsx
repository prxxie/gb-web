/**
 * Profile (`US-AUTH-003`, `US-AUTH-004`, `US-RANK-003`).
 */
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useLocale, useSession } from "../app/providers";
import { ApiError, api, type HistoryItem, type ProfileResponse } from "../lib/api";
import { clearSession, updateSubject } from "../lib/session";
import type { JSX } from "react";

/**
 * The fixed avatar set `PATCH /me` accepts (`accounts.md` § PATCH /me): `avatar-01`…`avatar-12`.
 *
 * The ids are the contract, so the picker offers exactly these — a loadout part (`av-head-01`) is a
 * different vocabulary and the server answers it with `422`.
 */
export const AVATAR_IDS: readonly string[] = Array.from(
  { length: 12 },
  (_, index) => `avatar-${String(index + 1).padStart(2, "0")}`,
);

/**
 * The server blames a field through `problem.errors[]`, and a duplicate name arrives as the
 * `display-name-taken` type without an `errors[]` entry (`accounts.md` § PATCH /me). Either way the
 * line lands under the field that caused it, not in a screen-wide banner (`TC-AUTH-140`).
 */
function fieldError(caught: unknown, field: "displayName" | "avatarId"): string | null {
  if (!(caught instanceof ApiError)) return null;
  if (field === "displayName" && caught.type === "display-name-taken") return "errors.display-name-taken";
  if (caught.fields.some((entry) => entry.field === field)) return "errors.validation";
  return null;
}

/** Anything the field mapping above did not claim: the type's own dictionary line, or `errors.generic`. */
function generalError(caught: unknown): string {
  return caught instanceof ApiError ? caught.messageKey : "errors.internal";
}

export function ProfilePage(): JSX.Element {
  const { t } = useLocale();
  const { session, adopt } = useSession();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [history, setHistory] = useState<readonly HistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [avatarId, setAvatarId] = useState("avatar-01");
  const [nameError, setNameError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // The token is the identity of the session; the provider hands out a fresh object on every
  // `refresh()`, and keying the load on it would wipe a name the player is still typing.
  const token = session?.token ?? null;
  // A guest session has no account, so `/me` answers 401 and the browser logs an error on every visit to a screen
  // the guest is about to be redirected away from (`TC-AUTH-143`). Only an account session asks.
  const isAccount = session?.subject.kind === "account";
  const load = useCallback(async () => {
    if (!token || !isAccount) return;
    try {
      const me = await api.me(token);
      setProfile(me);
      setName(me.displayName);
      setAvatarId(me.avatarId);
      const page = await api.history(token, null);
      setHistory(page.items);
      setCursor(page.next_cursor);
    } catch {
      setError(t("common.retry"));
    }
  }, [token, isAccount, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!session || session.subject.kind !== "account") {
    // `TC-AUTH-143`, `docs/02-reference/screens/profile.md`: a guest landing here is sent to `/sign-in` — the route has
    // no meaning without an account, so it redirects instead of explaining itself on a screen the player cannot use.
    return <Navigate to="/sign-in" replace />;
  }

  /**
   * Save is optimistic (`AC4`): the new name is shown at once, and a `409` puts the previous one back
   * with the reason under the field. Only `displayName` is sent, so an avatar the player has not
   * touched cannot turn a rename into a second write.
   */
  const save = async (): Promise<void> => {
    if (!profile) return;
    const previous = profile;
    const next = name.trim();
    setError(null);
    setMessage(null);
    setNameError(null);
    setProfile({ ...previous, displayName: next });
    try {
      const updated = await api.patchMe(session.token, { displayName: next });
      setProfile(updated);
      setName(updated.displayName);
      setMessage(t("profile.saved"));
      rememberIdentity(updated);
    } catch (caught) {
      setProfile(previous);
      setName(previous.displayName);
      const blamed = fieldError(caught, "displayName");
      if (blamed) setNameError(t(blamed));
      else setError(t(generalError(caught)));
    }
  };

  /**
   * The picker saves on choice and needs no reload (`AC5`): the profile row is the source of truth, so
   * `GET /me` after a reload returns the same id. A refused id falls back to the previous one.
   */
  const chooseAvatar = async (nextAvatarId: string): Promise<void> => {
    if (!profile || nextAvatarId === profile.avatarId) return;
    const previous = profile.avatarId;
    setError(null);
    setMessage(null);
    setAvatarError(null);
    setAvatarId(nextAvatarId);
    setProfile({ ...profile, avatarId: nextAvatarId });
    try {
      const updated = await api.patchMe(session.token, { avatarId: nextAvatarId });
      setProfile(updated);
      setAvatarId(updated.avatarId);
      setMessage(t("profile.saved"));
      rememberIdentity(updated);
    } catch (caught) {
      setProfile((current) => (current ? { ...current, avatarId: previous } : current));
      setAvatarId(previous);
      const blamed = fieldError(caught, "avatarId");
      if (blamed) setAvatarError(t(blamed));
      else setError(t(generalError(caught)));
    }
  };

  /**
   * The stored session is what the lobby joins with, so the server's answer has to land there too
   * (`AC5` roster, `AC7` rename). It runs only after `PATCH /me` resolves, so a refused edit cannot
   * leave the session ahead of the database.
   */
  const rememberIdentity = (updated: ProfileResponse): void => {
    const stored = updateSubject({ displayName: updated.displayName, avatarId: updated.avatarId });
    if (stored) adopt(stored);
  };

  const loadMore = async (): Promise<void> => {
    if (!cursor) return;
    const page = await api.history(session.token, cursor);
    setHistory((previous) => [...previous, ...page.items]);
    setCursor(page.next_cursor);
  };

  const remove = async (): Promise<void> => {
    await api.deleteMe(session.token);
    clearSession();
    setProfile(null);
    // The session is gone, so the confirmation has to travel with the navigation (`screens/profile.md` § Delete).
    navigate("/", { state: { notice: t("profile.deleted") } });
  };

  return (
    <div className="screen">
      <header className="row">
        <h1>{t("main.profile")}</h1>
        <Link to="/">{t("common.home")}</Link>
      </header>

      <section className="card">
        <div className="row">
          <span className="badge" data-testid="profile-avatar">
            {profile?.avatarId ?? "—"}
          </span>
          <strong data-testid="profile-name">{profile?.displayName ?? "—"}</strong>
        </div>
        <label className="row">
          <span className="muted">{t("profile.displayName")}</span>
          <input
            type="text"
            value={name}
            maxLength={16}
            aria-invalid={nameError !== null}
            aria-describedby={nameError ? "profile-name-error" : undefined}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {nameError ? (
          <p className="field-error" id="profile-name-error" role="alert">
            {nameError}
          </p>
        ) : null}
        <button type="button" className="primary" onClick={() => void save()} disabled={name.trim().length < 2}>
          {t("profile.save")}
        </button>
        <label className="row">
          <span className="muted">{t("profile.avatar")}</span>
          <select
            value={avatarId}
            aria-invalid={avatarError !== null}
            onChange={(event) => void chooseAvatar(event.target.value)}
          >
            {AVATAR_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        {avatarError ? (
          <p className="field-error" role="alert">
            {avatarError}
          </p>
        ) : null}
        {message ? <p className="muted">{message}</p> : null}
        {error ? <p className="muted">{error}</p> : null}
      </section>

      <section className="card">
        <div className="row">
          <span className="badge">
            {t("profile.rating")}: {profile?.rating ?? "—"}
          </span>
          <span className="badge">
            {t("profile.matches")}: {profile?.stats.matches ?? 0}
          </span>
        </div>
      </section>

      <section className="card">
        <h2>{t("profile.history")}</h2>
        {history.length === 0 ? <p className="muted">—</p> : null}
        {history.map((item) => {
          const teams = `${item.playerCount / 2}v${item.playerCount / 2}`;
          const delta = item.ratingDelta;
          return (
            <div key={item.matchId} className="row" data-testid={`history-${item.matchId}`}>
              <span>{new Date(item.playedAt).toLocaleDateString()}</span>
              <span>{t(`profile.result.${item.result}`)}</span>
              <span className="muted">
                {teams} · {item.opponents.map((opponent) => opponent.displayName).join(", ")}
              </span>
              <span className="muted">
                {item.damageDealt} dmg · {item.hits}/{item.shotsFired}
              </span>
              {/* AC4: nothing moved, so the row says why instead of printing a zero (`screens/profile.md`). */}
              <span data-testid={delta === null ? `history-unranked-${item.matchId}` : `history-delta-${item.matchId}`}>
                {delta === null
                  ? `${t("profile.history.unranked")} ${t(`profile.history.reason.${item.rankedReason ?? "unknown"}`)}`
                  : `${delta > 0 ? "+" : ""}${delta}`}
              </span>
            </div>
          );
        })}
        {cursor ? (
          <button type="button" onClick={() => void loadMore()}>
            {t("profile.loadMore")}
          </button>
        ) : null}
      </section>

      <section className="card">
        <h2>{t("profile.delete")}</h2>
        {confirming ? (
          <div className="row">
            <input
              type="text"
              placeholder={profile?.displayName ?? ""}
              onChange={(event) => {
                if (event.target.value === profile?.displayName) void remove();
              }}
            />
            <button type="button" className="ghost" onClick={() => setConfirming(false)}>
              {t("common.cancel")}
            </button>
          </div>
        ) : (
          <button type="button" className="ghost" onClick={() => setConfirming(true)}>
            {t("profile.deleteConfirm")}
          </button>
        )}
      </section>
    </div>
  );
}
