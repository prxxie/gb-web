import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadLocale, saveLocale, translator, type Locale, type Translator } from "../i18n";
import { ensureSession, currentSession, type Session } from "../lib/session";

interface LocaleState {
  readonly locale: Locale;
  readonly t: Translator;
  setLocale(locale: Locale): void;
}

interface SessionState {
  readonly session: Session | null;
  readonly ready: boolean;
  readonly error: string | null;
  refresh(): Promise<void>;
  adopt(session: Session): void;
}

const LocaleContext = createContext<LocaleState | null>(null);
const SessionContext = createContext<SessionState | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => loadLocale());

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    saveLocale(next);
  }, []);

  const value = useMemo<LocaleState>(
    () => ({ locale, t: translator(locale), setLocale }),
    [locale, setLocale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => currentSession());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await ensureSession();
      setSession(next);
      setError(null);
    } catch {
      setError("unauthenticated");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<SessionState>(
    () => ({ session, ready, error, refresh, adopt: setSession }),
    [session, ready, error, refresh],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useLocale(): LocaleState {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside LocaleProvider");
  return value;
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
