/**
 * Wire frames the match screen builds (`docs/02-reference/api/signaling.md` § 9).
 *
 * The type is the engine's, not a copy: `ClientFrame` accepts exactly `{ t: "item", id }`, and the
 * Worker's `parseClientFrame` rejects any extra key (`packages/core/src/protocol.ts`), so a rename
 * here breaks the build instead of sending a frame that gets dropped in silence.
 */
import type { ClientFrame } from "@gbw/core";

export type ItemFrame = Extract<ClientFrame, { t: "item" }>;

export function itemFrame(itemId: string): ItemFrame {
  return { t: "item", id: itemId };
}
