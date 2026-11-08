// @vitest-environment jsdom
/**
 * TC-NET-905: one simulation, seven clients (`US-NET-002` AC1, AC2, AC4, AC5, AC7).
 *
 * The rules that keep the star honest are pure, so they are checked here: what a peer puts on the wire, which input the
 * host is allowed to drop, at what rate snapshots leave, and how big a snapshot may be. The page-level wiring — a peer
 * sends instead of simulating — is asserted by `match-wiring.test.tsx`'s harness for the renderer, and by a two-browser pass that is still owed.
 */
import { describe, expect, it } from "vitest";
import { TUNABLES, applyInput, createMatch, encodeBytes, toSnapshot } from "@gbw/core";
import {
  SNAPSHOT_BUFFER_LIMIT,
  SNAPSHOT_HZ_ACTIVE,
  SNAPSHOT_HZ_IDLE,
  SNAPSHOT_WATCHDOG_MS,
  inputFrameOf,
  isStaleInput,
  readSnapshot,
  snapshotHz,
  snapshotIntervalMs,
  wireSnapshot,
  withinSnapshotBudget,
} from "../src/net/input";

function eightPlayers() {
  const seats = Array.from({ length: 8 }, (_, slot) => ({
    slot,
    team: (slot < 4 ? "A" : "B") as "A" | "B",
    accountId: null,
    displayName: `Player ${slot}`,
    mobileId: slot % 2 === 0 ? "mbl-01" : "mbl-05",
  }));
  return createMatch({
    matchId: "mch-1",
    roomCode: "AAAAAA",
    seed: "seed-1",
    mode: "solo",
    mapId: "map-01",
    seats,
    now: 0,
  });
}

describe("TC-NET-905: what a peer puts on the wire (US-NET-002 AC1)", () => {
  it("carries the turn, the seq, the angle, the force, the facing and the weapon slot", () => {
    const frame = inputFrameOf({ kind: "fire", angle: 47, force: 88, facing: -1, weaponSlot: 1 }, 12, 34);

    expect(frame).toEqual({ t: "input", turn: 12, seq: 34, kind: "fire", angle: 47, force: 88, facing: -1, weaponSlot: 1 });
  });

  it("leaves the ballistic fields off a skip, so a skip cannot be read as a shot", () => {
    expect(inputFrameOf({ kind: "skip" }, 3, 9)).toEqual({ t: "input", turn: 3, seq: 9, kind: "skip" });
  });
});

describe("TC-NET-905: a resent input is dropped, not replayed (US-NET-002 AC4)", () => {
  it("drops a seq at or below the last one applied and keeps a newer one", () => {
    expect(isStaleInput({ t: "input", turn: 4, seq: 7, kind: "skip" }, 7)).toBe(true);
    expect(isStaleInput({ t: "input", turn: 4, seq: 6, kind: "skip" }, 7)).toBe(true);
    expect(isStaleInput({ t: "input", turn: 4, seq: 8, kind: "skip" }, 7)).toBe(false);
    expect(isStaleInput({ t: "input", turn: 4, seq: 1, kind: "skip" }, undefined)).toBe(false);
  });

  it("matches the engine's own rule: one fire per slot per turn", () => {
    const state = eightPlayers();
    const turn = state.turn.number;
    const slot = state.turn.activeSlot;
    const first = applyInput(state, { kind: "fire", slot, weaponSlot: 0, angle: 45, force: 50, seq: 1 }, 0);
    const second = applyInput(first.state, { kind: "fire", slot, weaponSlot: 0, angle: 45, force: 50, seq: 2 }, 0);

    expect(first.state.turn.number).not.toBe(turn);
    // The engine answers a second shot in the same turn with a reject event instead of an error; the alias rule is
    // covered where the engine lives, in `packages/core/tests`.
    expect(second.events.some((event) => event.kind === "reject" && event.reason === "not-your-turn")).toBe(true);
  });
});

describe("TC-NET-905: the host publishes at 10 Hz in a turn and 2 Hz when it is over (US-NET-002 AC2)", () => {
  it("maps the match status to a rate and a period", () => {
    expect(snapshotHz("playing")).toBe(SNAPSHOT_HZ_ACTIVE);
    expect(snapshotHz("ended")).toBe(SNAPSHOT_HZ_IDLE);
    expect(snapshotIntervalMs("playing")).toBe(100);
    expect(snapshotIntervalMs("ended")).toBe(500);
  });
});

describe("TC-NET-905: a snapshot carries no terrain and stays inside the budget (US-NET-002 AC5, AC7)", () => {
  it("packs eight players into the budget", () => {
    const payload = wireSnapshot(toSnapshot(eightPlayers(), 1));

    // Measured 2026-11-08 after the packing: 395 B for eight players (the SS gauge rides the player row), against the 1319 B the named-field form
    // weighed. AC7 is met with half the budget to spare.
    expect(withinSnapshotBudget(payload)).toBe(true);
    expect(encodeBytes(payload)).toBe(395);
  });

  it("survives the round trip: what the peer reads is what the host packed", () => {
    const state = eightPlayers();
    const sent = toSnapshot(state, 2);
    const read = readSnapshot(wireSnapshot(sent));

    expect(read.seq).toBe(sent.seq);
    expect(read.hostGeneration).toBe(2);
    expect(read.turn.activeSlot).toBe(sent.turn.activeSlot);
    expect(read.weather.wind).toMatchObject({ magnitude: sent.weather.wind.magnitude, sector: sent.weather.wind.sector });
    expect(read.players).toHaveLength(8);
    expect(read.players[0]).toMatchObject({ slot: 0, hp: sent.players[0]!.hp, x: sent.players[0]!.x, facing: 1 });
    expect(read.players[7]!.slot).toBe(7);
  });

  it("strips the terrain mask, which is kilobytes of run-length pairs", () => {
    const state = eightPlayers();
    const withTerrain = toSnapshot(state, 1, { includeTerrain: true });
    expect("terrain" in withTerrain).toBe(true);

    const payload = wireSnapshot(withTerrain);
    expect(payload.includes("\"m" + "\"")).toBe(false);
    expect(withinSnapshotBudget(payload)).toBe(true);
  });

  it("keeps the drop threshold and the watchdog at the documented values", () => {
    expect(SNAPSHOT_BUFFER_LIMIT).toBe(64 * 1024);
    expect(SNAPSHOT_WATCHDOG_MS).toBe(2_000);
    expect(TUNABLES.turnDurationMs).toBeGreaterThan(SNAPSHOT_WATCHDOG_MS);
  });
});
