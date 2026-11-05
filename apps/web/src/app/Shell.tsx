/**
 * App shell (`US-FND-003` AC1–AC2, `US-PWA-003` AC1–AC3).
 *
 * The top bar is the one place every screen shares: the product name and the `VI`/`EN` toggle. The
 * toggle reads and writes the `LocaleProvider`, so every table lookup below it re-renders in the new
 * language and the choice is persisted under `gbw.locale` (`TC-PWA-130`).
 *
 * The whole shell sits inside the landscape gate, so portrait replaces every route — not just the
 * battlefield — with the rotate notice. The gate hides the shell instead of unmounting it, so a rotation
 * never resets a match (`TC-PWA-162`).
 */
import { OrientationGate } from "../components/OrientationGate";
import { useLocale } from "./providers";
import type { ReactNode } from "react";
import type { JSX } from "react";

export interface ShellProps {
  readonly children: ReactNode;
}

function LocaleToggle(): JSX.Element {
  const { locale, setLocale } = useLocale();
  return (
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
  );
}

export function Shell({ children }: ShellProps): JSX.Element {
  const { t } = useLocale();
  return (
    <OrientationGate message={t("orientation.rotate")} action={<LocaleToggle />}>
      <div className="shell">
        <header className="shell__bar">
          <span className="shell__title">{t("app.title")}</span>
          <LocaleToggle />
        </header>
        <main id="main" className="shell__body">
          {children}
        </main>
      </div>
    </OrientationGate>
  );
}
