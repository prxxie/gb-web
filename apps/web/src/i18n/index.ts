/**
 * Bilingual copy (`NFR-18`).
 *
 * Vietnamese is the default because the client's players are Vietnamese; English is a first-class
 * table, not a fallback dictionary. A missing key throws in development and falls back to the
 * key itself in production, which is how a missing string shows up in review instead of shipping as
 * a blank label.
 */
import en from "./en.json";
import vi from "./vi.json";

export type Locale = "vi" | "en";
export type Key = keyof typeof vi;

const TABLES: Record<Locale, Record<string, string>> = { vi, en };
export const LOCALES: readonly Locale[] = ["vi", "en"];
export const STORAGE_KEY = "gbw.locale";

export function isLocale(value: unknown): value is Locale {
  return value === "vi" || value === "en";
}

export function loadLocale(storage: Pick<Storage, "getItem"> | null = safeStorage()): Locale {
  try {
    const stored = storage?.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    /* private mode blocks storage: fall through to the default */
  }
  return "vi";
}

export function saveLocale(locale: Locale, storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, locale);
  } catch {
    /* nothing to do — the preference simply does not persist */
  }
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}

export function translate(locale: Locale, key: string, values: Record<string, string | number> = {}): string {
  const template = TABLES[locale][key] ?? TABLES.vi[key];
  if (template === undefined) {
    if (import.meta.env.DEV) throw new Error(`Missing ${locale} translation for "${key}"`);
    return key;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

export type Translator = (key: string, values?: Record<string, string | number>) => string;

export function translator(locale: Locale): Translator {
  return (key, values) => translate(locale, key, values);
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
