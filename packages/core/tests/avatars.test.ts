import { describe, expect, it } from "vitest";
import { AVATAR_CAPS, avatarBonus, bonusMultipliers } from "../src/data/avatars.js";
import { getMobile } from "../src/data/mobiles.js";
import { applyInput, createMatch, type MatchEvent, type Seat } from "../src/match.js";
import { toSnapshot } from "../src/snapshot.js";
import { TUNABLES } from "../src/tuning.js";
import type { MatchState, Vec2 } from "../src/types.js";

/**
 * Oracle tests for `US-CORE-013` (avatar stat bonuses).
 *
 * A part is worth a fixed amount, the sum is capped, and the result is frozen into the match at
 * creation: no story promises that a later change to an avatar reaches a running match.
 */

const NOW = 1_700_000_000_000;

function seat(
  slot: number,
  team: "A" | "B",
  avatarParts: readonly string[] = [],
  mobileId = "mbl-01",
): Seat {
  return { slot, team, accountId: null, displayName: `p${slot}`, mobileId, avatarParts };
}

function match(
  seats: readonly Seat[] = [seat(0, "A"), seat(1, "B")],
  mapId = "map-01",
): MatchState {
  return createMatch({
    matchId: "match-1",
    roomCode: "ABC234",
    seed: 7,
    mode: "solo",
    mapId,
    seats,
    now: NOW,
  });
}

function fire(state: MatchState, slot: number, weaponSlot: 0 | 1 | 2, angle: number, force: number) {
  return applyInput(state, { kind: "fire", slot, weaponSlot, angle, force, seq: state.seq }, NOW);
}

function firstOf<K extends MatchEvent["kind"]>(
  events: readonly MatchEvent[],
  kind: K,
): Extract<MatchEvent, { kind: K }> {
  for (const event of events) {
    if (event.kind === kind) return event as Extract<MatchEvent, { kind: K }>;
  }
  throw new Error(`expected a ${kind} event`);
}

/** Same match with the wind removed, so the impact point is a function of the aim only. */
function calm(state: MatchState): MatchState {
  return {
    ...state,
    weather: { ...state.weather, wind: { magnitude: 0, directionDeg: 0, sector: 0 } },
  };
}

/** Put the second player on the given point, so the next shot lands on them. */
function withTargetAt(state: MatchState, point: Vec2): MatchState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.slot === 1 ? { ...player, x: point.x, y: point.y } : player,
    ),
  };
}

/**
 * Health plus shield the second player loses to one identical shot, read off the `shot` event rather than
 * off the ending state: the turn that follows the shot regenerates the next player's shield
 * (`US-CORE-003` AC3), which would otherwise shrink the measured damage by exactly `shieldRegen`.
 */
function loss(state: MatchState): number {
  const shot = firstOf(fire(state, 0, 0, 15, 60).events, "shot");
  const hit = shot.hits.find((entry) => entry.slot === 1);
  return hit === undefined ? 0 : hit.damage;
}

