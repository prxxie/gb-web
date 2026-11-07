import type { PlayerSnapshot, ProjectileSnapshot, Snapshot } from "./types.js";
import { deserializeTerrain, serializeTerrain, type Terrain } from "./terrain.js";
import { TUNABLES, roundTo } from "./tuning.js";
import type { MatchState, ScoreState } from "./types.js";

/**
 * Compact wire snapshot.
 *
 * Keys are one or two characters because this travels 10–20 times a second over an
 * unreliable channel; `snapshotBytes` enforces the budget the docs promise.
 */
export interface WireSnapshot {
  readonly s: number; // seq
  readonly g: number; // hostGeneration
  readonly t: readonly [number, number, number, number]; // number, activeSlot, deadlineAt, round
  readonly w: readonly [number, number]; // wind magnitude, sector
  readonly p: readonly (readonly number[])[]; // slot,hp,shield,energy,x,y,facing,delay,eliminated,weaponSlot
  readonly j: readonly number[]; // jewel x,y,carriedBy triples
  readonly sc: readonly [number, number]; // team scores
  readonly st: string; // status
  readonly m?: string; // terrain RLE, only after a carve
  readonly wt: string | null; // winner team
  readonly v?: string; // rulesetVersion, so a peer can refuse to rank across a version change
  readonly at?: "A" | "B"; // the tag flag: which team is acting. Omitted when it is A
}

export interface SnapshotOptions {
  /** Current weapon slot per player, when the caller tracks the aim UI state. */
  readonly weaponSlots?: Readonly<Record<number, 0 | 1 | 2>>;
  /** Include the terrain mask. The host sets this on the snapshot that follows a carve, not on every one. */
  readonly includeTerrain?: boolean;
}

export function toSnapshot(
  state: MatchState,
  hostGeneration: number,
  options: SnapshotOptions = {},
): Snapshot {
  return {
    seq: state.seq,
    hostGeneration,
    turn: { ...state.turn, actedSlots: [...state.turn.actedSlots] },
    weather: { wind: { ...state.weather.wind }, rolledAtRound: state.weather.rolledAtRound },
    players: state.players.map(
      (player): PlayerSnapshot => ({
        slot: player.slot,
        hp: player.hp,
        shield: player.shield,
        energy: player.energy,
        x: player.x,
        y: player.y,
        facing: player.facing,
        delay: player.delay,
        eliminated: player.eliminated,
        // The slot is the last one this seat fired with, not a property of the player: the host passes the
        // map it tracks from accepted inputs (`options.weaponSlots`), and 0 is the honest default.
        weaponSlot: options.weaponSlots?.[player.slot] ?? 0,
      }),
    ),
    projectiles: state.projectiles.map(
      (projectile): ProjectileSnapshot => ({
        id: projectile.id,
        ownerSlot: projectile.ownerSlot,
        x: projectile.x,
        y: projectile.y,
        shotClass: projectile.shotClass,
      }),
    ),
    ...(options.includeTerrain ? { terrain: serializeTerrain(heightsAsTerrain(state)) } : {}),
    scores: {
      score: { A: state.scores.score.A, B: state.scores.score.B },
      activeTeam: state.scores.activeTeam,
      jewels: state.scores.jewels.map((jewel) => ({ ...jewel })),
    },
    status: state.status,
    winnerTeam: state.winnerTeam,
    rulesetVersion: state.rulesetVersion,
  };
}

export function toWire(state: MatchState, hostGeneration: number, options: SnapshotOptions = {}): WireSnapshot {
  const snapshot = toSnapshot(state, hostGeneration, options);
  return {
    s: snapshot.seq,
    g: snapshot.hostGeneration,
    t: [snapshot.turn.number, snapshot.turn.activeSlot, snapshot.turn.deadlineAt, snapshot.turn.round],
    w: [snapshot.weather.wind.magnitude, snapshot.weather.wind.sector],
    p: snapshot.players.map((player) => [
      player.slot,
      player.hp,
      player.shield,
      player.energy,
      player.x,
      player.y,
      player.facing,
      player.delay,
      player.eliminated ? 1 : 0,
      options.weaponSlots?.[player.slot] ?? player.weaponSlot,
    ]),
    j: snapshot.scores.jewels.flatMap((jewel) => [jewel.x, jewel.y, jewel.carriedBy ?? -1]),
    sc: [snapshot.scores.score.A, snapshot.scores.score.B],
    st: snapshot.status,
    ...(snapshot.terrain === undefined ? {} : { m: snapshot.terrain }),
    wt: snapshot.winnerTeam,
    ...(snapshot.scores.activeTeam === "A" ? {} : { at: snapshot.scores.activeTeam }),
    ...(snapshot.rulesetVersion === undefined ? {} : { v: snapshot.rulesetVersion }),
  };
}

