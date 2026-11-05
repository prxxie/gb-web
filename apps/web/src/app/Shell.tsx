/**
 * App shell (`US-FND-003` AC1–AC2).
 *
 * The top bar is the one place every screen shares: the product name and the `VI`/`EN` toggle. The
 * toggle reads and writes the `LocaleProvider`, so every table lookup below it re-renders in the new
 * language and the choice is persisted under `gbw.locale` (`TC-PWA-130`).
 */
import { useLocale } from "./providers";
import type { ReactNode } from "react";
import type { JSX } from "react";

export interface ShellProps {
  readonly children: ReactNode;
}

export function Shell({ children }: ShellProps): JSX.Element {
  const { locale, setLocale, t } = useLocale();
  return (
    <div className="shell">
      <header className="shell__bar">
        <span className="shell__title">{t("app.title")}</span>
        <button
          type="button"
          className="ghost shell__locale"
          data-testid="locale-toggle"
          onClick={() => setLocale(locale === "vi" ? "en" : "vi")}
          // The label names the language the tap switches to, so the button is "EN" while the page is in
          // Vietnamese — naming the current language instead makes the control read as a status badge.
          title={locale === "vi" ? "Chuyển sang tiếng Anh" : "Switch to Vietnamese"}
        >
          {locale === "vi" ? "EN" : "VI"}
        </button>
      </header>
      <div className="shell__body">{children}</div>
    </div>
  );
}
