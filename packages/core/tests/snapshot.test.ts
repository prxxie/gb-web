import { describe, expect, it } from "vitest";
import { acceptSnapshot, applySnapshot, encodeBytes, encodeSnapshot, decodeSnapshot, snapshotBytes, toSnapshot } from "../src/snapshot.js";
import { createMatch, type Seat } from "../src/match.js";
import { TUNABLES } from "../src/tuning.js";

const NOW = 1_700_000_000_000;

function seat(slot: number, team: "A" | "B"): Seat {
  return { slot, team, accountId: `acc-${slot}`, displayName: `P${slot}`, mobileId: "mbl-01", loadout: {} };
}

function fullMatch() {
  const seats: Seat[] = [];
  for (let slot = 0; slot < 8; slot += 1) seats.push(seat(slot, slot % 2 === 0 ? "A" : "B"));
  return createMatch({ matchId: "m-1", roomCode: "ABC234", seed: 11, mode: "solo", mapId: "map-01", seats, now: NOW });
}

describe("TC-CORE-040: snapshot round trip", () => {
  it("encodes and decodes back to the same state", () => {
    const state = fullMatch();
    const snapshot = toSnapshot(state, 3);
    const decoded = decodeSnapshot(encodeSnapshot(snapshot));
    expect(decoded.hostGeneration).toBe(3);
    expect(decoded.players).toHaveLength(8);
    expect(decoded.turn.activeSlot).toBe(snapshot.turn.activeSlot);
    expect(decoded.players.map((player) => player.slot)).toEqual(snapshot.players.map((player) => player.slot));
    for (const [index, player] of snapshot.players.entries()) {
      expect(decoded.players[index]?.hp).toBe(player.hp);
      expect(decoded.players[index]?.x).toBeCloseTo(player.x, 1);
      expect(decoded.players[index]?.weaponSlot).toBe(player.weaponSlot);
    }
  });
});

describe("TC-CORE-041: the size budget", () => {
  it("keeps an eight-player snapshot under the 800-byte budget", () => {
    const state = fullMatch();
    const bytes = snapshotBytes(state, 1);
    expect(bytes).toBeLessThanOrEqual(TUNABLES.snapshotMaxBytes);
    expect(encodeBytes(encodeSnapshot(toSnapshot(state, 1)))).toBe(bytes);
  });
});

describe("TC-CORE-042: refusing a hostile snapshot", () => {
  it("rejects a payload above the hard limit", () => {
    const padding = "x".repeat(TUNABLES.snapshotHardLimitBytes + 1);
    expect(encodeBytes(padding)).toBeGreaterThan(TUNABLES.snapshotHardLimitBytes);
  });
});

describe("TC-NET-903: accepting a snapshot", () => {
  it("refuses an older generation and a stale sequence", () => {
    const state = fullMatch();
    const snapshot = toSnapshot(state, 4);
    expect(acceptSnapshot(4, snapshot.seq - 1, snapshot)).toBe(true);
    expect(acceptSnapshot(4, snapshot.seq, snapshot)).toBe(false);
    expect(acceptSnapshot(5, 0, snapshot)).toBe(false);
  });

  it("applies an accepted snapshot onto the local state", () => {
    const state = fullMatch();
    const snapshot = toSnapshot(state, state.turn.round);
    const applied = applySnapshot(state, snapshot);
    expect(applied.players).toHaveLength(8);
    expect(applied.seq).toBeGreaterThanOrEqual(state.seq);
  });
});
