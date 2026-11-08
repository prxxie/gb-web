import type { Item, ItemId } from "../types.js";

/**
 * The eleven battle items (`docs/02-reference/data/items.md`). Every item costs queue delay: using one
 * pushes you back in the turn order, which is what keeps item spam self-limiting without a cooldown.
 */
const ROWS: readonly (readonly [ItemId, string, number, string])[] = [
  ["itm-dual", "Dual", 600, "fire twice this turn (second shot uses the same weapon)"],
  ["itm-blood", "Blood", 0, "spend 8 % of your health for +33 % damage on this shot"],
  ["itm-energy-2", "Energy up 2", 300, "restore 25 % of your health"],
  ["itm-energy-1", "Energy up 1", 100, "restore 10 % of your health"],
  ["itm-dual-plus", "Dual+", 250, "fire twice, second shot +15 % power"],
  ["itm-change-wind", "Change Wind", 150, "reverse the wind: same strength, other way"],
  ["itm-team-teleport", "Team Teleport", 50, "swap places with the team mate on the lowest health"],
  ["itm-bunge", "Bunge shot", 50, "25 % more ground carved by this shot"],
  ["itm-power-up", "Power up", 150, "+33 % damage on this shot"],
  ["itm-thunder", "Thunder", 200, "lightning strikes a horizontal band at the aim point"],
  ["itm-teleport", "Teleport", 150, "move the caster up to 150 px, ignoring incline"],
];

export const ITEMS: readonly Item[] = ROWS.map(([itemId, name, delayCost, effect]) => ({
  itemId,
  name,
  delayCost,
  effect,
  combat: true,
}));

export const ITEMS_BY_ID: ReadonlyMap<string, Item> = new Map(ITEMS.map((item) => [item.itemId, item]));

export function isItemId(value: string): value is ItemId {
  return ITEMS_BY_ID.has(value);
}

/** Loadout rules (`items.md`): eleven items in total, nine per picker page. */
export const LOADOUT_CAP = 11;
export const LOADOUT_PAGE_SIZE = 9;

export function loadoutTotal(loadout: Readonly<Record<string, number>>): number {
  return Object.values(loadout).reduce((total, quantity) => total + quantity, 0);
}
