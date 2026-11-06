/**
 * "Cập nhật" prompt (`US-PWA-001` AC5).
 *
 * A new deploy is announced, never applied on its own: the player taps the button and the waiting worker
 * takes over. `suspended` is true on `/match/:code`, so the bundle cannot swap mid-match.
 */
import { useEffect, useState } from "react";
import type { JSX } from "react";
import { useLocale } from "../app/providers";
import { applyUpdate, registerServiceWorker } from "../app/serviceWorker";

export interface UpdatePromptProps {
  readonly suspended: boolean;
}

export function UpdatePrompt({ suspended }: UpdatePromptProps): JSX.Element | null {
  const { t } = useLocale();
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    registerServiceWorker(() => setAvailable(true));
  }, []);

  if (!available || dismissed || suspended) return null;

  return (
    <div className="prompt" data-testid="update-prompt" role="status">
      <p>{t("update.available")}</p>
      <div className="row">
        <button type="button" className="primary" data-testid="update-apply" onClick={() => applyUpdate()}>
          {t("update.apply")}
        </button>
        <button type="button" className="ghost" onClick={() => setDismissed(true)}>
          {t("update.later")}
        </button>
      </div>
    </div>
  );
}
