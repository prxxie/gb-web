/**
 * Landscape gate (`US-PWA-003`).
 *
 * Portrait does not unmount the battlefield — it hides it — so a rotation never resets the match
 * (`TC-PWA-162`). The gate wraps the whole shell, so in portrait no route paints at all: the notice is the
 * only thing on screen and its one control is the locale toggle (`US-PWA-003` AC3).
 *
 * The orientation is read before the first render, so a portrait phone never flashes the landscape UI on
 * its first paint.
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
 * query disagrees. A desktop window that is merely narrow (AC6) is caught by the first half, and a phone
 * whose media query lags behind the resize during a rotation is caught by the second.
 */
export function isPortraitViewport(): boolean {
  const query = typeof window.matchMedia === "function" ? window.matchMedia("(orientation: landscape)") : null;
  return window.innerHeight > window.innerWidth || !(query?.matches ?? true);
}

export function OrientationGate({ children, message, action }: OrientationGateProps): JSX.Element {
  const [portrait, setPortrait] = useState<boolean>(isPortraitViewport);

  useEffect(() => {
    const query = typeof window.matchMedia === "function" ? window.matchMedia("(orientation: landscape)") : null;
    let timer = 0;
    // The media query flips as soon as the browser notices, so it re-evaluates at once; the resize events
    // arrive in bursts during a rotation and are coalesced (`ORIENTATION_DEBOUNCE_MS`).
    const evaluate = (): void => {
      window.clearTimeout(timer);
      setPortrait(isPortraitViewport());
    };
    const schedule = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(evaluate, ORIENTATION_DEBOUNCE_MS);
    };
    query?.addEventListener("change", evaluate);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    return () => {
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
