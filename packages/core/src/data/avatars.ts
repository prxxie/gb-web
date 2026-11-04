import { clamp } from "../tuning.js";

/**
 * Avatar bonuses (`tunables.md` § 7): cosmetic-first, capped, never able to exceed the balance band.
 *
 * The server validates the equipped set at loadout time (`TC-AUTH-104`); the engine only folds the
 * resulting bonus into the match, so a tampered client cannot grant itself a bigger one than the cap.
 */
export type AvatarSlot = "head" | "body" | "weapon" | "accessory";
export type AvatarStat = "attack" | "defense" | "energy" | "delay";

export interface AvatarPart {
  readonly partId: string;
  readonly slot: AvatarSlot;
  readonly stat: AvatarStat;
  /** `+2 … +8` (`tunables.md` § 7). */
  readonly bonus: number;
}

export const AVATAR_PARTS: readonly AvatarPart[] = [
  { partId: "av-head-01", slot: "head", stat: "attack", bonus: 4 },
  { partId: "av-head-02", slot: "head", stat: "defense", bonus: 4 },
  { partId: "av-head-03", slot: "head", stat: "energy", bonus: 3 },
  { partId: "av-head-04", slot: "head", stat: "delay", bonus: 2 },
  { partId: "av-body-01", slot: "body", stat: "defense", bonus: 6 },
  { partId: "av-body-02", slot: "body", stat: "attack", bonus: 5 },
  { partId: "av-body-03", slot: "body", stat: "energy", bonus: 5 },
  { partId: "av-body-04", slot: "body", stat: "delay", bonus: 4 },
  { partId: "av-weapon-01", slot: "weapon", stat: "attack", bonus: 8 },
  { partId: "av-weapon-02", slot: "weapon", stat: "defense", bonus: 7 },
  { partId: "av-weapon-03", slot: "weapon", stat: "energy", bonus: 6 },
  { partId: "av-weapon-04", slot: "weapon", stat: "delay", bonus: 5 },
  { partId: "av-acc-01", slot: "accessory", stat: "delay", bonus: 8 },
  { partId: "av-acc-02", slot: "accessory", stat: "attack", bonus: 3 },
  { partId: "av-acc-03", slot: "accessory", stat: "defense", bonus: 3 },
  { partId: "av-acc-04", slot: "accessory", stat: "energy", bonus: 2 },
];

export const AVATAR_PARTS_BY_ID: ReadonlyMap<string, AvatarPart> = new Map(
  AVATAR_PARTS.map((part) => [part.partId, part]),
);

export interface AvatarBonus {
  readonly attack: number;
  readonly defense: number;
  readonly energy: number;
  readonly delay: number;
}

/** Hard caps: one part per slot, `+10 %` attack/defense, `+12` energy, `−8` delay. */
export const AVATAR_CAPS: AvatarBonus = { attack: 10, defense: 10, energy: 12, delay: 8 };

export function emptyBonus(): AvatarBonus {
  return { attack: 0, defense: 0, energy: 0, delay: 0 };
}

/**
 * Fold a set of parts into one bonus. Unknown ids are ignored, duplicate slots keep the first part,
 * and every stat is clamped to its cap — the same function runs in the worker at loadout time and in
 * the client when it previews the build.
 */
export function avatarBonus(partIds: readonly string[]): AvatarBonus {
  const usedSlots = new Set<AvatarSlot>();
  const bonus = { attack: 0, defense: 0, energy: 0, delay: 0 };
  for (const partId of partIds) {
    const part = AVATAR_PARTS_BY_ID.get(partId);
    if (!part || usedSlots.has(part.slot)) continue;
    usedSlots.add(part.slot);
    bonus[part.stat] += part.bonus;
  }
  return {
    attack: clamp(bonus.attack, 0, AVATAR_CAPS.attack),
    defense: clamp(bonus.defense, 0, AVATAR_CAPS.defense),
    energy: clamp(bonus.energy, 0, AVATAR_CAPS.energy),
    delay: clamp(bonus.delay, 0, AVATAR_CAPS.delay),
  };
}

/** Multipliers the engine applies: `1.0` when nothing is equipped. */
export function bonusMultipliers(bonus: AvatarBonus): { attack: number; defense: number; energy: number; delay: number } {
  return {
    attack: 1 + bonus.attack / 100,
    defense: 1 + bonus.defense / 100,
    energy: 1 + bonus.energy / 100,
    delay: 1 - bonus.delay / 100,
  };
}