describe("avatars", () => {
  it("TC-CORE-921: a +4 attack part multiplies damage by 1.04", () => {
    const bonus = avatarBonus(["av-head-01"]);
    expect(bonus.attack).toBe(4);
    expect(bonusMultipliers(bonus).attack).toBe(1.04);
  });

  it("TC-CORE-921: the ×1.04 attack multiplier reaches the damage a shot deals", () => {
    const plain = calm(match([seat(0, "A"), seat(1, "B")]));
    const armed = calm(match([seat(0, "A", ["av-head-01"]), seat(1, "B")]));
    const impact = firstOf(fire(plain, 0, 0, 15, 60).events, "shot").impact;
    expect(impact).not.toBeNull();
    if (!impact) return;

    const mobile = getMobile("mbl-01");
    const weapon = mobile.weapons[0]!;
    const inner = (multiplier: number) =>
      Math.round((weapon.power * TUNABLES.tierPowerInner * multiplier) / mobile.defense);

    expect(loss(withTargetAt(plain, impact))).toBe(inner(1));
    expect(loss(withTargetAt(armed, impact))).toBe(inner(1.04));
    expect(inner(1.04)).toBeGreaterThan(inner(1));
  });

  it("TC-CORE-921: the attack total is capped at ×1.10", () => {
    expect(AVATAR_CAPS.attack).toBe(10);
    const stacked = avatarBonus(["av-head-01", "av-body-02", "av-weapon-01", "av-acc-02"]);
    expect(bonusMultipliers(stacked).attack).toBe(1.1);
  });

  it("TC-CORE-921: the defense, energy and delay caps hold", () => {
    // The caps are the ones `tunables.md` § 7 documents, and `AVATAR_CAPS` is the single source of them.
    expect(AVATAR_CAPS).toEqual({ attack: 10, defense: 10, energy: 12, delay: 8 });

    // These four parts sum to the +10 cap, so the multiplier is the cap itself, not their raw total.
    const tank = avatarBonus(["av-head-02", "av-body-01", "av-weapon-02", "av-acc-03"]);
    expect(bonusMultipliers(tank).defense).toBeCloseTo(1 + AVATAR_CAPS.defense / 100, 5);

    // Delay reduction has its own cap (−8 %), which these parts already exceed.
    const slowed = avatarBonus(["av-head-04", "av-body-04", "av-weapon-04", "av-acc-01"]);
    expect(bonusMultipliers(slowed).delay).toBeCloseTo(1 - AVATAR_CAPS.delay / 100, 5);
  });

  it("TC-CORE-921: a +8 energy part adds eight to the pool, never more than the cap", () => {
    const mobile = getMobile("mbl-13");
    const bonus = avatarBonus(["av-head-03", "av-body-03"]);
    expect(bonus.energy).toBe(8);

    const state = match([seat(0, "A", ["av-head-03", "av-body-03"], "mbl-13"), seat(1, "B")]);
    expect(state.players[0]!.energy).toBe(mobile.energy + 8);

    const capped = match([
      seat(0, "A", ["av-head-03", "av-body-03", "av-weapon-03", "av-acc-04"], "mbl-13"),
      seat(1, "B"),
    ]);
    expect(capped.players[0]!.energy).toBeLessThanOrEqual(mobile.energy + AVATAR_CAPS.energy);
  });

  it("TC-CORE-929: a guest with no avatar gets no bonus and the match is still playable", () => {
    expect(avatarBonus([])).toEqual({ attack: 0, defense: 0, energy: 0, delay: 0 });
    expect(bonusMultipliers(avatarBonus([]))).toEqual({
      attack: 1,
      defense: 1,
      energy: 1,
      delay: 1,
    });

    const mobile = getMobile("mbl-01");
    const state = match([seat(0, "A"), seat(1, "B")]);
    const guest = state.players[0]!;
    expect(guest.attack).toBe(1);
    expect(guest.energy).toBe(mobile.energy);
    expect(guest.delay).toBe(mobile.baseDelay);

    const result = fire(state, 0, 0, 30, 60);
    expect(firstOf(result.events, "shot").slot).toBe(0);
  });

  it("TC-CORE-930: an unknown or retired part contributes no bonus", () => {
    expect(avatarBonus(["av-retired-99"])).toEqual(avatarBonus([]));
    expect(avatarBonus(["av-head-01", "av-retired-99"])).toEqual(avatarBonus(["av-head-01"]));
    expect(avatarBonus(["av-head-01", "av-head-01"]).attack).toBe(4);
  });

  it("TC-CORE-921: the avatar total is frozen into the opening snapshot", () => {
    const state = match([seat(0, "A", ["av-weapon-01"], "mbl-13"), seat(1, "B")]);
    const player = state.players[0]!;
    const frozen = toSnapshot(state, 1).players.find((candidate) => candidate.slot === 0)!;

    expect(frozen.energy).toBe(player.energy);
    expect(frozen.delay).toBe(player.delay);
    expect(frozen.energy).toBe(getMobile("mbl-13").energy);
  });
});