export function encodeSnapshot(snapshot: Snapshot | WireSnapshot): string {
  if (isWire(snapshot)) {
    return JSON.stringify(snapshot);
  }
  const state = snapshot as Snapshot;
  const wire: WireSnapshot = {
    s: state.seq,
    g: state.hostGeneration,
    t: [state.turn.number, state.turn.activeSlot, state.turn.deadlineAt, state.turn.round],
    w: [state.weather.wind.magnitude, state.weather.wind.sector],
    p: state.players.map((player) => [
      player.slot,
      player.hp,
      player.shield,
      player.energy,
      player.x,
      player.y,
      player.facing,
      player.delay,
      player.eliminated ? 1 : 0,
      player.weaponSlot,
    ]),
    ...(state.terrain === undefined ? {} : { m: state.terrain }),
    j: state.scores.jewels.flatMap((jewel) => [jewel.x, jewel.y, jewel.carriedBy ?? -1]),
    sc: [state.scores.score.A, state.scores.score.B],
    st: state.status,
    wt: state.winnerTeam,
    ...(state.scores.activeTeam === "A" ? {} : { at: state.scores.activeTeam }),
    ...(state.rulesetVersion === undefined ? {} : { v: state.rulesetVersion }),
  };
  return JSON.stringify(wire);
}

function isWire(value: Snapshot | WireSnapshot): value is WireSnapshot {
  return typeof (value as WireSnapshot).s === "number" && Array.isArray((value as WireSnapshot).p);
}

/** The packed form as a value, for a frame that is sent as JSON rather than a channel string. */
export function packSnapshot(snapshot: Snapshot): WireSnapshot {
  if (isWireSnapshot(snapshot)) return snapshot;
  return JSON.parse(encodeSnapshot(snapshot)) as WireSnapshot;
}

/** UTF-8 byte length without depending on the DOM `TextEncoder` (core has no DOM lib). */
export function encodeBytes(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/** Throws when a snapshot would exceed the documented hard limit; the caller drops it instead. */
export function assertSnapshotSize(text: string): void {
  const bytes = encodeBytes(text);
  if (bytes > TUNABLES.snapshotHardLimitBytes) {
    throw new Error(`snapshot-too-large: ${bytes} > ${TUNABLES.snapshotHardLimitBytes}`);
  }
}

export function decodeSnapshot(text: string): Snapshot {
  const wire = JSON.parse(text) as WireSnapshot;
  if (!isWireSnapshot(wire)) {
    throw new Error("malformed-snapshot");
  }
  return expandWire(wire);
}

/**
 * True for the packed form. `parseSnapshot` uses it to accept a `snapshot_push` that arrives packed, so a peer can
 * send the small message and the DO still stores an ordinary `Snapshot` for the rejoin replay.
 */
export function isWireSnapshot(value: unknown): value is WireSnapshot {
  const candidate = value as WireSnapshot;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.s === "number" &&
    typeof candidate.g === "number" &&
    Array.isArray(candidate.p)
  );
}

