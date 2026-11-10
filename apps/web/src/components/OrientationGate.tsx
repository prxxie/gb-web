/**
 * Landscape gate (`US-PWA-003`, extended by `US-PWA-005`).
 *
 * Portrait does not unmount the battlefield — it hides it — so a rotation never resets the match
 * (`TC-PWA-162`). The gate wraps the whole shell, so in portrait no route paints at all: the notice is the
 * only thing on screen and its one control is the locale toggle (`US-PWA-003` AC3).
 *
 * The orientation is read before the first render, so a portrait phone never flashes the landscape UI on
 * its first paint. Only a **touch** device is gated: a narrow desktop window cannot rotate, so it gets the
 * game instead of an instruction it could not follow (`US-PWA-005` AC1).
 */
import { useEffect, useState, type ReactNode } from "react";
import type { JSX } from "react";

export const ORIENTATION_DEBOUNCE_MS = 100;

export interface OrientationGateProps {
  readonly children: ReactNode;
  readonly message: string;
  /** The locale toggle, and nothing else: `US-PWA-003` AC3 allows one control on the notice. */
  readonly action?: ReactNode;
}

/**
 * Portrait means either signal says so: the viewport is taller than it is wide, or the landscape media
 * query disagrees. A phone whose media query lags behind the resize during a rotation is caught by the
 * second half.
 */
export function isPortraitViewport(): boolean {
  const query = typeof window.matchMedia === "function" ? window.matchMedia("(orientation: landscape)") : null;
  return window.innerHeight > window.innerWidth || !(query?.matches ?? true);
}

/**
 * Whether this is a touch device (`US-PWA-005` AC1).
 *
 * A narrow *desktop* window is portrait in shape but cannot be rotated, so the notice used to be a
 * dead end: the player was told to turn a screen that has no orientation. The pointer type is the signal
 * that separates the two — a phone or tablet reports `coarse`, a mouse reports `fine` and `hover`.
 */
export function isTouchDevice(): boolean {
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(hover: none)").matches;
}

/** The gate applies only to a touch device held upright (`US-PWA-005` AC1, superseding `US-PWA-003` AC6). */
export function shouldGate(): boolean {
  return isTouchDevice() && isPortraitViewport();
}

/**
 * Ask the platform to lock the screen to landscape (`US-PWA-005` AC2).
 *
 * This is the only way the app can spare the player the rotation, and it is deliberately best-effort:
 * Safari has no `ScreenOrientation.lock` at all, and Chrome only honours it for an installed app. A
 * rejection is the normal case on half the devices in the world, so it is swallowed rather than reported
 * — the rotate notice stays the fallback.
 */
export async function requestLandscapeLock(): Promise<boolean> {
  const orientation = typeof screen === "undefined" ? undefined : screen.orientation;
  if (typeof orientation?.lock !== "function") return false;
  const installed =
    typeof window.matchMedia === "function" &&
    ["(display-mode: standalone)", "(display-mode: fullscreen)", "(display-mode: minimal-ui)"].some(
      (query) => window.matchMedia(query).matches,
    );
  if (!installed) return false;
  try {
    await orientation.lock("landscape");
    return true;
  } catch {
    return false;
  }
}

export function OrientationGate({ children, message, action }: OrientationGateProps): JSX.Element {
  const [portrait, setPortrait] = useState<boolean>(shouldGate);

  useEffect(() => {
    const query = typeof window.matchMedia === "function" ? window.matchMedia("(orientation: landscape)") : null;
    let timer = 0;
    // The media query flips as soon as the browser notices, so it re-evaluates at once; the resize events
    // arrive in bursts during a rotation and are coalesced (`ORIENTATION_DEBOUNCE_MS`).
    const evaluate = (): void => {
      window.clearTimeout(timer);
      setPortrait(shouldGate());
    };
    const schedule = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(evaluate, ORIENTATION_DEBOUNCE_MS);
    };
    query?.addEventListener("change", evaluate);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    // One attempt, on the first touch: the lock needs a user gesture, and asking twice would be a second
    // gesture the player never made. `requestLandscapeLock` returns false on every browser that cannot do
    // it, which is why the promise is not awaited here.
    let asked = false;
    const ask = (): void => {
      if (asked) return;
      asked = true;
      void requestLandscapeLock();
    };
    window.addEventListener("pointerdown", ask, { once: true });
    window.addEventListener("keydown", ask, { once: true });
    return () => {
      window.removeEventListener("pointerdown", ask);
      window.removeEventListener("keydown", ask);
      window.clearTimeout(timer);
      query?.removeEventListener("change", evaluate);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
    };
  }, []);

  // The gate itself stays visible in both orientations: only the screen is hidden in portrait, so the
  // overlay is a sibling of the children rather than a child of the hidden element.
  return (
    <div className="orientation-gate" data-testid="orientation-gate">
      <div hidden={portrait}>{children}</div>
      {portrait ? (
        <div className="overlay overlay--screen overlay--rotate" data-testid="orientation-hint" role="alert">
          <p>{message}</p>
          {action}
        </div>
      ) : null}
    </div>
  );
}
