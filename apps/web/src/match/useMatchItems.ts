/**
 * The loadout wheel (`US-MATCH-005` AC5).
 *
 * What the wheel fans out is the six slots the bar used to print, in a stable order so an arc never reshuffles. An item
 * goes out once and only on this player's turn; the engine still re-checks the quantity, so a double tap cannot spend
 * two.
 */
import { useCallback } from "react";
import { ITEMS_BY_ID, applyInput, isItemId, toSnapshot, type PlayerState } from "@gbw/core";
import type { EquippedItem } from "../components/ItemWheel";
import type { PlannedMatch } from "../lib/plan";
import { itemFrame } from "../net/frames";
import type { CommitState, MatchWiring } from "./wiring";

export interface MatchItemsOptions {
  readonly plan: PlannedMatch | null;
  readonly localPlayer: PlayerState | null;
  readonly commit: CommitState;
  readonly wiring: MatchWiring;
}

export interface MatchItems {
  readonly equipped: readonly EquippedItem[];
  readonly useItem: (itemId: string) => void;
}

export function useMatchItems(options: MatchItemsOptions): MatchItems {
  const { plan, localPlayer, commit, wiring } = options;
  const { mesh, socket, seq, stateRef, hostGeneration } = wiring;

  const equipped: readonly EquippedItem[] = Object.entries(localPlayer?.items ?? {}).map(([id, qty]) => ({
    id,
    qty,
    delay: ITEMS_BY_ID.get(id)?.delayCost ?? 0,
    name: ITEMS_BY_ID.get(id)?.name ?? id,
  }));

  // Items go out once, and only on this player's turn (`US-MATCH-005` AC5).
  const useItem = useCallback(
    (itemId: string) => {
      const current = stateRef.current;
      if (!current || !plan || current.turn.activeSlot !== plan.localSlot || !isItemId(itemId)) return;
      const result = applyInput(current, { kind: "item", slot: plan.localSlot, itemId, seq: seq.current++ }, Date.now());
      commit(result.state, result.events);
      mesh.current?.broadcast(toSnapshot(result.state, hostGeneration.current));
      socket.current?.send(itemFrame(itemId));
    },
    [plan, commit, mesh, socket, seq, stateRef, hostGeneration],
  );

  return { equipped, useItem };
}
