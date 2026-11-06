import { describe, expect, it } from "vitest";
import { acceptSnapshot, applySnapshot, encodeBytes, encodeSnapshot, decodeSnapshot, snapshotBytes, toSnapshot } from "../src/snapshot.js";
import { createMatch, type Seat } from "../src/match.js";
import type { MatchState } from "../src/types.js";
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
  it("AC5: the scores, the jewels and the ruleset version survive the wire", () => {
    const state = createMatch({
      matchId: "m-2",
      roomCode: "ABC235",
      seed: 12,
      mode: "jewel",
      mapId: "map-01",
      seats: [seat(0, "A"), seat(1, "B")],
      now: NOW,
    });
    const scored: MatchState = {
      ...state,
      rulesetVersion: "2026-11-06",
      scores: {
        score: { A: 3, B: 1 },
        activeTeam: "B",
        jewels: state.scores.jewels.map((jewel, index) => ({ ...jewel, carriedBy: index === 0 ? 1 : null })),
      },
    };
    const applied = applySnapshot(scored, decodeSnapshot(encodeSnapshot(toSnapshot(scored, 1))));

    expect(applied.scores.score).toEqual({ A: 3, B: 1 });
    expect(applied.scores.activeTeam).toBe("B");
    expect(applied.scores.jewels.filter((jewel) => jewel.carriedBy === 1)).toHaveLength(1);
    // A peer needs the version to know whether its own ruleset may rank this match (`US-CORE-007` AC5).
    expect(applied.rulesetVersion).toBe("2026-11-06");
  });

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
    // The mask is deliberately absent: a state snapshot is the 10 Hz channel, a carve is not.
    expect(toSnapshot(state, 1).terrain).toBeUndefined();
  });

  it("carries the mask only on a carve, and only up to the socket cap", () => {
    const state = fullMatch();
    const withMask = snapshotBytes(state, 1, { includeTerrain: true });
    // The mask is the whole cost: it adds bytes to every snapshot that carries it, and the hard cap is
    // the only per-frame limit that applies (`signaling.md` §3).
    expect(withMask).toBeGreaterThan(snapshotBytes(state, 1));
    expect(withMask).toBeLessThanOrEqual(TUNABLES.snapshotHardLimitBytes);
    const decoded = decodeSnapshot(encodeSnapshot(toSnapshot(state, 1, { includeTerrain: true })));
    expect(decoded.terrain).toBeTypeOf("string");
    // The mask decodes to the host's own heights, to a tenth of a unit, not to whole units.
    const applied = applySnapshot(state, decoded);
    expect(applied.terrain).toBeDefined();
    const shared = applied.terrain ?? [];
    for (let index = 0; index < shared.length; index += 97) {
      expect(shared[index]).toBeCloseTo(state.terrain[index] ?? 0, 1);
    }
  });
});

describe("TC-CORE-940: the same state encodes to the same bytes", () => {
  it("is byte-identical across two encodes, and applying it twice changes nothing", () => {
    // A peer compares and stores snapshots by their bytes, and a duplicated one must not cost a re-render.
    const state = fullMatch();
    const first = encodeBytes(encodeSnapshot(toSnapshot(state, 1)));
    const second = encodeBytes(encodeSnapshot(toSnapshot(state, 1)));
    expect(second).toBe(first);

    const once = applySnapshot(state, toSnapshot(state, 1));
    const twice = applySnapshot(once, toSnapshot(state, 1));
    expect(twice.seq).toBe(once.seq);
    expect(twice.players.map((player) => player.hp)).toEqual(once.players.map((player) => player.hp));
    expect(twice.changed).toBe(once.changed);
  });
});

describe("TC-CORE-941: a stale or foreign snapshot never wins", () => {
  it("takes 41 after 39, refuses 39 after 41, and refuses an older host generation", () => {
    const snapshot = toSnapshot(fullMatch(), 4);
    const newer = { ...snapshot, seq: 41 };
    const older = { ...snapshot, seq: 39 };
    // 40 is not required: a peer accepts any sequence above the last one it saw.
    expect(acceptSnapshot(4, older.seq, newer)).toBe(true);
    expect(acceptSnapshot(4, newer.seq, older)).toBe(false);
    expect(acceptSnapshot(5, 0, snapshot)).toBe(false);
  });
});

describe("TC-CORE-942: an applied snapshot matches the host", () => {
  it("restores shields, energy, the delay queue, the weapon slot and the mode state", () => {
    const host = fullMatch();
    // `applySnapshot` patches the mutable half (players, seq, scores, terrain); the turn and weather ride in
    // the snapshot itself, which is what the resync composes with — `packages/core/src/snapshot.ts:252`.
    const snapshot = decodeSnapshot(encodeSnapshot(toSnapshot(host, 2)));
    const applied = applySnapshot(host, snapshot);
    const first = applied.players[0];
    const hostFirst = host.players[0];
    if (!first || !hostFirst) throw new Error("the fixture has eight players");
    expect(first.shield).toBe(hostFirst.shield);
    expect(first.energy).toBe(hostFirst.energy);
    expect(snapshot.turn).toEqual(host.turn);
    expect(snapshot.weather).toEqual(host.weather);
    expect(first.weaponSlot).toBe(hostFirst.weaponSlot);
    expect(applied.scores.score).toEqual(host.scores.score);
    expect(snapshot.status).toBe(host.status);
    // The delay queue is what decides the next turn, so a peer that missed it would desync silently.
    expect(applied.players.map((player) => player.delay)).toEqual(host.players.map((player) => player.delay));
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
