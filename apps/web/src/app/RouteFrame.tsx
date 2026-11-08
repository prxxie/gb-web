/**
 * Per-route frame (`US-PWA-001` AC5, `US-PWA-004` AC7).
 *
 * The bits that need the current path live in this layout route: the update prompt is suspended on `/match/:code`
 * (a swap there would drop the match), focus moves to each new screen's heading, and the shell bar is dropped for the
 * match because the battlefield wants the whole viewport.
 */
import type { JSX } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { UpdatePrompt } from "../components/UpdatePrompt";
import { Shell } from "./Shell";
import { useRouteFocus } from "./useRouteFocus";

const MATCH_ROUTE_PREFIX = "/match/";

export function RouteFrame(): JSX.Element {
  const { pathname } = useLocation();
  useRouteFocus();
  // The match is the one screen that draws its own chrome, and the shell bar costs it 77 px of a 390 px landscape
  // screen — a fifth of the field. `Shell` takes the decision as a prop because it sits inside the router now.
  return (
    <Shell bare={pathname.startsWith(MATCH_ROUTE_PREFIX)}>
      <Outlet />
      <UpdatePrompt suspended={pathname.startsWith(MATCH_ROUTE_PREFIX)} />
    </Shell>
  );
}
