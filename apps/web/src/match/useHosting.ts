/**
 * Who runs the simulation (`US-NET-003` AC2).
 *
 * The state is what the screen renders from; the ref is what the mount-time callbacks read, because `mountBattle` is
 * not remounted when the role moves and its closures would keep answering from the lobby's plan.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import type { PlannedMatch } from "../lib/plan";

export interface MatchHosting {
  readonly hosting: boolean;
  readonly setHosting: (hosting: boolean) => void;
  /** The role as the renderer holds it. */
  readonly hostingRef: RefObject<boolean>;
}

export function useHosting(plan: PlannedMatch | null): MatchHosting {
  const [hosting, setHosting] = useState(() => !plan || plan.kind === "bot" || plan.hostPlayerId === plan.playerId);
  const hostingRef = useRef(hosting);
  useEffect(() => {
    hostingRef.current = hosting;
  }, [hosting]);
  return { hosting, setHosting, hostingRef };
}
