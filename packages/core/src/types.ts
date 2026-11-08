/**
 * Domain types for the GBW battle engine.
 *
 * Everything in `packages/core` is pure: no DOM, no Phaser, no network, no `Math.random()`
 * (`NFR-22`, `NFR-28`). The worker and the browser both import these types.
 */

export interface Vec2 {
  x: number;
  y: number;
}

/** Deterministic random source (`NFR-28`). */
export interface Rng {
  /** Next float in `[0, 1)`. */
  next(): number;
  /** Integer in `[min, max]`, both inclusive. */
  int(min: number, max: number): number;
  /** Float in `[min, max)`. */
  float(min: number, max: number): number;
  /** Current internal state, for snapshot/replay. */
  state(): number;
}

export type ShotClass = "arc" | "flat" | "lob" | "bounce" | "cluster" | "piercing" | "beam";

export type TrajectoryProfile = "standard" | "direct" | "lobber" | "mortar" | "skimmer";

export type Archetype =
  | "balanced"
  | "tank"
  | "sniper"
  | "bombardier"
  | "bouncer"
  | "support"
  | "glass"
  | "all-rounder"
  | "zoner"
  | "trickster";

export type Effect = "explosion" | "laser" | "impact" | "electric";

export interface Weapon {
  /** Wire/JSON id, e.g. `mbl-01-s1`. */
  readonly id: string;
  readonly name: string;
  readonly shotClass: ShotClass;
  /** Inner-tier damage before `defense` (`tunables.md` § 2). */
  readonly power: number;
  /** Blast radius in world units. */
  readonly radius: number;
  /** Turn-queue delay this shot adds. */
  readonly delay: number;
}

export interface Mobile {
  readonly mobileId: string;
  readonly name: string;
  readonly archetype: Archetype;
  readonly trajectory: TrajectoryProfile;
  readonly angleMin: number;
  readonly angleMax: number;
  readonly maxHp: number;
  readonly maxShield: number;
  /** Shield refilled at the start of this mobile's turn. */
  readonly shieldRegen: number;
  readonly defense: number;
  /** Match-long movement budget. */
  readonly energy: number;
  /** Starting weight in the turn queue. */
  readonly baseDelay: number;
  readonly maxPower: number;
  readonly moveDistance: number;
  readonly maxMovesPerTurn: number;
  readonly runMultiplier: number;
  readonly moveEnergy: number;
  readonly moveDelay: number;
  readonly maxIncline: number;
  /** Shot 1, shot 2, super shot. */
  readonly weapons: readonly [Weapon, Weapon, Weapon];
  readonly effect: Effect;
}

export type ItemId =
  | "itm-dual"
  | "itm-blood"
  | "itm-energy-2"
  | "itm-energy-1"
  | "itm-dual-plus"
  | "itm-change-wind"
  | "itm-team-teleport"
  | "itm-bunge"
  | "itm-power-up"
  | "itm-thunder"
  | "itm-teleport";

export interface Item {
  readonly itemId: ItemId;
  readonly name: string;
  readonly delayCost: number;
  /** Short description shown in the lobby picker. */
  readonly effect: string;
  /** True when the item has a combat effect (all eleven do). */
  readonly combat: boolean;
}

export type Gimmick = "force" | "gust" | "electric" | "wind" | "return" | "heal" | "fog" | "tornado";

export interface MapDef {
  readonly mapId: string;
  /** Localised display name; the room's locale picks one, so no map name is authored twice. */
  readonly name: { readonly vi: string; readonly en: string };
  /** Wind magnitude this map rolls into (`tunables.md` § 6); the global maximum unless a map narrows it. */
  readonly windRange: { readonly min: number; readonly max: number };
  /** The authored terrain, RLE over tenths — what the loader validates and a joiner can rebuild from. */
  readonly terrain: string;
  /** Multiplies every mobile's gravity (`tunables.md` § 1.2). */
  readonly gravityModifier: number;
  /** Terrain generator seed. */
  readonly seed: number;
  /** Gimmicks active on this map. */
  readonly gimmicks: readonly Gimmick[];
  /** Roster spawn points, slot-indexed; `null` = not a legal slot for this map. */
  readonly spawns: readonly (readonly [number, number] | null)[];
  /** Optional jewel spawn points (`jewel` mode). */
  readonly jewels: readonly (readonly [number, number])[];
}

export type ModeId = "solo" | "score" | "tag" | "jewel";

export interface Mode {
  readonly modeId: ModeId;
  readonly name: string;
  /** Turns per player before the score cap is checked (`score` mode). */
  readonly turnCap: number;
}

