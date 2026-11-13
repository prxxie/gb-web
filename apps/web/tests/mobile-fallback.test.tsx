// @vitest-environment jsdom
/**
 * `TC-BAL-133`: a stored pick that names a dropped machine still seats the match (`US-BAL-005` AC5, § 5).
 *
 * The pick is persisted twice on this side: the lobby/match plan (`gbw.match`) and the result payload (`gbw.result`).
 * Both were written before the roster shrank, so both can name a machine this build no longer ships. The fallback is
 * applied where the record is read — the first machine of the list — so no screen ever hands `undefined` to `getMobile`
 * and a player with an old plan can still start a match.
 */
import { afterEach, describe, expect, it } from "vitest";
import { MOBILES } from "@gbw/core";
import { PLAN_KEY, readPlan } from "../src/lib/plan";
import { RESULT_KEY, readResult } from "../src/lib/result";

const SEAT = {
  slot: 0,
  team: "A" as const,
  accountId: "acc-1",
  displayName: "A",
  mobileId: "mbl-16",
  loadout: {},
};

function storePlan(mobileId: string): void {
  sessionStorage.setItem(
    PLAN_KEY,
    JSON.stringify({
      kind: "bot",
      roomCode: "ABC234",
      localSlot: 0,
      playerId: "acc-1",
      seats: [{ ...SEAT, mobileId }, { ...SEAT, slot: 1, team: "B", accountId: "acc-2", displayName: "B", mobileId: "mbl-02" }],
      seed: 9,
      mapId: "map-01",
      mode: "solo",
      maxPlayers: 2,
      hostPlayerId: "acc-1",
    }),
  );
}

afterEach(() => sessionStorage.clear());

describe("TC-BAL-133: a stored plan naming a dropped machine falls back to the first one", () => {
  it("normalises every seat against the shipped roster", () => {
    expect(MOBILES[0]?.mobileId).toBe("mbl-01");
    storePlan("mbl-16");
    const plan = readPlan();
    expect(plan?.seats[0]?.mobileId).toBe("mbl-01");
    // A seat that still names a live machine keeps its pick: the fallback only rescues what it has to.
    expect(plan?.seats[1]?.mobileId).toBe("mbl-02");
  });

  it("keeps a live pick untouched and never returns undefined for an empty store", () => {
    storePlan("mbl-13");
    expect(readPlan()?.seats[0]?.mobileId).toBe("mbl-13");
    sessionStorage.clear();
    expect(readPlan()).toBeNull();
  });

  it("normalises the result payload's own mobile id the same way", () => {
    sessionStorage.setItem(
      RESULT_KEY,
      JSON.stringify({
        roomCode: "ABC234",
        mode: "solo",
        winnerTeam: "A",
        startedAt: 1,
        endedAt: 2,
        rulesetVersion: "2026-11-13",
        winCondition: "elimination",
        players: [],
        mapId: "map-01",
        maxPlayers: 2,
        mobileId: "mbl-06",
        kind: "bot",
        isHost: true,
        submission: null,
      }),
    );
    expect(readResult("ABC234")?.mobileId).toBe("mbl-01");
  });
});
