/**
 * Profile (`US-AUTH-003`, `US-AUTH-004`, `US-RANK-003`).
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AVATAR_PARTS } from "@gbw/core";
import { useLocale, useSession } from "../app/providers";
import { api, type HistoryItem, type ProfileResponse } from "../lib/api";
import { clearSession } from "../lib/session";
import type { JSX } from "react";

export function ProfilePage(): JSX.Element {
  const { t } = useLocale();
  const { session, refresh } = useSession();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [history, setHistory] = useState<readonly HistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [avatarId, setAvatarId] = useState("avatar-01");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const me = await api.me(session.token);
      setProfile(me);
      setName(me.displayName);
      setAvatarId(me.avatarId);
      const page = await api.history(session.token, null);
      setHistory(page.items);
      setCursor(page.next_cursor);
    } catch {
      setError(t("common.retry"));
    }
  }, [session, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!session || session.subject.kind !== "account") {
    return (
      <div className="screen screen--center">
        <p>
          {t("signIn.title")} — <Link to="/sign-in">{t("main.signIn")}</Link>
        </p>
      </div>
    );
  }

  const save = async (): Promise<void> => {
    setError(null);
    try {
      const updated = await api.patchMe(session.token, { displayName: name.trim(), avatarId });
      setProfile(updated);
      setMessage(t("profile.saved"));
      await refresh();
    } catch {
      setError(t("errors.display-name-taken"));
    }
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
    setMessage(t("profile.deleteConfirm"));
    await refresh();
  };

  return (
    <div className="screen">
      <header className="row">
        <h1>{t("main.profile")}</h1>
        <Link to="/">{t("results.home")}</Link>
      </header>

      <section className="card">
        <label className="row">
          <span className="muted">{t("profile.displayName")}</span>
          <input type="text" value={name} maxLength={16} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="row">
          <span className="muted">{t("profile.avatar")}</span>
          <select value={avatarId} onChange={(event) => setAvatarId(event.target.value)}>
            {AVATAR_PARTS.filter((part) => part.slot === "head").map((part) => (
              <option key={part.partId} value={part.partId}>
                {part.partId} (+{part.bonus} {part.stat})
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="primary" onClick={() => void save()} disabled={name.trim().length < 2}>
          {t("profile.save")}
        </button>
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
        {history.map((item) => (
          <div key={item.matchId} className="row">
            <span>{new Date(item.endedAt).toLocaleDateString()}</span>
            <span>{item.result}</span>
            <span className="muted">
              {item.damageDealt} dmg · {item.hits}/{item.shotsFired}
            </span>
          </div>
        ))}
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
