import { describe, expect, it } from "vitest";
import { applyInput, createMatch, type Seat } from "../src/match.js";
import { applyBlast, mergeHits } from "../src/combat.js";
import { getMode, MODES } from "../src/data/modes.js";
import { TUNABLES } from "../src/tuning.js";
import { createTerrain, heightAt } from "../src/terrain.js";
import type { MatchState, ModeId, Team } from "../src/types.js";

const NOW = 1_700_000_000_000;

function seat(slot: number, team: Team, mobileId = "mbl-01"): Seat {
  return { slot, team, accountId: `acc-${slot}`, displayName: `P${slot}`, mobileId, loadout: {} };
}

function match(
  seats: readonly Seat[] = [seat(0, "A"), seat(1, "B")],
  options: { mode?: ModeId; mapId?: string; seed?: number } = {},
): MatchState {
  return createMatch({
    matchId: "match-1",
    roomCode: "ABC234",
    seed: options.seed ?? 7,
    mode: options.mode ?? "solo",
    mapId: options.mapId ?? "map-01",
    seats,
    now: NOW,
  });
}

function skip(state: MatchState): MatchState {
  return applyInput(state, { kind: "skip", slot: state.turn.activeSlot, seq: state.seq }, NOW).state;
}

function eliminate(state: MatchState, slot: number): MatchState {
  return {
    ...state,
    players: state.players.map((player) => (player.slot === slot ? { ...player, hp: 0, shield: 0, eliminated: true } : player)),
  };
}

function withJewels(state: MatchState, carriedBy: readonly (number | null)[]): MatchState {
  return {
    ...state,
    scores: {
      ...state.scores,
      jewels: state.scores.jewels.map((jewel, index) => ({ ...jewel, carriedBy: carriedBy[index] ?? null })),
    },
  };
}

function withDamage(state: MatchState, damage: Readonly<Record<Team, number>>): MatchState {
  return { ...state, players: state.players.map((player) => ({ ...player, damageDealt: damage[player.team] })) };
}

describe("modes", () => {
  it("TC-CORE-915: the score turn cap is the documented twelve turns per player", () => {
    expect(TUNABLES.scoreTurnCap).toBe(12);
    expect(getMode("score").turnCap).toBe(TUNABLES.scoreTurnCap);
    expect(MODES.map((mode) => mode.modeId)).toEqual(["solo", "score", "tag", "jewel"]);
    for (const modeId of ["solo", "tag", "jewel"] as const) {
      expect(getMode(modeId).turnCap).toBe(0);
    }
  });

  it("TC-CORE-027: solo ends when one team has no living mobile", () => {
    const ended = skip(eliminate(match(), 1));
    expect(ended.status).toBe("ended");
    expect(ended.winnerTeam).toBe("A");
    expect(ended.scores.score).toEqual({ A: 0, B: 0 });
  });

  it("TC-CORE-027: solo continues while both teams still have a living mobile", () => {
    expect(skip(match()).status).toBe("playing");
  });

  it("TC-CORE-915: score mode plays the full cap and the higher damage total wins", () => {
    let state = withDamage(match(undefined, { mode: "score" }), { A: 300, B: 100 });
    for (let turn = 0; turn < TUNABLES.scoreTurnCap * 2 - 1; turn += 1) {
      state = skip(state);
    }
    expect(state.status).toBe("playing");
    expect(state.turn.number - 1).toBe(TUNABLES.scoreTurnCap * 2 - 1);

    state = skip(state);
    expect(state.turn.number - 1).toBe(TUNABLES.scoreTurnCap * 2);
    expect(state.status).toBe("ended");
    expect(state.winnerTeam).toBe("A");
  });

  it("TC-CORE-915: a shot's damage is credited to the shooter", () => {
    const state = match(undefined, { mode: "score" });
    const target = state.players[1]!;
    const hits = applyBlast(state.players, {
      x: target.x,
      y: target.y,
      radius: 80,
      power: 100,
      ownerSlot: 0,
    });
    const merged = mergeHits(state.players, hits);
    expect(hits.some((hit) => hit.player.slot === 1)).toBe(true);
    expect(merged[0]!.damageDealt).toBeGreaterThan(0);
  });

  it("TC-CORE-915: score mode still ends early when a team is eliminated", () => {
    const ended = skip(eliminate(match(undefined, { mode: "score" }), 1));
    expect(ended.status).toBe("ended");
    expect(ended.winnerTeam).toBe("A");
  });

  it("TC-CORE-916: tag mode plays a whole team before the other team acts", () => {
    const state = match([seat(0, "A"), seat(1, "B"), seat(2, "A"), seat(3, "B")], { mode: "tag" });
    const first = skip(state);
    expect(first.turn.activeSlot).toBe(2);
    const second = skip(first);
    expect(second.turn.activeSlot).toBe(1);
  });

  it("TC-CORE-916: tag mode flips scores.activeTeam when the acting team changes", () => {
    const state = match([seat(0, "A"), seat(1, "B"), seat(2, "A"), seat(3, "B")], { mode: "tag" });
    const afterTeamA = skip(skip(state));
    expect(afterTeamA.turn.activeSlot).toBe(1);
    expect(afterTeamA.players[1]!.team).toBe("B");
    expect(afterTeamA.scores.activeTeam).toBe("B");
  });

  it("TC-CORE-917: walking over a jewel carries it", () => {
    const state = match(undefined, { mode: "jewel" });
    const jewel = state.scores.jewels[0]!;
    const terrain = createTerrain(state.mapId);
    const walker = { ...state.players[0]!, x: jewel.x - 40, y: heightAt(terrain, jewel.x - 40) - 8 };
    const walked = applyInput(
      { ...state, players: state.players.map((player) => (player.slot === walker.slot ? walker : player)) },
      { kind: "move", slot: walker.slot, dir: 1, run: false, seq: state.seq },
      NOW,
    ).state;
    expect(walked.players[0]!.x).toBeGreaterThan(jewel.x);
    expect(walked.scores.jewels[0]!.carriedBy).toBe(0);
  });

  it("TC-CORE-917: a kill transfers the victim's jewels to the killer's team", () => {
    const state = withJewels(match(undefined, { mode: "jewel" }), [1, null, null]);
    const terrain = createTerrain(state.mapId);
    const placed: MatchState = {
      ...state,
      players: state.players.map((player) => {
        if (player.slot === 0) return { ...player, x: 180, y: heightAt(terrain, 180) - 8 };
        return { ...player, x: 250, y: heightAt(terrain, 250) - 8, hp: 1, shield: 0 };
      }),
    };
    const shot = applyInput(
      placed,
      { kind: "fire", slot: 0, weaponSlot: 0, angle: 0, force: 0, seq: placed.seq },
      NOW,
    ).state;
    const victim = shot.players[1]!;
    expect(victim.eliminated).toBe(true);
    expect(shot.scores.jewels[0]!.carriedBy).toBe(0);
  });

  it("TC-CORE-917: a team holding every jewel wins immediately", () => {
    const ended = skip(withJewels(match(undefined, { mode: "jewel" }), [0, 0, 0]));
    expect(ended.status).toBe("ended");
    expect(ended.winnerTeam).toBe("A");
  });

  it("TC-CORE-917: a split jewel count does not end the match", () => {
    const split = skip(withJewels(match(undefined, { mode: "jewel" }), [0, 0, 1]));
    expect(split.status).toBe("playing");
    expect(split.winnerTeam).toBe(null);
  });
});
