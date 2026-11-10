/**
 * The plan the match runs from (`US-MATCH-008`).
 *
 * The lobby writes one into `sessionStorage` when the host starts; a reload of a practice match, or a deep link to a
 * room the device never joined, falls back to a bot match built from the session so the screen is always playable.
 */
import { useMemo } from "react";
import type { Seat } from "@gbw/core";
import { readPlan, type PlannedMatch } from "../lib/plan";
import { currentSession } from "../lib/session";

/** A practice match always has an opponent, or the team check would end it on the first turn. */
function botSeats(local: Seat): readonly Seat[] {
  return [local, { slot: 1, team: "B", accountId: null, displayName: "Bot", mobileId: "mbl-04" }];
}

export function useMatchPlan(code: string): PlannedMatch | null {
  return useMemo<PlannedMatch | null>(() => {
    const stored = readPlan();
    if (stored && stored.roomCode === code) return stored;
    const session = currentSession();
    if (!session) return null;
    return {
      kind: "bot",
      roomCode: code,
      localSlot: 0,
      playerId: `local-${session.subject.guestId ?? session.subject.accountId ?? "guest"}`,
      seats: botSeats({
        slot: 0,
        team: "A",
        accountId: session.subject.accountId ?? null,
        displayName: session.subject.displayName,
        mobileId: "mbl-01",
      }),
      seed: Math.floor(Math.random() * 0xffffff),
      mapId: "map-01",
      mode: "solo",
      maxPlayers: 2,
      hostPlayerId: "local",
    };
  }, [code]);
}
