/**
 * Mounting the renderer, and the callbacks it hands back (`US-MATCH-001`, `US-MATCH-002` AC7/AC8).
 *
 * `mountBattle` is created once per match and never remounted for a state change: the closures it captured are the
 * shot path, so everything they read lives in the wiring refs rather than in a state value.
 */
import { useEffect, useState, type RefObject } from "react";
import { applyInput, toSnapshot, type CameraWindow, type MatchState, type Mobile } from "@gbw/core";
import { fireFromPull } from "../game/aim";
import { mountBattle } from "../game/scene";
import { inputFrameOf, toPackedSnapshot } from "../net/input";
import type { PlannedMatch } from "../lib/plan";
import type { MatchAimHud } from "./useAimHud";
import type { MatchWeapons } from "./useWeaponSelect";
import type { CommitState, MatchWiring } from "./wiring";

export interface BattleMountOptions {
  readonly container: RefObject<HTMLDivElement | null>;
  readonly plan: PlannedMatch | null;
  readonly state: MatchState | null;
  readonly commit: CommitState;
  readonly mobile: Mobile;
  readonly wiring: MatchWiring;
  readonly aim: MatchAimHud;
  readonly weapons: MatchWeapons;
  /** The role as the renderer holds it (`US-NET-003` AC2). */
  readonly hostingRef: RefObject<boolean>;
}

export function useBattleMount(options: BattleMountOptions): void {
  const { container, plan, state, commit, mobile, wiring, aim, weapons, hostingRef } = options;
  const { battle, mesh, socket, seq, stateRef, hostGeneration } = wiring;
  const { weaponSlotRef, lockedTurnRef, setLockedTurn } = weapons;
  const { aimDeltaRef, cancelPull, setFocus, setItemWheelAt, setPower, setPullAngle } = aim;
  // The camera window still drives the scene; the ruler that printed it is gone (`screens/match.md` § 8).
  const [, setCamera] = useState<CameraWindow | null>(null);

  useEffect(() => {
    if (!container.current || !state || !plan) return;
    battle.current = mountBattle({
      parent: container.current,
      state,
      localSlot: plan.localSlot,
      callbacks: {
        // The pad rings the mobile the player is shooting (`US-MATCH-003` AC11).
        onFocus: (point) => setFocus(point),
        // A press held on this client's own hull fans the loadout out around it (`owner`, 2026-11-09).
        onItemHold: (point) => setItemWheelAt(point),
        onPull: (value, angle) => {
          setPower(value);
          setPullAngle(angle);
        },
        onRelease: (value, nextAngle) => {
          const current = stateRef.current;
          if (!current || !plan) return;
          // The scene already refuses to start a pull out of turn, but the release is the moment a shot would leave
          // the client, so the same decision is taken again here (`US-MATCH-002` AC7/AC8).
          const input = fireFromPull(
            { power: value, angle: nextAngle },
            {
              slot: plan.localSlot,
              weaponSlot: weaponSlotRef.current,
              seq: seq.current,
              mobile,
              aimDelta: aimDeltaRef.current,
              shot: { lockedTurn: lockedTurnRef.current, turnNumber: current.turn.number },
            },
          );
          if (!input) return;
          const turn = current.turn.number;
          if (!hostingRef.current) {
            // A peer never simulates (`US-NET-002` AC1): the input goes to the host, the shot appears when the host's
            // snapshot comes back — one round trip later by design (`OQ-32`, no prediction).
            seq.current = input.seq + 1;
            mesh.current?.sendControlAll(
              inputFrameOf(
                {
                  kind: "fire",
                  angle: input.angle,
                  force: input.force,
                  facing: current.players.find((player) => player.slot === plan.localSlot)?.facing ?? 1,
                  weaponSlot: input.weaponSlot,
                },
                turn,
                input.seq,
              ),
            );
            setLockedTurn(turn);
            lockedTurnRef.current = turn;
            setPower(0);
            return;
          }
          seq.current += 1;
          const result = applyInput(current, input, Date.now());
          commit(result.state, result.events);
          setLockedTurn(current.turn.number);
          lockedTurnRef.current = current.turn.number;
          // A shot that carved the mask is the only moment the peers need the terrain itself: they resolve
          // hits against it (`US-CORE-006` AC4), and the mask is far too big to ride in every snapshot.
          const carved = result.events.some((event) => event.kind === "shot" && event.carved);
          const snapshot = toSnapshot(result.state, hostGeneration.current, { includeTerrain: carved });
          mesh.current?.broadcast(snapshot);
          socket.current?.send({ t: "snapshot_push", snapshot: toPackedSnapshot(snapshot) });
          setPower(0);
        },
        onCancel: (reason) => cancelPull(reason),
        onCamera: (window) => setCamera(window),
      },
    });
    // A remounted scene starts on slot 0 and no nudge; hand it what the strip and the pad are showing.
    battle.current.setWeaponSlot(weaponSlotRef.current);
    battle.current.setAimDelta(aimDeltaRef.current);
    return () => {
      battle.current?.destroy();
      battle.current = null;
      // The mounted scene keeps its own copy of the state; the page pushes updates below.
    };
    // Mounted once per match, not once per state: a remount would restart Phaser and drop the callbacks above, so the
    // dep list is deliberately `Boolean(state)` and the slot.
  }, [Boolean(state), plan?.localSlot, commit]);
}