/** The packed form back into the object the rest of the code reads (`decodeSnapshot` without the JSON step). */
export function expandWire(wire: WireSnapshot): Snapshot {
  return {
    seq: wire.s,
    hostGeneration: wire.g,
    turn: {
      number: wire.t[0] ?? 0,
      activeSlot: wire.t[1] ?? 0,
      deadlineAt: wire.t[2] ?? 0,
      round: wire.t[3] ?? 1,
      extended: false,
      actedSlots: [],
    },
    weather: {
      wind: { magnitude: wire.w[0] ?? 0, sector: wire.w[1] ?? 0, directionDeg: (wire.w[1] ?? 0) * 30 },
      rolledAtRound: wire.t[3] ?? 1,
    },
    players: wire.p.map((row) => ({
      slot: row[0] ?? 0,
      hp: row[1] ?? 0,
      shield: row[2] ?? 0,
      energy: row[3] ?? 0,
      x: row[4] ?? 0,
      y: row[5] ?? 0,
      facing: (row[6] ?? 1) >= 0 ? 1 : -1,
      delay: row[7] ?? 0,
      eliminated: (row[8] ?? 0) === 1,
      weaponSlot: ((row[9] ?? 0) as 0 | 1 | 2),
    })),
    projectiles: [],
    scores: {
      score: { A: wire.sc[0] ?? 0, B: wire.sc[1] ?? 0 },
      activeTeam: wire.at === "B" ? "B" : "A",
      jewels: chunkJewels(wire.j ?? []),
    },
    status: (wire.st as Snapshot["status"]) ?? "playing",
    ...(wire.m === undefined ? {} : { terrain: wire.m }),
    winnerTeam: (wire.wt as Snapshot["winnerTeam"]) ?? null,
    ...(wire.v === undefined ? {} : { rulesetVersion: wire.v }),
  };
}

function chunkJewels(flat: readonly number[]): Snapshot["scores"]["jewels"] {
  const jewels: Snapshot["scores"]["jewels"][number][] = [];
  for (let i = 0; i + 2 < flat.length; i += 3) {
    const carried = flat[i + 2] ?? -1;
    jewels.push({
      id: jewels.length + 1,
      x: flat[i] ?? 0,
      y: flat[i + 1] ?? 0,
      carriedBy: carried >= 0 ? carried : null,
    });
  }
  return jewels;
}

/**
 * Accept a snapshot only if it comes from the current host generation and is newer than
 * what we already applied — this is what stops a stale message from rewinding the match.
 */
export function acceptSnapshot(
  currentGeneration: number,
  currentSeq: number,
  snapshot: Snapshot,
): boolean {
  if (snapshot.hostGeneration !== currentGeneration) return false;
  return snapshot.seq > currentSeq;
}

export interface ApplyResult {
  readonly players: MatchState["players"];
  readonly seq: number;
  readonly changed: boolean;
  /** Team scores, the tag flag and the jewels, so a peer's result and jewel HUD match the host's. */
  readonly scores: ScoreState;
  /** The ruleset the host played under, when the snapshot carried one. */
  readonly rulesetVersion?: string;
  /** The decoded mask as match state stores it (heights), present only when the snapshot carried one. */
  readonly terrain?: readonly number[];
}

export function applySnapshot(state: MatchState, snapshot: Snapshot): ApplyResult {
  const players = state.players.map((player) => {
    const remote = snapshot.players.find((candidate) => candidate.slot === player.slot);
    if (!remote) return player;
    return {
      ...player,
      hp: remote.hp,
      shield: remote.shield,
      energy: remote.energy,
      x: roundTo(remote.x),
      y: roundTo(remote.y),
      facing: remote.facing,
      delay: remote.delay,
      eliminated: remote.eliminated,
    };
  });
  const terrain =
    snapshot.terrain === undefined ? undefined : Array.from(deserializeTerrain(state.mapId, snapshot.terrain).heights);
  return {
    players,
    seq: snapshot.seq,
    changed: true,
    scores: snapshot.scores,
    ...(terrain ? { terrain } : {}),
    ...(snapshot.rulesetVersion === undefined ? {} : { rulesetVersion: snapshot.rulesetVersion }),
  };
}

/** Size of a snapshot for the current state, in bytes — used by tests and the budget check. */
/** `MatchState` keeps the mask as plain heights; the RLE works on a `Terrain`. */
function heightsAsTerrain(state: MatchState): Terrain {
  return { step: state.terrainStep, heights: Float64Array.from(state.terrain), width: TUNABLES.mapWidth };
}

export function snapshotBytes(state: MatchState, hostGeneration: number, options: SnapshotOptions = {}): number {
  return encodeBytes(encodeSnapshot(toSnapshot(state, hostGeneration, options)));
}
