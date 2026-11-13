/**
 * TC-MATCH-941: the aim aid shows the shot that will actually be sent (`US-MATCH-005` AC2).
 *
 * The aid may not re-derive physics. `aimPreview` asks `previewShot` in `@gbw/core` for the resolver's own flight,
 * so bounces, `piercing`, `itm-bunge`, off-map returns, the pad nudge, the item effects and the mobile's angle
 * window are all decided by the code that will decide the shot. These cases pin that down by firing the same shot
 * through `applyInput` and comparing the two landings.
 */
import { describe, expect, it } from "vitest";
import { applyInput, createMatch, getMobile } from "@gbw/core";
import type { FireInput } from "@gbw/core";
import { fireFromPull } from "../src/game/aim";
import { aimPreview } from "../src/game/preview";

const NOW = 1_700_000_000_000;

function match(mobileId = "mbl-01", mapId = "map-01") {
  return createMatch({
    matchId: "m-1",
    roomCode: "ABC234",
    seed: 42,
    mode: "solo",
    mapId,
    seats: [
      { slot: 0, team: "A", accountId: "acc-a", displayName: "A", mobileId },
      { slot: 1, team: "B", accountId: "acc-b", displayName: "B", mobileId: "mbl-02" },
    ],
    now: NOW,
  });
}

/** A state in which slot 0 is the one to act, whatever the seed rolled. */
function onTurn(state: ReturnType<typeof match>) {
  return { ...state, turn: { ...state.turn, activeSlot: 0 } };
}

/** The impact the engine itself resolves for `input`, which is what the aid has to promise. */
function resolvedImpact(state: ReturnType<typeof match>, input: FireInput): { x: number; y: number } | null {
  const result = applyInput(onTurn(state), input, NOW);
  const shot = result.events.find((event) => event.kind === "shot");
  return shot && shot.kind === "shot" ? shot.impact : null;
}

describe("TC-MATCH-941: the aim aid shows that weapon's shot (US-MATCH-005 AC2)", () => {
  it("reports the selected slot and its own blast radius", () => {
    // The super shot is gated by its gauge (`US-CORE-007`): charge it, or the preview for slot 2 is null.
    const base = match("mbl-02");
    const state = {
      ...base,
      players: base.players.map((player) => (player.slot === 0 ? { ...player, ssCharge: 100 } : player)),
    };
    const weapons = getMobile("mbl-02").weapons;
    for (const slot of [0, 1, 2] as const) {
      const preview = aimPreview({ state, localSlot: 0, weaponSlot: slot, angle: 45, power: 2 })!;
      expect(preview.weaponSlot).toBe(slot);
      // The ring at the landing point is the radius this weapon really carves, not a decoration.
      expect(preview.radius).toBe(weapons[slot].radius);
    }
    expect(weapons[1]!.radius).not.toBe(weapons[0]!.radius);
  });

  it("lands where the engine lands, for every shot class including the bouncing and piercing ones", () => {
    for (const mobileId of ["mbl-02", "mbl-03", "mbl-05"] as const) {
      for (const slot of [0, 1] as const) {
        const state = match(mobileId);
        const mobile = getMobile(mobileId);
        const preview = aimPreview({ state: onTurn(state), localSlot: 0, weaponSlot: slot, angle: 35, power: 2 })!;
        const input = fireFromPull(
          { angle: 35, power: 2 },
          { slot: 0, weaponSlot: slot, seq: 1, mobile },
        )!;
        expect(preview.impact).toEqual(resolvedImpact(state, input));
      }
    }
  });

  it("carries the angle the fire input will carry, nudge and window included", () => {
    const state = match("mbl-02");
    const mobile = getMobile("mbl-02");
    for (const [angle, aimDelta] of [
      [60, 10],
      [60, -10],
      [100, 0],
      [-40, 0],
    ] as const) {
      const preview = aimPreview({ state, localSlot: 0, weaponSlot: 0, angle, power: 2, aimDelta })!;
      const shot = fireFromPull(
        { angle, power: 2 },
        { slot: 0, weaponSlot: 0, seq: 7, mobile, aimDelta },
      )!;
      expect(preview.angle).toBe(shot.angle);
      expect(preview.bar).toBe(shot.bar);
      expect(preview.angle).toBeGreaterThanOrEqual(mobile.angleMin);
      expect(preview.angle).toBeLessThanOrEqual(mobile.angleMax);
    }
  });

  it("does not bend the shot for Bunge Shot, because the engine does not either", () => {
    // GB's Bunge Shot carves more ground; it is not a returning shell, so the aid has to stay the straight flight.
    const plain = match("mbl-02");
    const bunge = { ...plain, effects: { ...plain.effects, bungeNext: true } };
    const mobile = getMobile("mbl-02");
    const input = fireFromPull({ angle: 45, power: 2 }, { slot: 0, weaponSlot: 0, seq: 1, mobile })!;

    const straight = aimPreview({ state: plain, localSlot: 0, weaponSlot: 0, angle: 45, power: 2 })!;
    const armed = aimPreview({ state: bunge, localSlot: 0, weaponSlot: 0, angle: 45, power: 2 })!;

    expect(straight.impact).toEqual(resolvedImpact(plain, input));
    expect(armed.impact).toEqual(resolvedImpact(bunge, input));
    expect(armed.impact).toEqual(straight.impact);
  });

  it("fires the slot `itm-dual` forces while its pair lasts (US-CORE-009 AC2)", () => {
    const state = match("mbl-02");
    const dual = { ...state, effects: { ...state.effects, dualWeapon: 1 as const, shotsLeft: 2 } };
    const preview = aimPreview({ state: dual, localSlot: 0, weaponSlot: 0, angle: 45, power: 2 })!;
    expect(preview.weaponSlot).toBe(1);
    expect(preview.radius).toBe(getMobile("mbl-02").weapons[1]!.radius);
  });

  it("samples the flight from the muzzle to the impact", () => {
    const state = match();
    const player = state.players[0]!;
    const preview = aimPreview({ state, localSlot: 0, weaponSlot: 0, angle: 45, power: 2 })!;
    expect(preview.path.length).toBeGreaterThan(2);
    expect(preview.path[0]).toEqual({ x: player.x, y: player.y });
    if (preview.impact) expect(preview.path[preview.path.length - 1]).toEqual(preview.impact);
  });

  it("says nothing about a shot it cannot compute", () => {
    const state = match();
    expect(aimPreview({ state, localSlot: 0, weaponSlot: 0, angle: 45, power: Number.NaN })).toBeNull();
    expect(aimPreview({ state, localSlot: 0, weaponSlot: 0, angle: Number.NaN, power: 2 })).toBeNull();
  });

  it("has nothing to preview once the local mobile is a wreck or the match is over", () => {
    const wrecked = match();
    const state = {
      ...wrecked,
      players: wrecked.players.map((player, index) => (index === 0 ? { ...player, eliminated: true } : player)),
    };
    expect(aimPreview({ state, localSlot: 0, weaponSlot: 0, angle: 45, power: 2 })).toBeNull();
    const ended = { ...match(), status: "ended" as const };
    expect(aimPreview({ state: ended, localSlot: 0, weaponSlot: 0, angle: 45, power: 2 })).toBeNull();
  });
});
