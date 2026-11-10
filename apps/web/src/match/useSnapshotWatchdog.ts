/**
 * The frozen-screen watchdog (`US-NET-002` AC6).
 *
 * A peer that has heard nothing for two seconds is looking at a frozen screen, so it says so. The replay itself is the
 * socket's: a returning client receives `snapshot_state` from the DO (`US-ROOM-004` AC2).
 */
import { useEffect } from "react";
import { SNAPSHOT_WATCHDOG_MS } from "../net/input";
import type { Translator } from "../i18n";
import type { PlannedMatch } from "../lib/plan";
import type { MatchWiring } from "./wiring";

export interface SnapshotWatchdogOptions {
  readonly plan: PlannedMatch | null;
  readonly hosting: boolean;
  readonly wiring: MatchWiring;
  readonly setBanner: (banner: string | null) => void;
  readonly t: Translator;
}

export function useSnapshotWatchdog(options: SnapshotWatchdogOptions): void {
  const { plan, hosting, wiring, setBanner, t } = options;
  const { lastSnapshotAt, stateRef } = wiring;

  useEffect(() => {
    if (!plan || plan.kind !== "online" || hosting) return undefined;
    const timer = setInterval(() => {
      if (stateRef.current?.status !== "playing") return;
      if (lastSnapshotAt.current === 0) return;
      if (Date.now() - lastSnapshotAt.current > SNAPSHOT_WATCHDOG_MS) setBanner(t("match.reconnecting"));
    }, 500);
    return () => clearInterval(timer);
  }, [plan, hosting, t, lastSnapshotAt, stateRef, setBanner]);
}
