/**
 * The weapon strip's selection and its lock (`US-MATCH-005` AC2/AC3).
 *
 * The selection is local state but the renderer callback is created once, so the ref is what the shot reads; the state
 * only drives the strip's `aria-pressed`. The lock is the turn the weapon was fired in: a second shot in the same turn
 * waits for the turn to resolve.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { BattleHandle } from "../game/scene";
import type { WeaponSlot } from "../components/WeaponStrip";

export interface MatchWeaponsOptions {
  /** The super-shot gauge, `0…100` (`US-MATCH-005` AC3). */
  readonly ssCharge: number;
  readonly battle: RefObject<BattleHandle | null>;
}

export interface MatchWeapons {
  readonly weaponSlot: WeaponSlot;
  readonly weaponSlotRef: RefObject<WeaponSlot>;
  readonly lockedTurn: number | null;
  readonly lockedTurnRef: RefObject<number | null>;
  readonly setLockedTurn: (turn: number) => void;
  readonly ssReady: boolean;
  readonly select: (slot: WeaponSlot) => void;
}

export function useWeaponSelect(options: MatchWeaponsOptions): MatchWeapons {
  const { ssCharge, battle } = options;
  const [weaponSlot, setWeaponSlot] = useState<WeaponSlot>(0);
  const weaponSlotRef = useRef<WeaponSlot>(0);
  // Turn number the weapon was fired in: the selection is locked until the turn changes (AC3).
  const [lockedTurn, setLockedTurn] = useState<number | null>(null);
  /** Mirrored for the mount-time closures: `onRelease` is created once and would read a stale state value. */
  const lockedTurnRef = useRef<number | null>(null);

  const select = useCallback(
    (slot: WeaponSlot) => {
      weaponSlotRef.current = slot;
      setWeaponSlot(slot);
      // The dotted arc is drawn by the scene, so the selection has to reach it (`US-MATCH-005` AC2).
      battle.current?.setWeaponSlot(slot);
    },
    [battle],
  );

  // The super shot is gated by its gauge, not by a once-per-match flag (`AC3`): when the gauge is not full the slot is
  // disabled and the aim aid must not keep pointing at it.
  const ssReady = ssCharge >= 100;
  useEffect(() => {
    if (weaponSlot === 2 && !ssReady) select(0);
  }, [weaponSlot, ssReady, select]);

  return { weaponSlot, weaponSlotRef, lockedTurn, lockedTurnRef, setLockedTurn, ssReady, select };
}
