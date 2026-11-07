/**
 * What a peer puts on the wire (`US-NET-002`).
 *
 * A peer does not simulate: it sends the input it would have applied and waits for the host's snapshot. That is the
 * whole point of the star — one simulation, seven clients rendering it (`ADR-0004`, `OQ-32`: no prediction, no
 * rollback, so the shot appears when the host's answer arrives, one round trip later).
 */
import {
  decodeSnapshot,
  encodeBytes,
  encodeSnapshot,
  expandWire,
  type Snapshot,
  type WireSnapshot,
} from "@gbw/core";

/** `docs/02-reference/api/signaling.md` § Control channel messages. */
export interface InputFrame {
  readonly t: "input";
  readonly turn: number;
  readonly seq: number;
  readonly kind: "fire" | "skip";
  readonly angle?: number;
  readonly force?: number;
  readonly facing?: 1 | -1;
  /**
   * Which of the mobile's weapons fired. `signaling.md` did not list it, which made a peer's super shot land as the
   * primary one; it is part of the frame now (`US-MATCH-005` AC2 online).
   */
  readonly weaponSlot?: 0 | 1 | 2;
}

export interface InputSource {
  readonly kind: "fire" | "skip";
  readonly angle?: number | undefined;
  readonly force?: number | undefined;
  readonly facing?: 1 | -1 | undefined;
  readonly weaponSlot?: 0 | 1 | 2 | undefined;
}

export function inputFrameOf(input: InputSource, turn: number, seq: number): InputFrame {
  return {
    t: "input",
    turn,
    seq,
    kind: input.kind,
    ...(input.angle === undefined ? {} : { angle: input.angle }),
    ...(input.force === undefined ? {} : { force: input.force }),
    ...(input.facing === undefined ? {} : { facing: input.facing }),
    ...(input.weaponSlot === undefined ? {} : { weaponSlot: input.weaponSlot }),
  };
}

/**
 * AC4 — an input older than the last one applied for that turn is dropped silently. A reliable channel still
 * guarantees delivery, not that only one attempt was made: a player can fire twice before the first answer lands.
 */
export function isStaleInput(frame: InputFrame, lastSeqForTurn: number | undefined): boolean {
  return lastSeqForTurn !== undefined && frame.seq <= lastSeqForTurn;
}

/** AC2 — 10 Hz while a turn is running, 2 Hz once the match has ended. */
export const SNAPSHOT_HZ_ACTIVE = 10;
export const SNAPSHOT_HZ_IDLE = 2;

export function snapshotHz(status: string): number {
  return status === "playing" ? SNAPSHOT_HZ_ACTIVE : SNAPSHOT_HZ_IDLE;
}

export function snapshotIntervalMs(status: string): number {
  return 1000 / snapshotHz(status);
}

/**
 * AC6 — a peer that has heard nothing for two seconds shows the reconnect overlay. The replay itself is the socket's
 * job: a returning client receives `snapshot_state` from the DO (`api/signaling.md` § Room socket — DO → client,
 * `US-ROOM-004` AC2), so no extra request frame is invented here.
 */
export const SNAPSHOT_WATCHDOG_MS = 2_000;

/** AC5 — above this the next snapshot is dropped rather than queued; the following one supersedes it. */
export const SNAPSHOT_BUFFER_LIMIT = 64 * 1024;

/** AC7 — a snapshot that leaves the host. */
export const SNAPSHOT_BUDGET_BYTES = 800;

/**
 * AC7/the `state` channel's budget. Two things happen here: the terrain mask is dropped (kilobytes of run-length
 * pairs travel with the shot's socket push instead) and the players are packed into one number array each, which is
 * the `WireSnapshot` encoding `packages/core` has shipped since `US-CORE-004` — it was simply never used on this path,
 * so eight players weighed 1319 B of named fields.
 */
export function wireSnapshot(snapshot: Snapshot): string {
  const { terrain: _terrain, ...rest } = snapshot as Snapshot & { readonly terrain?: unknown };
  return encodeSnapshot(rest as Snapshot);
}

/**
 * The same packing for a frame that is sent as an object rather than a channel string: the per-turn `snapshot_push`
 * to the Durable Object, which expands it back into a `Snapshot` before it stores the replay (`parseSnapshot`).
 */
export function toPackedSnapshot(snapshot: Snapshot): WireSnapshot {
  const { terrain: _terrain, ...rest } = snapshot as Snapshot & { readonly terrain?: unknown };
  return JSON.parse(encodeSnapshot(rest as Snapshot)) as WireSnapshot;
}

/** {@link readSnapshot} for a frame that arrived as an object rather than a channel string. */
export function unpackSnapshot(value: Snapshot | WireSnapshot): Snapshot {
  return isWire(value) ? expandWire(value) : value;
}

/** The receiving end of {@link wireSnapshot}: packed snapshots are expanded, anything older is read as it came. */
export function readSnapshot(text: string): Snapshot {
  const parsed = JSON.parse(text) as unknown;
  if (isWire(parsed)) return decodeSnapshot(text);
  return parsed as Snapshot;
}

function isWire(value: unknown): value is WireSnapshot {
  const candidate = value as WireSnapshot;
  return typeof candidate?.s === "number" && typeof candidate?.g === "number" && Array.isArray(candidate.p);
}

export function withinSnapshotBudget(payload: string): boolean {
  return encodeBytes(payload) <= SNAPSHOT_BUDGET_BYTES;
}
