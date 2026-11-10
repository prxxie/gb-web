/**
 * The trajectory aid's per-device preference (`US-MATCH-005` AC2).
 *
 * The scene keeps the aid off until the player asks for it, and the answer survives a reload: re-learning an arc
 * every session is not the point of a training wheel.
 */

const AIM_AID_KEY = "gb.aimAid";

export function readAimAid(): boolean {
  try {
    return window.localStorage.getItem(AIM_AID_KEY) === "1";
  } catch {
    // Private mode throws on `localStorage`: the aid is a preference, not a feature.
    return false;
  }
}

export function writeAimAid(enabled: boolean): void {
  try {
    window.localStorage.setItem(AIM_AID_KEY, enabled ? "1" : "0");
  } catch {
    // Private mode: the toggle still works for this match.
  }
}