export type Team = "A" | "B";

/** Wind is horizontal: `directionDeg` is `sector * 180`, i.e. 0° east or 180° west (`OQ-41`). */
/**
 * GB's wind is a horizontal vector: a magnitude on `0…26` and one of two directions (`sector 0` = east, `1` = west,
 * `directionDeg 0` / `180`). There is no vertical wind in the genre — a shell does not hang because the wind blows up.
 */
export interface Wind {
  readonly magnitude: number;
  readonly directionDeg: number;
  readonly sector: number;
}

export interface Weather {
  readonly wind: Wind;
  readonly rolledAtRound: number;
}

export type ConnectionState = "connected" | "grace" | "disconnected";

export type RoomStatus = "lobby" | "playing" | "ended" | "abandoned";

export interface PlayerState {
  readonly slot: number;
  readonly accountId: string | null;
  readonly displayName: string;
  readonly mobileId: string;
  readonly team: Team;
  readonly x: number;
  readonly y: number;
  /** -1 = facing left, +1 = facing right. */
  readonly facing: -1 | 1;
  readonly hp: number;
  readonly shield: number;
  readonly energy: number;
  /** Accumulated queue weight. */
  readonly delay: number;
  readonly eliminated: boolean;
  /** Avatar attack multiplier, `1.0` when nothing is equipped (`tunables.md` § 7). */
  readonly attack: number;
  readonly damageDealt: number;
  readonly shotsFired: number;
  readonly hits: number;
  /**
   * The super-shot gauge, `0…100` (`US-CORE-007`).
   *
   * GB charges it from the fighting — damage dealt fills it faster than damage taken — and spends it on the SS, so a
   * player who trades hits gets another one. One-per-match was our invention and it made the SS a finisher instead of a
   * rhythm.
   */
  readonly ssCharge: number;
  /** Equipped item quantities, by item id. */
  readonly items: Readonly<Record<string, number>>;
}

export interface Projectile {
  readonly id: number;
  readonly ownerSlot: number;
  readonly weaponSlot: 0 | 1 | 2;
  readonly shotClass: ShotClass;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly ageMs: number;
  readonly bouncesLeft: number;
  readonly power: number;
  readonly radius: number;
  readonly piercing: boolean;
  /** Set for sub-projectiles of a cluster shot. */
  readonly parentId: number | null;
  /** `return` maps bounce an off-map shot back once with reduced power instead of despawning it. */
  readonly returned: boolean;
  /** `itm-blood` / `itm-power-up` modifiers already folded into `power`. */
  readonly blooded: boolean;
}

export interface Turn {
  readonly activeSlot: number;
  readonly number: number;
  /** Increments when the queue wraps — every player has acted once. */
  readonly round: number;
  readonly deadlineAt: number;
  /** One 20 s extension per turn (`tunables.md` § 1.2). */
  readonly extended: boolean;
  /** Slots that have already acted in this round; a round ends when every living slot is here. */
  readonly actedSlots: readonly number[];
}

export type InputKind = "fire" | "skip" | "emote" | "quick_phrase" | "move" | "item";

export interface FireInput {
  readonly kind: "fire";
  /** Slot of the sender; the host validates it against the turn. */
  readonly slot: number;
  readonly weaponSlot: 0 | 1 | 2;
  readonly angle: number;
  readonly force: number;
  /** Monotonic per sender; the host keeps the last value (`alias`, no rollback). */
  readonly seq: number;
}

export interface SkipInput {
  readonly kind: "skip";
  readonly slot: number;
  readonly seq: number;
}

export interface MoveInput {
  readonly kind: "move";
  readonly slot: number;
  /** `1` = right, `-1` = left. */
  readonly dir: -1 | 1;
  readonly run: boolean;
  readonly seq: number;
}

export interface ItemInput {
  readonly kind: "item";
  readonly slot: number;
  readonly itemId: ItemId;
  readonly seq: number;
}

export interface ChatInput {
  readonly kind: "quick_phrase" | "emote";
  readonly slot: number;
  readonly id: string;
  readonly seq: number;
}

export type MatchInput = FireInput | SkipInput | MoveInput | ItemInput | ChatInput;

export interface ScoreState {
  readonly score: Readonly<Record<Team, number>>;
  readonly activeTeam: Team;
  readonly jewels: readonly { readonly id: number; readonly x: number; readonly y: number; readonly carriedBy: number | null }[];
}

