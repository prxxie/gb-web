import type { Archetype, Effect, Mobile, ShotClass, TrajectoryProfile, Weapon } from "../types.js";

/** One row of `docs/02-reference/data/mobiles.md` § 1–§ 3, in the order the docs print them. */
type Row = readonly [
  mobileId: string,
  name: string,
  archetype: Archetype,
  trajectory: TrajectoryProfile,
  angleMin: number,
  angleMax: number,
  maxHp: number,
  maxShield: number,
  shieldRegen: number,
  defense: number,
  energy: number,
  baseDelay: number,
  maxPower: number,
  moveDistance: number,
  maxMovesPerTurn: number,
  runMultiplier: number,
  moveEnergy: number,
  moveDelay: number,
  maxIncline: number,
  effect: Effect,
  shot1: readonly [ShotClass, number, number, number],
  shot2: readonly [ShotClass, number, number, number],
  superShot: readonly [ShotClass, number, number, number],
];

const CLASS_LABEL: Record<ShotClass, string> = {
  arc: "Arc",
  flat: "Flat",
  lob: "Lob",
  bounce: "Bounce",
  cluster: "Cluster",
  piercing: "Piercing",
  beam: "Beam",
};

const ROWS: readonly Row[] = [
  ["mbl-01", "Stone Sentinel", "balanced", "standard", -10, 45, 1050, 150, 20, 1.0, 105, 100, 98, 88, 1, 1.5, 12, 12, 35, "explosion", ["arc", 240, 80, 100], ["flat", 220, 70, 110], ["arc", 500, 110, 200]],
  ["mbl-02", "River Warden", "support", "lobber", 38, 82, 1000, 300, 40, 0.9, 100, 110, 94, 85, 2, 1.7, 9, 10, 32, "impact", ["arc", 220, 85, 100], ["lob", 210, 95, 115], ["cluster", 460, 120, 200]],
  ["mbl-03", "Iron Tortoise", "tank", "skimmer", -8, 38, 1200, 200, 20, 1.15, 80, 120, 92, 60, 1, 1.5, 14, 14, 25, "explosion", ["arc", 250, 90, 105], ["bounce", 240, 80, 120], ["arc", 520, 120, 200]],
  ["mbl-04", "Glacier Mammoth", "tank", "lobber", 30, 88, 1150, 250, 30, 1.12, 85, 118, 90, 65, 1, 1.6, 12, 13, 22, "impact", ["lob", 250, 95, 112], ["bounce", 230, 82, 118], ["arc", 510, 118, 200]],
  ["mbl-05", "Storm Falcon", "sniper", "direct", -20, 25, 925, 0, 0, 0.9, 120, 95, 100, 100, 2, 1.7, 10, 9, 40, "laser", ["flat", 260, 60, 100], ["piercing", 280, 55, 115], ["beam", 480, 40, 200]],
  ["mbl-06", "Silver Ibex", "sniper", "direct", -15, 30, 950, 50, 0, 0.92, 125, 93, 100, 105, 2, 1.8, 9, 9, 42, "laser", ["flat", 250, 58, 98], ["arc", 270, 65, 112], ["beam", 490, 42, 198]],
  ["mbl-07", "Ash Behemoth", "bombardier", "mortar", 45, 88, 1100, 100, 0, 1.0, 90, 115, 96, 70, 1, 1.5, 13, 13, 30, "explosion", ["lob", 260, 100, 110], ["cluster", 240, 90, 120], ["lob", 550, 130, 200]],
  ["mbl-08", "Volcano Toad", "bombardier", "mortar", 40, 85, 1075, 150, 10, 0.98, 88, 113, 95, 72, 1, 1.6, 12, 12, 28, "explosion", ["lob", 250, 98, 112], ["bounce", 230, 85, 122], ["cluster", 540, 128, 200]],
  ["mbl-09", "Moon Hare", "bouncer", "skimmer", -5, 45, 975, 100, 10, 0.95, 115, 105, 98, 95, 2, 1.8, 8, 9, 38, "impact", ["bounce", 240, 80, 100], ["flat", 220, 65, 110], ["bounce", 500, 110, 200]],
  ["mbl-10", "Coral Crab", "bouncer", "skimmer", 0, 42, 990, 120, 10, 0.96, 112, 103, 97, 92, 2, 1.6, 9, 10, 36, "laser", ["bounce", 230, 78, 102], ["arc", 220, 70, 112], ["beam", 470, 45, 198]],
  ["mbl-11", "Pale Stag", "all-rounder", "standard", -12, 42, 1020, 280, 40, 0.92, 102, 108, 94, 86, 2, 1.7, 9, 10, 33, "impact", ["arc", 230, 85, 100], ["flat", 200, 70, 110], ["cluster", 460, 120, 200]],
  ["mbl-12", "Sacred Crane", "support", "standard", -8, 48, 980, 260, 30, 0.9, 104, 106, 95, 88, 2, 1.7, 10, 10, 34, "laser", ["arc", 210, 82, 102], ["beam", 260, 40, 120], ["cluster", 450, 118, 200]],
  ["mbl-13", "Cinder Fox", "glass", "direct", -18, 28, 900, 0, 0, 0.85, 130, 90, 100, 110, 2, 1.9, 8, 8, 42, "explosion", ["flat", 300, 60, 95], ["arc", 280, 70, 110], ["arc", 580, 90, 195]],
  ["mbl-14", "Sky Serpent", "glass", "direct", -16, 32, 920, 0, 0, 0.86, 128, 92, 100, 108, 2, 1.9, 8, 8, 44, "laser", ["flat", 290, 58, 96], ["cluster", 270, 85, 118], ["beam", 560, 44, 196]],
  ["mbl-15", "Jade Dragon", "balanced", "standard", -10, 50, 1050, 150, 20, 1.05, 105, 100, 98, 88, 2, 1.7, 10, 10, 35, "explosion", ["arc", 250, 80, 100], ["piercing", 270, 60, 118], ["arc", 510, 115, 200]],
  ["mbl-16", "Sun Lion", "all-rounder", "standard", -6, 46, 1060, 180, 20, 1.06, 103, 101, 97, 90, 2, 1.7, 10, 11, 34, "explosion", ["arc", 250, 82, 100], ["bounce", 230, 78, 116], ["cluster", 500, 122, 200]],
  ["mbl-17", "Sand Wyrm", "zoner", "mortar", 48, 88, 1025, 150, 10, 1.0, 100, 110, 95, 80, 1, 1.6, 12, 12, 33, "impact", ["lob", 240, 95, 108], ["piercing", 260, 60, 120], ["cluster", 500, 125, 200]],
  ["mbl-18", "Frost Hydra", "zoner", "mortar", 42, 86, 1040, 120, 10, 1.02, 98, 112, 96, 78, 1, 1.6, 12, 13, 31, "impact", ["lob", 240, 96, 110], ["arc", 250, 80, 112], ["lob", 530, 130, 200]],
  ["mbl-19", "Shadow Cat", "trickster", "skimmer", -8, 44, 950, 100, 10, 0.95, 125, 95, 96, 105, 2, 1.8, 8, 9, 40, "electric", ["bounce", 230, 70, 98], ["cluster", 220, 85, 116], ["arc", 460, 100, 195]],
  ["mbl-20", "Mist Raven", "trickster", "direct", -20, 35, 940, 80, 10, 0.94, 128, 93, 95, 108, 2, 1.8, 8, 9, 41, "electric", ["bounce", 220, 70, 98], ["beam", 250, 42, 118], ["beam", 450, 38, 196]],
];

