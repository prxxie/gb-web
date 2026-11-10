/**
 * The HUD half of aiming (`US-MATCH-002`, `US-MATCH-003` AC11).
 *
 * Power, the angle the finger is pulling at, where the renderer last drew this client's mobile, and the loadout
 * wheel's anchor: the state the readouts and the ring print. The shot itself is decided in `game/aim.ts`; this hook
 * only holds the numbers the player is looking at while deciding it.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { getMobile, type MatchState } from "@gbw/core";
import { translate } from "../i18n";
import { useLocale } from "../app/providers";
import type { PlannedMatch } from "../lib/plan";
import { readAimAid } from "./aimAid";
import type { AimPoint } from "./wiring";

export interface MatchAimHud {
  readonly power: number;
  /** The angle the finger is currently pulling at (`US-MATCH-002` AC2). The pad only nudges it. */
  readonly pullAngle: number;
  /** Where the renderer last drew this client's mobile, in CSS pixels (`US-MATCH-003` AC11). */
  readonly focus: AimPoint | null;
  /** The item wheel: the scene opens it when a press is held on this client's own mobile (owner, 2026-11-09). */
  readonly itemWheelAt: AimPoint | null;
  readonly aimDelta: number;
  /** Mirrored for the mount-time closures: `onRelease` is created once and would read a stale state value. */
  readonly aimDeltaRef: RefObject<number>;
  /** The number the player aims with, clamped to the mobile's barrel window. */
  readonly aimAngle: number;
  /** The "drag to aim" hint, shown once per match (`US-MATCH-002` AC4). */
  readonly hint: string | null;
  readonly aimAid: boolean;
  readonly setPower: (power: number) => void;
  readonly setPullAngle: (angle: number) => void;
  readonly setFocus: (point: AimPoint | null) => void;
  readonly setAimDelta: Dispatch<SetStateAction<number>>;
  readonly setItemWheelAt: (point: AimPoint | null) => void;
  readonly closeItemWheel: () => void;
  /** A cancelled pull: drop the readout, and say how to aim the first time it happens. */
  readonly cancelPull: (reason: "deadzone" | "gesture" | "pointercancel") => void;
  readonly toggleAimAid: () => void;
}

export function useAimHud(plan: PlannedMatch | null, state: MatchState | null): MatchAimHud {
  const { locale } = useLocale();
  const [power, setPower] = useState(0);
  const [pullAngle, setPullAngle] = useState(45);
  const [focus, setFocus] = useState<AimPoint | null>(null);
  const [itemWheelAt, setItemWheelAt] = useState<AimPoint | null>(null);
  const [aimDelta, setAimDelta] = useState(0);
  const aimDeltaRef = useRef(0);
  const [hint, setHint] = useState<string | null>(null);
  const hintShown = useRef(false);
  const [aimAid, setAimAid] = useState(readAimAid);

  /** The mobile this client is driving, from the state when it exists and from the plan before that. */
  const aimMobile = useMemo(() => {
    const slot = plan?.localSlot ?? 0;
    const player = state?.players.find((candidate) => candidate.slot === slot);
    const seat = plan?.seats.find((candidate) => candidate.slot === slot);
    return getMobile(player?.mobileId ?? seat?.mobileId ?? "mbl-01");
  }, [plan, state]);
  // The number the player aims with: the pull's own angle (or the rest angle) plus the pad's nudge, clamped to the
  // mobile's barrel window — the same expression `shotAngle` applies to the shot itself.
  const aimAngle = Math.max(
    aimMobile.angleMin,
    Math.min(aimMobile.angleMax, Math.round((power > 0 ? pullAngle : 45) + aimDelta)),
  );

  // The hint says its piece once and goes away on its own (`US-MATCH-002` AC4).
  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(null), 2500);
    return () => window.clearTimeout(timer);
  }, [hint]);

  const cancelPull = useCallback(
    (reason: "deadzone" | "gesture" | "pointercancel") => {
      setPower(0);
      if (reason === "deadzone" && !hintShown.current) {
        hintShown.current = true;
        setHint(translate(locale, "match.hint.pull"));
      }
    },
    [locale],
  );

  const closeItemWheel = useCallback(() => setItemWheelAt(null), []);
  const toggleAimAid = useCallback(() => setAimAid((current) => !current), []);

  return {
    power,
    pullAngle,
    focus,
    itemWheelAt,
    aimDelta,
    aimDeltaRef,
    aimAngle,
    hint,
    aimAid,
    setPower,
    setPullAngle,
    setFocus,
    setAimDelta,
    setItemWheelAt,
    closeItemWheel,
    cancelPull,
    toggleAimAid,
  };
}