/** Per-turn bookkeeping that must survive a snapshot or a host change. */
export interface ActiveEffects {
  /** `itm-dual` / `itm-dual-plus`: shots still owed this turn. */
  readonly shotsLeft: number;
  /** The weapon the first of two Dual shots used; the second must follow it (`US-CORE-009` AC2). */
  readonly dualWeapon: 0 | 1 | 2 | null;
  readonly bloodNext: boolean;
  readonly powerUpNext: boolean;
  readonly dualPlusNext: boolean;
  readonly bungeNext: boolean;
  /** Move actions used in this turn (`maxMovesPerTurn` guard). */
  readonly movesThisTurn: number;
}

export interface MatchState {
  readonly matchId: string;
  readonly roomCode: string;
  readonly mode: ModeId;
  readonly mapId: string;
  readonly rulesetVersion: string;
  readonly seed: number;
  readonly rng: Rng;
  readonly players: readonly PlayerState[];
  readonly projectiles: readonly Projectile[];
  readonly turn: Turn;
  readonly weather: Weather;
  readonly effects: ActiveEffects;
  readonly scores: ScoreState;
  readonly terrain: readonly number[];
  /** Terrain sample spacing in world units. */
  readonly terrainStep: number;
  readonly status: "playing" | "ended";
  readonly winnerTeam: Team | null;
  /** The team that last acted, for draw resolution. */
  readonly lastActingTeam: Team | null;
  readonly seq: number;
  /** The `seq` of the last accepted input, so a duplicate or reordered frame is dropped (`TC-CORE-045`). */
  readonly lastInputSeq: number | null;
  readonly startedAt: number;
}

export interface Snapshot {
  readonly seq: number;
  readonly hostGeneration: number;
  readonly turn: Turn;
  readonly weather: Weather;
  readonly players: readonly PlayerSnapshot[];
  readonly projectiles: readonly ProjectileSnapshot[];
  readonly scores: ScoreState;
  readonly status: "playing" | "ended";
  /** RLE mask (`serializeTerrain`), present only on a snapshot that follows a carve — ~1.9 KB, so it can
   *  not ride along at 10 Hz. Its presence is what makes host and peer masks identical (`US-CORE-006` AC4). */
  readonly terrain?: string;
  readonly winnerTeam: Team | null;
  /** The ruleset the host played under, so a peer can refuse to rank across a version change (`US-CORE-007` AC5). */
  readonly rulesetVersion?: string;
}

export interface PlayerSnapshot {
  readonly slot: number;
  readonly hp: number;
  readonly shield: number;
  readonly energy: number;
  readonly x: number;
  readonly y: number;
  readonly facing: -1 | 1;
  readonly delay: number;
  readonly eliminated: boolean;
  readonly weaponSlot: 0 | 1 | 2;
  /** The super-shot gauge, `0…100` — the HUD draws it, so it has to ride the snapshot. */
  readonly ssCharge: number;
}

export interface ProjectileSnapshot {
  readonly id: number;
  readonly ownerSlot: number;
  readonly x: number;
  readonly y: number;
  readonly shotClass: ShotClass;
}

export interface RoomMember {
  readonly playerId: string;
  readonly accountId: string | null;
  readonly guestId: string | null;
  readonly displayName: string;
  readonly avatarId: string;
  readonly mobileId: string;
  readonly slot: number;
  readonly team: Team | null;
  readonly role: "host" | "player";
  readonly connectionState: ConnectionState;
  readonly joinedAt: number;
  /** Connected at least once; reconnecting is not "joining twice". */
  readonly seenConnected: boolean;
  /** Lobby loadout (`US-ROOM-007`); empty until the player picks consumables. */
  readonly loadout?: readonly LoadoutEntry[];
}

/** One line of a lobby loadout: which consumable and how many (`US-MATCH-005`). */
export interface LoadoutEntry {
  readonly id: string;
  readonly qty: number;
}

export interface RoomSettings {
  readonly maxPlayers: 2 | 4 | 6 | 8;
  readonly mode: ModeId;
  readonly mapId: string;
  readonly isPrivate: boolean;
}

export interface RoomState {
  readonly roomCode: string;
  readonly status: RoomStatus;
  readonly hostPlayerId: string | null;
  readonly hostGeneration: number;
  readonly settings: RoomSettings;
  readonly members: readonly RoomMember[];
  readonly createdAt: number;
  readonly lastActivityAt: number;
  readonly lastSnapshot: Snapshot | null;
}

/** RFC 9457 problem document (`02-reference/api/README.md` § 4). */
export interface Problem {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly request_id?: string;
  readonly errors?: readonly { readonly field: string; readonly detail: string }[];
}
