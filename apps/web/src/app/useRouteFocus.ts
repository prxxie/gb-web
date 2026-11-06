/**
 * Route focus (`US-PWA-004` AC7, `docs/02-reference/screens/README.md` "Every route moves focus to its <h1>").
 *
 * A client-side navigation leaves focus on the clicked control, so a keyboard or screen-reader user has no
 * signal that the screen changed. Moving focus to the new screen's heading both announces the new context
 * and puts the tab order at the top of it.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const FOCUS_DELAY_MS = 50;

export function useRouteFocus(): void {
  const { pathname } = useLocation();

  useEffect(() => {
    let cancelled = false;
    // The heading belongs to the route that is rendering now; wait one frame for a lazy route to commit.
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const heading = document.querySelector<HTMLElement>("#main h1");
      if (!heading) return;
      // A heading is not focusable until it is given a tabindex; without this the focus() call is a no-op.
      heading.tabIndex = -1;
      heading.focus();
    }, FOCUS_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pathname]);
}
