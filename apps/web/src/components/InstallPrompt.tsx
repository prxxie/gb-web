/**
 * Install prompt (`US-PWA-001` §5: offered only from the results screen, one tap, dismissible and
 * remembered).
 *
 * Chromium fires `beforeinstallprompt` when the app qualifies for installation; holding the event lets the
 * results screen offer it at a natural moment instead of on first load. Browsers without the event (iOS
 * Safari) simply never render the card — the platform's own "Add to Home Screen" stays the only path there.
 */
import { useCallback, useEffect, useState, type JSX } from "react";
import { useLocale } from "../app/providers";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "gbw.install.dismissed";

function isDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissal(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* private mode: the prompt stays hidden for this page view only */
  }
}

export function InstallPrompt(): JSX.Element | null {
  const { t } = useLocale();
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(isDismissed);

  useEffect(() => {
    const onBeforeInstall = (event: Event): void => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    rememberDismissal();
  }, []);

  const install = useCallback(() => {
    if (!installEvent) return;
    void installEvent
      .prompt()
      .then(async () => {
        const choice = await installEvent.userChoice;
        setInstallEvent(null);
        if (choice.outcome === "dismissed") dismiss();
      })
      .catch(() => setInstallEvent(null));
  }, [installEvent, dismiss]);

  if (!installEvent || dismissed) return null;

  return (
    <div className="prompt" data-testid="install-prompt">
      <p>{t("install.hint")}</p>
      <div className="row">
        <button type="button" className="primary" data-testid="install-action" onClick={install}>
          {t("install.action")}
        </button>
        <button type="button" className="ghost" onClick={dismiss}>
          {t("common.close")}
        </button>
      </div>
    </div>
  );
}