const ROMAN = ["I", "II", "Super"] as const;

function weapon(
  mobileId: string,
  index: 0 | 1 | 2,
  spec: readonly [ShotClass, number, number, number],
): Weapon {
  const [shotClass, power, radius, delay] = spec;
  return {
    id: `${mobileId}-s${index + 1}`,
    name: `${CLASS_LABEL[shotClass]} ${ROMAN[index]}`,
    shotClass,
    power,
    radius,
    delay,
  };
}

export const MOBILES: readonly Mobile[] = ROWS.map((row) => {
  const [
    mobileId, name, archetype, trajectory, angleMin, angleMax,
    maxHp, maxShield, shieldRegen, defense, energy, baseDelay, maxPower,
    moveDistance, maxMovesPerTurn, runMultiplier, moveEnergy, moveDelay, maxIncline,
    effect, s1, s2, s3,
  ] = row;
  return {
    mobileId,
    name,
    archetype,
    trajectory,
    angleMin,
    angleMax,
    maxHp,
    maxShield,
    shieldRegen,
    defense,
    energy,
    baseDelay,
    maxPower,
    moveDistance,
    maxMovesPerTurn,
    runMultiplier,
    moveEnergy,
    moveDelay,
    maxIncline,
    effect,
    weapons: [weapon(mobileId, 0, s1), weapon(mobileId, 1, s2), weapon(mobileId, 2, s3)],
  };
});

export const MOBILES_BY_ID: ReadonlyMap<string, Mobile> = new Map(MOBILES.map((mobile) => [mobile.mobileId, mobile]));

export function getMobile(mobileId: string): Mobile {
  const mobile = MOBILES_BY_ID.get(mobileId);
  if (!mobile) throw new RangeError(`unknown mobile: ${mobileId}`);
  return mobile;
}

export const DEFAULT_MOBILE_ID = "mbl-01";

/**
 * A mobile id is a stat line the host imports, so only a shipped `mbl-NN` may enter the roster — checked by the
 * frame parser and by the Durable Object that stores the pick (`US-ROOM-007` AC7).
 */
export function isMobileId(value: string): boolean {
  return MOBILES_BY_ID.has(value);
}

/** Balance band used by `TC-CORE-923`: damage-per-delay spread across the roster. */
export function damagePerDelay(mobile: Mobile): number {
  // `mobiles.md` § 7: shot 1 power ÷ its own delay, so two mobiles compare on the same axis.
  return mobile.weapons[0].power / mobile.weapons[0].delay;
}
