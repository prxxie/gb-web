/**
 * Service-worker lifecycle (`US-PWA-001` AC1, AC5).
 *
 * The build emits `sw.js` from `vite-plugin-pwa` with `registerType: "prompt"`, so a deploy parks a waiting
 * worker instead of swapping the bundle under a running match. This module owns the registration — the
 * plugin's `injectRegister: null` keeps it from injecting a second one — and turns "a newer worker is
 * installed" into a callback the update prompt can render.
 *
 * A development build has no `sw.js`, so registration is production-only: caching the dev server would make
 * every change look undeployed.
 */

export const SERVICE_WORKER_URL = "/sw.js";

/** `SKIP_WAITING` is the message the generated worker listens for to activate without waiting for tabs to close. */
const SKIP_WAITING = { type: "SKIP_WAITING" } as const;

/**
 * Call `onUpdate` when this registration switches to a newer worker while a page is already controlled.
 * The first install also fires `updatefound`, but there is no `controller` yet — that is not an update.
 */
export function watchRegistration(
  registration: Pick<ServiceWorkerRegistration, "installing" | "waiting" | "addEventListener">,
  hasController: boolean,
  onUpdate: () => void,
): void {
  if (hasController && registration.waiting) {
    onUpdate();
    return;
  }
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (installing.state === "installed" && hasController) onUpdate();
    });
  });
}

/**
 * Register the service worker once per page and report a waiting update.
 *
 * `enabled` is a parameter so a test can drive the browser path without pretending to be a production
 * build.
 */
export function registerServiceWorker(
  onUpdate: () => void,
  enabled: boolean = import.meta.env.PROD,
): void {
  if (!enabled || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker
    .register(SERVICE_WORKER_URL, { scope: "/" })
    .then((registration) => {
      watchRegistration(registration, Boolean(navigator.serviceWorker.controller), onUpdate);
    })
    .catch(() => {
      /* a blocked or unsupported registration leaves the app usable online, which is the fallback */
    });
}

/**
 * Activate the waiting worker and reload. The reload happens on `controllerchange`, so the page that comes
 * back is served by the new worker rather than the old one.
 */
export function applyUpdate(reload: () => void = () => window.location.reload()): void {
  void navigator.serviceWorker
    .getRegistration()
    .then((registration) => {
      const waiting = registration?.waiting;
      if (!waiting) {
        reload();
        return;
      }
      let done = false;
      const once = (): void => {
        if (done) return;
        done = true;
        reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", once);
      waiting.postMessage(SKIP_WAITING);
      // A worker that never claims the page (a lost message) must not leave the button dead.
      window.setTimeout(once, 2_000);
    })
    .catch(() => reload());
}
