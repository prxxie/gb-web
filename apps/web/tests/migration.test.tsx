// @vitest-environment jsdom
/**
 * TC-NET-908: the new host adopts the last snapshot instead of replaying the match (`US-NET-003` AC1, AC3, AC6).
 *
 * A host crash used to cost the room its state: the elected peer bumped the generation, rebuilt the star and then
 * waited for the next turn tick, so every peer kept the numbers of a dead host until somebody fired. The adoption below
 * is the missing half — the promoted client starts from the snapshot the DO kept, and its first publish is one `seq`
 * newer than that snapshot so the peers accept it (`acceptSnapshot` refuses anything not strictly newer).
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import { createMatch, toSnapshot, type MatchState, type Snapshot } from "@gbw/core";
import { FRESH_SEQ, adoptHostChanged } from "../src/net/migration";
import { resyncFromSnapshot } from "../src/net/resync";

const SEATS = [
  { slot: 0, team: "A", accountId: null, displayName: "Host", mobileId: "mbl-01" },
  { slot: 1, team: "B", accountId: null, displayName: "Peer", mobileId: "mbl-02" },
] as const;

function match(): MatchState {
  return createMatch({
    matchId: "m-1",
    roomCode: "AAAAAA",
    seed: "seed-1",
    mode: "solo",
    mapId: "map-01",
    seats: SEATS,
    now: 1_000,
  });
}

function snapshotAt(seq: number, generation: number): Snapshot {
  const state = { ...match(), seq };
  return toSnapshot(state, generation);
}

describe("TC-NET-908: the promoted host adopts the last snapshot (US-NET-003 AC1, AC3)", () => {
  afterEach(cleanup);

  it("restores the snapshot's players and publishes one seq later", () => {
    const prev = match();
    const lastSnapshot = {
      ...snapshotAt(87, 4),
      players: snapshotAt(87, 4).players.map((player) =>
        player.slot === 1 ? { ...player, hp: 320, x: 1_500 } : player,
      ),
    };

    const adoption = adoptHostChanged(prev, {
      hostPlayerId: "peer-2",
      hostGeneration: 5,
      lastSnapshot,
    });

    expect(adoption.state).not.toBeNull();
    expect(adoption.seq).toBe(88);
    expect(adoption.state!.seq).toBe(88);
    expect(adoption.hostGeneration).toBe(5);
    // The numbers on screen are the snapshot's, not whatever the dead host last sent.
    const peer = adoption.state!.players.find((player) => player.slot === 1)!;
    expect(peer.hp).toBe(320);
    expect(peer.x).toBe(1_500);
    // The clock is preserved: the active player keeps the time they had (§ 5).
    expect(adoption.state!.turn.deadlineAt).toBe(lastSnapshot.turn.deadlineAt);
  });

  it("starts a fresh snapshot at seq 1 when the room dropped before any publish", () => {
    const adoption = adoptHostChanged(match(), {
      hostPlayerId: "peer-2",
      hostGeneration: 5,
      lastSnapshot: null,
    });

    expect(adoption.seq).toBe(FRESH_SEQ);
    expect(adoption.state!.seq).toBe(FRESH_SEQ);
    expect(adoption.state!.players).toHaveLength(2);
    expect(adoption.hostGeneration).toBe(5);
  });

  it("drops a snapshot from the generation it just left", () => {
    const prev = match();
    const adoption = adoptHostChanged(prev, {
      hostPlayerId: "peer-2",
      hostGeneration: 5,
      lastSnapshot: snapshotAt(87, 4),
    });

    const stale = { ...snapshotAt(90, 4) };
    const resynced = resyncFromSnapshot(adoption.state!, stale, adoption.hostGeneration);
    expect(resynced.applied).toBe(false);
    expect(resynced.state.turn.number).toBe(adoption.state!.turn.number);
  });

  it("keeps the adopted generation when a snapshot from it arrives", () => {
    const adoption = adoptHostChanged(match(), {
      hostPlayerId: "peer-2",
      hostGeneration: 5,
      lastSnapshot: snapshotAt(87, 5),
    });

    const current = adoptHostChanged(match(), {
      hostPlayerId: "peer-2",
      hostGeneration: 5,
      lastSnapshot: snapshotAt(87, 4),
    });
    expect(adoption.hostGeneration).toBe(5);
    expect(resyncFromSnapshot(current.state!, snapshotAt(90, 5), 5).applied).toBe(true);
  });
});
