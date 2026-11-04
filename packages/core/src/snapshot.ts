import type { PlayerSnapshot, ProjectileSnapshot, Snapshot } from "./types.js";
import { TUNABLES, roundTo } from "./tuning.js";
import type { MatchState } from "./types.js";

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
  readonly wt: string | null; // winner team
}

export interface SnapshotOptions {
  /** Current weapon slot per player, when the caller tracks the aim UI state. */
  readonly weaponSlots?: Readonly<Record<number, 0 | 1 | 2>>;
}

export function toSnapshot(state: MatchState, hostGeneration: number): Snapshot {
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
        weaponSlot: 0,
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
    scores: {
      score: { A: state.scores.score.A, B: state.scores.score.B },
      activeTeam: state.scores.activeTeam,
      jewels: state.scores.jewels.map((jewel) => ({ ...jewel })),
    },
    status: state.status,
    winnerTeam: state.winnerTeam,
  };
}

export function toWire(state: MatchState, hostGeneration: number, options: SnapshotOptions = {}): WireSnapshot {
  const snapshot = toSnapshot(state, hostGeneration);
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
      options.weaponSlots?.[player.slot] ?? 0,
    ]),
    j: snapshot.scores.jewels.flatMap((jewel) => [jewel.x, jewel.y, jewel.carriedBy ?? -1]),
    sc: [snapshot.scores.score.A, snapshot.scores.score.B],
    st: snapshot.status,
    wt: snapshot.winnerTeam,
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
      0,
    ]),
    j: state.scores.jewels.flatMap((jewel) => [jewel.x, jewel.y, jewel.carriedBy ?? -1]),
    sc: [state.scores.score.A, state.scores.score.B],
    st: state.status,
    wt: state.winnerTeam,
  };
  return JSON.stringify(wire);
}

function isWire(value: Snapshot | WireSnapshot): value is WireSnapshot {
  return typeof (value as WireSnapshot).s === "number" && Array.isArray((value as WireSnapshot).p);
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
  if (typeof wire.s !== "number" || typeof wire.g !== "number" || !Array.isArray(wire.p)) {
    throw new Error("malformed-snapshot");
  }
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
      activeTeam: "A",
      jewels: chunkJewels(wire.j ?? []),
    },
    status: (wire.st as Snapshot["status"]) ?? "playing",
    winnerTeam: (wire.wt as Snapshot["winnerTeam"]) ?? null,
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
  return { players, seq: snapshot.seq, changed: true };
}

/** Size of a snapshot for the current state, in bytes — used by tests and the budget check. */
export function snapshotBytes(state: MatchState, hostGeneration: number): number {
  return encodeBytes(encodeSnapshot(toSnapshot(state, hostGeneration)));
}
