/**
 * Route focus (`US-PWA-004` AC7, `docs/02-reference/screens/README.md` "Every route moves focus to its <h1>").
 *
 * A client-side navigation leaves focus on the clicked control, so a keyboard or screen-reader user has no
 * signal that the screen changed. Moving focus to the new screen's heading both announces the new context
 * and puts the tab order at the top of it.
 *
 * Two routes are lazy (`/match/:code`, `/sign-in`), so the heading of the new screen can commit a chunk after the
 * navigation does: a single attempt 50 ms in found no `h1` on those routes, and focus stayed on the control the
 * navigation had already removed. The attempt therefore repeats until the heading exists or the wait budget is
 * spent — bounded, so a screen that genuinely has no heading cannot hold the tab order hostage.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const FOCUS_DELAY_MS = 50;
/** How long focus keeps looking for the heading of a lazily imported route. */
const FOCUS_WAIT_MS = 2_000;

export function useRouteFocus(): void {
  const { pathname } = useLocation();

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const deadline = Date.now() + FOCUS_WAIT_MS;
    const attempt = (): void => {
      if (cancelled) return;
      const heading = document.querySelector<HTMLElement>("#main h1");
      if (heading) {
        // A heading is not focusable until it is given a tabindex; without this the focus() call is a no-op.
        heading.tabIndex = -1;
        heading.focus();
        return;
      }
      if (Date.now() >= deadline) return;
      timer = window.setTimeout(attempt, FOCUS_DELAY_MS);
    };
    // The heading belongs to the route that is rendering now; wait one frame for a lazy route to commit.
    timer = window.setTimeout(attempt, FOCUS_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pathname]);
}
