/**
 * Snapshot resync (`US-ROOM-004` AC2, AC5).
 *
 * The host's numbers must be the numbers on every screen: hp, the active slot and the wind are the three
 * a player can see and argue about. The `hostGeneration` guard is what keeps a snapshot from the host
 * that was already replaced out of the local state.
 */
import { describe, expect, it } from "vitest";
import { createMatch, toSnapshot, type MatchState } from "@gbw/core";
import { resyncFromSnapshot } from "../src/net/resync";

const NOW = 1_700_000_000_000;

function match(): MatchState {
  return createMatch({
    matchId: "m-1",
    roomCode: "ABC234",
    seed: 42,
    mode: "solo",
    mapId: "map-01",
    seats: [
      { slot: 0, team: "A", accountId: "acc-a", displayName: "A", mobileId: "mbl-01" },
      { slot: 1, team: "B", accountId: "acc-b", displayName: "B", mobileId: "mbl-02" },
    ],
    now: NOW,
  });
}

/** The host's view one turn later: slot 1 took a hit, slot 0 is up, and the wind turned. */
function hostView(state: MatchState): MatchState {
  return {
    ...state,
    seq: state.seq + 4,
    players: state.players.map((player) =>
      player.slot === 1 ? { ...player, hp: 55, eliminated: false } : { ...player, hp: 100 },
    ),
    turn: { ...state.turn, activeSlot: 0, number: state.turn.number + 1, deadlineAt: NOW + 15_000 },
    weather: { wind: { ...state.weather.wind, magnitude: 7 }, rolledAtRound: state.weather.rolledAtRound },
  };
}

describe("TC-ROOM-201: a replayed snapshot lands the host's numbers (US-ROOM-004 AC2, AC5)", () => {
  it("shows the host's hp, active slot and wind after the replay", () => {
    const local = match();
    const snapshot = toSnapshot(hostView(local), 1);
    const result = resyncFromSnapshot(local, snapshot, 0);

    expect(result.applied).toBe(true);
    expect(result.state.players.map((player) => player.hp)).toEqual([100, 55]);
    expect(result.state.turn.activeSlot).toBe(0);
    expect(result.state.turn.deadlineAt).toBe(NOW + 15_000);
    expect(result.state.weather.wind.magnitude).toBe(7);
    expect(result.state.seq).toBe(local.seq + 4);
    expect(result.hostGeneration).toBe(1);
  });

  it("drops a snapshot from a host that was already replaced", () => {
    const local = match();
    const snapshot = toSnapshot(hostView(local), 1);
    const result = resyncFromSnapshot(local, snapshot, 2);

    expect(result.applied).toBe(false);
    expect(result.state).toBe(local);
    expect(result.hostGeneration).toBe(2);
  });

  it("keeps the local terrain when the snapshot carries no mask", () => {
    const local = match();
    const result = resyncFromSnapshot(local, toSnapshot(hostView(local), 1), 0);
    expect(result.state.terrain).toBe(local.terrain);
  });
});
