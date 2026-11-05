/**
 * Per-route frame (`US-PWA-001` AC5, `US-PWA-004` AC7).
 *
 * The shell sits outside the router, so the bits that need the current path live in this layout route:
 * the update prompt is suspended on `/match/:code` (a swap there would drop the match) and focus moves to
 * each new screen's heading.
 */
import type { JSX } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { UpdatePrompt } from "../components/UpdatePrompt";
import { useRouteFocus } from "./useRouteFocus";

const MATCH_ROUTE_PREFIX = "/match/";

export function RouteFrame(): JSX.Element {
  const { pathname } = useLocation();
  useRouteFocus();
  return (
    <>
      <Outlet />
      <UpdatePrompt suspended={pathname.startsWith(MATCH_ROUTE_PREFIX)} />
    </>
  );
}
