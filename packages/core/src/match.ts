import type {
  ActiveEffects,
  ItemId,
  MapDef,
  MatchInput,
  MatchState,
  Mobile,
  ModeId,
  PlayerState,
  ScoreState,
  Team,
  Vec2,
  Weather,
} from "./types.js";
import { TUNABLES, roundTo } from "./tuning.js";
import { getMobile } from "./data/mobiles.js";
import { getMap } from "./data/maps.js";
import { ITEMS_BY_ID, isItemId } from "./data/items.js";
import { avatarBonus, bonusMultipliers } from "./data/avatars.js";
import { carve, createTerrain, groundY, heightAt, type Terrain } from "./terrain.js";
import { launch, segmentImpact, stepProjectile } from "./ballistics.js";
import { applyBlast, damageByTeam, mergeHits, teamStatus, type HitResult } from "./combat.js";
import { addDelay, advanceTurn, createTurn, nextSlot } from "./turn.js";
import { FORCE_FIELD, returnsOffMapShots } from "./gimmicks.js";
import { newerWeather, rollWeather, rollWind } from "./weather.js";
import { applyGimmicks } from "./gimmicks.js";
import { tryMove, teleportTo } from "./movement.js";
import { createRng } from "./rng.js";

export interface Seat {
  readonly slot: number;
  readonly team: Team;
  readonly accountId: string | null;
  readonly displayName: string;
  readonly mobileId: string;
  /** Equipped item ids with quantities; the total is capped at eleven. */
  readonly loadout?: Readonly<Record<string, number>>;
  readonly avatarParts?: readonly string[];
}

export interface MatchConfig {
  readonly matchId: string;
  readonly roomCode: string;
  readonly seed: number;
  readonly mode: ModeId;
  readonly mapId: string;
  readonly seats: readonly Seat[];
  readonly now: number;
}

export interface ShotHit extends HitResult {
  readonly slot: number;
}

export type MatchEvent =
  | {
      readonly kind: "shot";
      readonly slot: number;
      readonly weaponSlot: 0 | 1 | 2;
      readonly shotClass: string;
      readonly power: number;
      readonly path: readonly Vec2[];
      readonly impact: Vec2 | null;
      readonly flightMs: number;
      readonly hits: readonly ShotHit[];
      readonly carved: boolean;
    }
  | { readonly kind: "move"; readonly slot: number; readonly from: Vec2; readonly to: Vec2; readonly run: boolean }
  | { readonly kind: "item"; readonly slot: number; readonly itemId: ItemId }
  | { readonly kind: "chat"; readonly slot: number; readonly chatKind: "quick_phrase" | "emote"; readonly id: string }
  | { readonly kind: "turn"; readonly turn: MatchState["turn"] }
  | { readonly kind: "weather"; readonly weather: Weather }
  | { readonly kind: "reject"; readonly slot: number; readonly reason: string }
  | {
      readonly kind: "end";
      readonly winner: Team | null;
      readonly scores: Readonly<Record<Team, number>>;
      readonly mode: ModeId;
      readonly modeState: MatchState["scores"];
    };

export interface InputResult {
  readonly state: MatchState;
  readonly events: readonly MatchEvent[];
}

export const EMPTY_EFFECTS: ActiveEffects = {
  shotsLeft: 1,
  dualWeapon: null,
  bloodNext: false,
  powerUpNext: false,
  dualPlusNext: false,
  bungeNext: false,
  movesThisTurn: 0,
};

/** Rebuild the mutable terrain view the integrator needs from the state's own height array. */
export function terrainOf(state: MatchState): Terrain {
  return { step: state.terrainStep, heights: Float64Array.from(state.terrain), width: TUNABLES.mapWidth };
}

function commitTerrain(state: MatchState, terrain: Terrain): MatchState {
  return { ...state, terrain: Array.from(terrain.heights) };
}

function seatsToPlayers(seats: readonly Seat[], map: MapDef): readonly PlayerState[] {
  const teamCounters: Record<Team, number> = { A: 0, B: 0 };
  return seats.map((seat) => {
    const mobile = getMobile(seat.mobileId);
    const bonus = bonusMultipliers(avatarBonus(seat.avatarParts ?? []));
    const index = teamCounters[seat.team];
    teamCounters[seat.team] += 1;
    const spawnIndex = seat.team === "A" ? index : 4 + index;
    const spawn = map.spawns[spawnIndex] ?? map.spawns[0] ?? [200, 800];
    const items: Record<string, number> = {};
    for (const [itemId, quantity] of Object.entries(seat.loadout ?? {})) {
      if (isItemId(itemId) && quantity > 0) items[itemId] = Math.floor(quantity);
    }
    return {
      slot: seat.slot,
      accountId: seat.accountId,
      displayName: seat.displayName,
      mobileId: seat.mobileId,
      team: seat.team,
      x: spawn[0],
      y: spawn[1],
      facing: seat.team === "A" ? 1 : -1,
      hp: mobile.maxHp,
      shield: mobile.maxShield,
      // Energy is a pool of points, so the avatar adds points (`base + 8`, `US-CORE-013` AC2); attack,
      // defense and delay are percentages and multiply.
      // `bonus.energy` is the multiplier `1 + points/100`, so the points are recovered before adding them.
      energy: mobile.energy + Math.round((bonus.energy - 1) * 100),
      delay: Math.round(mobile.baseDelay * bonus.delay),
      eliminated: false,
      attack: bonus.attack,
      damageDealt: 0,
      shotsFired: 0,
      hits: 0,
      superShotUsed: false,
      items,
    };
  });
}

function initialScores(mode: ModeId, map: MapDef): ScoreState {
  const jewels =
    mode === "jewel"
      ? map.jewels.map((position, index) => ({
          id: index + 1,
          x: position[0],
          y: position[1],
          carriedBy: null as number | null,
        }))
      : [];
  return { score: { A: 0, B: 0 }, activeTeam: "A", jewels };
}

/** Build a match. Deterministic: the same config always produces the same opening state (`NFR-28`). */
export function createMatch(config: MatchConfig): MatchState {
  const map = getMap(config.mapId);
  const terrain = createTerrain(config.mapId);
  const players = seatsToPlayers(config.seats, map);
  const activeSlot = nextSlot(players) ?? 0;
  return {
    matchId: config.matchId,
    roomCode: config.roomCode,
    mode: config.mode,
    mapId: config.mapId,
    rulesetVersion: TUNABLES.rulesetVersion,
    seed: config.seed,
    rng: createRng(config.seed),
    players,
    projectiles: [],
    turn: createTurn(activeSlot, config.now),
    weather: rollWeather(config.seed, 1),
    effects: EMPTY_EFFECTS,
    scores: initialScores(config.mode, map),
    terrain: Array.from(terrain.heights),
    terrainStep: terrain.step,
    status: "playing",
    winnerTeam: null,
    lastActingTeam: null,
    seq: 0,
    lastInputSeq: null,
    startedAt: config.now,
  };
}

function mobileOf(player: PlayerState): Mobile {
  return getMobile(player.mobileId);
}

function gravityFor(mobile: Mobile, map: MapDef): number {
  return mobile.gravity * map.gravityModifier;
}

interface Flight {
  readonly path: readonly Vec2[];
  readonly impact: Vec2 | null;
  readonly flightMs: number;
}

/** Precompute the whole flight so the client can animate exactly what the host resolved. */
function flightPath(state: MatchState, projectile: ReturnType<typeof launch>, mobile: Mobile, map: MapDef): Flight {
  const terrain = terrainOf(state);
  const context = {
    wind: state.weather.wind,
    gravity: gravityFor(mobile, map),
    mass: mobile.mass,
    stepMs: TUNABLES.stepMs,
    forceX: map.gimmicks.includes("force") ? FORCE_FIELD : 0,
  };
  let current = projectile;
  const path: Vec2[] = [{ x: current.x, y: current.y }];
  while (current.ageMs < TUNABLES.maxFlightMs) {
    const previous = { x: current.x, y: current.y };
    current = stepProjectile(current, context);
    path.push({ x: current.x, y: current.y });
    if (current.x < -400 || current.x > TUNABLES.mapWidth + 400 || current.y > TUNABLES.mapHeight + 200) {
      // `return` maps (map-09) bring an off-map shell back once, at reduced power (`TC-CORE-913`).
      if (returnsOffMapShots(map) && !current.returned) {
        current = {
          ...current,
          returned: true,
          x: roundTo(Math.min(Math.max(current.x, 0), TUNABLES.mapWidth)),
          vx: -current.vx * 0.6,
          vy: current.vy * 0.6,
        };
        path.push({ x: current.x, y: current.y });
        continue;
      }
      return { path, impact: null, flightMs: current.ageMs };
    }
    // `itm-bunge` comes home: the same rule as `simulateFlight`, so a previewed arc matches the resolver.
    if (
      current.bunge &&
      current.ageMs >= TUNABLES.bungeTurnMs &&
      Math.abs(current.x - current.homeX) <= 60 &&
      current.y >= heightAt(terrain, current.x) - 40
    ) {
      return { path, impact: { x: roundTo(current.x), y: roundTo(current.y) }, flightMs: current.ageMs };
    }
    const hit = segmentImpact(terrain, previous, { x: current.x, y: current.y });
    if (hit) {
      if (current.piercing) continue;
      if (current.bouncesLeft > 0) {
        current = { ...current, bouncesLeft: current.bouncesLeft - 1, y: hit.y - 1, vy: roundTo(-current.vy * TUNABLES.bounceRestitution) };
        path.push({ x: current.x, y: current.y });
        continue;
      }
      return { path, impact: { x: hit.x, y: hit.y }, flightMs: current.ageMs };
    }
  }
  return { path, impact: null, flightMs: current.ageMs };
}

interface Conclusion {
  /** True when the mode's own end condition is met, independent of who leads. */
  readonly concluded: boolean;
  /** The leading team, or `null` for a draw. */
  readonly winner: Team | null;
}

/** Decide whether this mode has concluded and who leads (`US-CORE-011`, `US-CORE-012`). */
function conclusionOf(state: MatchState): Conclusion {
  if (state.mode === "score") {
    // A wipe-out ends a score match too; the cap only decides a match nobody won by elimination.
    const wiped = teamStatus(state.players).winner;
    if (wiped !== null) return { concluded: true, winner: wiped };
    const played = state.turn.number - 1;
    const cap = TUNABLES.scoreTurnCap * Math.max(1, state.players.length);
    if (played < cap) return { concluded: false, winner: null };
    const totals = damageByTeam(state.players);
    return { concluded: true, winner: totals.A === totals.B ? null : totals.A > totals.B ? "A" : "B" };
  }
  if (state.mode === "jewel") {
    const jewels = state.scores.jewels;
    const carried = jewels.filter((jewel) => jewel.carriedBy !== null);
    if (jewels.length === 0 || carried.length < jewels.length) return { concluded: false, winner: null };
    const totals: Record<Team, number> = { A: 0, B: 0 };
    for (const jewel of carried) {
      const holder = state.players.find((player) => player.slot === jewel.carriedBy);
      if (holder) totals[holder.team] += 1;
    }
    // Holding every jewel wins; a split never ends the match, however lopsided it is.
    if (totals.A === jewels.length) return { concluded: true, winner: "A" };
    if (totals.B === jewels.length) return { concluded: true, winner: "B" };
    return { concluded: false, winner: null };
  }
  const winner = teamStatus(state.players).winner;
  return { concluded: winner !== null, winner };
}

function checkEnd(state: MatchState): { state: MatchState; event: MatchEvent | null } {
  if (state.status === "ended") return { state, event: null };
  const { concluded, winner } = conclusionOf(state);
  if (!concluded) return { state, event: null };
  const ended: MatchState = { ...state, status: "ended", winnerTeam: winner, seq: state.seq + 1 };
  return {
    state: ended,
    event: {
      kind: "end",
      winner,
      scores: { A: ended.scores.score.A, B: ended.scores.score.B },
      mode: ended.mode,
      modeState: ended.scores,
    },
  };
}

function pickUpJewels(state: MatchState): MatchState {
  if (state.mode !== "jewel") return state;
  let changed = false;
  const jewels = state.scores.jewels.map((jewel) => {
    if (jewel.carriedBy !== null) return jewel;
    const collector = state.players.find(
      (player) => !player.eliminated && Math.hypot(player.x - jewel.x, player.y - jewel.y) <= 60,
    );
    if (!collector) return jewel;
    changed = true;
    return { ...jewel, carriedBy: collector.slot };
  });
  return changed ? { ...state, scores: { ...state.scores, jewels }, seq: state.seq + 1 } : state;
}

/** Close the turn, roll the weather when a round completes, and apply that map's gimmicks. */
function advance(state: MatchState, now: number, activeSlot: number | null): { state: MatchState; events: MatchEvent[] } {
  const { turn, roundCompleted } = advanceTurn(state.turn, state.players, { now, activeSlot, mode: state.mode });
  let next: MatchState = {
    ...state,
    turn,
    effects: EMPTY_EFFECTS,
    lastActingTeam: state.players.find((player) => player.slot === state.turn.activeSlot)?.team ?? null,
    seq: state.seq + 1,
  };
  if (state.mode === "tag") {
    // Tag scores the team that is *acting*: the flag flips with the queue (`TC-CORE-916`).
    const actingTeam = state.players.find((player) => player.slot === next.turn.activeSlot)?.team;
    if (actingTeam && actingTeam !== next.scores.activeTeam) {
      next = { ...next, scores: { ...next.scores, activeTeam: actingTeam } };
    }
  }
  // Shield refills at the start of its owner's turn, capped at `maxShield` (`US-CORE-003` AC3,
  // `mobiles.md`): a shield is a per-turn buffer, which is the only reading that makes `shieldRegen` a
  // tunable rather than a one-off.
  const starting = next.players.find((player) => player.slot === turn.activeSlot && !player.eliminated);
  if (starting && starting.shield < getMobile(starting.mobileId as Parameters<typeof getMobile>[0]).maxShield) {
    const cap = getMobile(starting.mobileId as Parameters<typeof getMobile>[0]).maxShield;
    const regen = getMobile(starting.mobileId as Parameters<typeof getMobile>[0]).shieldRegen;
    const shield = Math.min(cap, starting.shield + regen);
    next = {
      ...next,
      players: next.players.map((player) => (player.slot === starting.slot ? { ...player, shield } : player)),
      seq: next.seq + 1,
    };
  }
  const events: MatchEvent[] = [{ kind: "turn", turn }];
  if (!roundCompleted) {
    // A `gust` spike lasts exactly one turn: when it ends, the round's own roll comes back (`TC-CORE-918`).
    const map = getMap(state.mapId);
    if (map.gimmicks.includes("gust") && state.weather.rolledAtRound === state.turn.round) {
      const base = rollWeather(state.seed, state.turn.round);
      next = { ...next, weather: base, seq: next.seq + 1 };
      events.push({ kind: "weather", weather: base });
    }
  }
  if (roundCompleted) {
    const weather = rollWeather(state.seed, turn.round);
    next = { ...next, weather, seq: next.seq + 1 };
    events.push({ kind: "weather", weather });
    const map = getMap(next.mapId);
    if (map.gimmicks.length > 0) {
      const effect = applyGimmicks(next, turn.round, map);
      // A gimmick may only speak for the round it was applied to; anything older is a stale roll (`AC7`).
      const gimmicked: Weather = effect.weather ? newerWeather(next.weather, effect.weather) : next.weather;
      next = { ...next, weather: gimmicked, players: effect.players, seq: next.seq + 1 };
      if (effect.weather) events.push({ kind: "weather", weather: gimmicked });
    }
  }
  return { state: next, events };
}

function resolveShot(
  state: MatchState,
  slot: number,
  weaponSlot: 0 | 1 | 2,
  angle: number,
  force: number,
  now: number,
): InputResult {
  const player = state.players.find((candidate) => candidate.slot === slot);
  if (!player) return { state, events: [{ kind: "reject", slot, reason: "unknown-slot" }] };
  if (weaponSlot === 2 && player.superShotUsed) {
    return { state, events: [{ kind: "reject", slot, reason: "super-shot-spent" }] };
  }
  const mobile = mobileOf(player);
  const weapon = mobile.weapons[weaponSlot];
  const map = getMap(state.mapId);
  const effects = state.effects;

  const clampedAngle = Math.min(mobile.angleMax, Math.max(mobile.angleMin, angle));
  const clampedForce = Math.min(mobile.maxPower + (effects.powerUpNext ? 20 : 0), Math.max(0, force));
  const powerMultiplier = player.attack * (effects.bloodNext ? 1.25 : 1) * (effects.dualPlusNext ? 1.15 : 1);

  const projectile = launch({
    id: state.seq + 1,
    ownerSlot: slot,
    weaponSlot,
    weapon,
    from: { x: player.x, y: player.y },
    facing: player.facing,
    angle: clampedAngle,
    force: clampedForce,
    powerMultiplier,
    bunge: effects.bungeNext,
  });
  const flight = flightPath(state, projectile, mobile, map);
  const events: MatchEvent[] = [];

  const terrain = terrainOf(state);
  let players: readonly PlayerState[] = state.players.map((candidate) =>
    candidate.slot === slot
      ? { ...candidate, shotsFired: candidate.shotsFired + 1, superShotUsed: candidate.superShotUsed || weaponSlot === 2 }
      : candidate,
  );

  let hits: readonly HitResult[] = [];
  let carved = false;
  if (flight.impact) {
    carve(terrain, flight.impact.x, flight.impact.y, weapon.radius * TUNABLES.terrainCarveRatio);
    carved = true;
    hits = applyBlast(
      players,
      { x: flight.impact.x, y: flight.impact.y, radius: weapon.radius, power: weapon.power, ownerSlot: slot },
      { defenseOf: (victim) => mobileOf(victim).defense, attack: player.attack, bloodBonus: effects.bloodNext ? 1.25 : 1 },
    );
    const damagedSomeoneElse = hits.some((hit) => hit.player.slot !== slot);
    players = mergeHits(players, hits).map((candidate) =>
      candidate.slot === slot && damagedSomeoneElse ? { ...candidate, hits: candidate.hits + 1 } : candidate,
    );
  }

  players = addDelay(players, slot, weapon.delay);

  let scores = state.scores;
  if (state.mode === "jewel") {
    const dropped = players.filter((candidate) => candidate.eliminated);
    if (dropped.length > 0) {
      scores = {
        ...state.scores,
        jewels: state.scores.jewels.map((jewel) => {
          const carrier = dropped.find((candidate) => candidate.slot === jewel.carriedBy);
          if (!carrier) return jewel;
          // The killer inherits the loot (`TC-CORE-917`); a self-inflicted death drops it where it fell.
          return carrier.slot === slot
            ? { ...jewel, carriedBy: null, x: carrier.x, y: carrier.y }
            : { ...jewel, carriedBy: slot };
        }),
      };
    }
  }

  let next: MatchState = commitTerrain(
    {
      ...state,
      players,
      scores,
      lastActingTeam: player.team,
      effects: {
        ...effects,
        shotsLeft: Math.max(0, effects.shotsLeft - 1),
        // The first shot of a Dual pair fixes the weapon and the second must reuse it, so a player cannot
        // fire slot 1 and then slot 2 for two different maps of effect (`US-CORE-009` AC2).
        dualWeapon: effects.shotsLeft > 1 ? weaponSlot : effects.dualWeapon,
        bloodNext: false,
        powerUpNext: false,
        dualPlusNext: false,
        bungeNext: false,
      },
      seq: state.seq + 1,
    },
    terrain,
  );
  // A crater under a unit takes the ground out from under it; it falls to the new surface instead of
  // floating (`US-CORE-006` AC3).
  if (carved) next = reground(next);

  events.push({
    kind: "shot",
    slot,
    weaponSlot,
    shotClass: weapon.shotClass,
    power: projectile.power,
    path: flight.path,
    impact: flight.impact,
    flightMs: flight.flightMs,
    hits: hits.map((hit) => ({ ...hit, slot: hit.player.slot })),
    carved,
  });

  const ended = checkEnd(next);
  next = ended.state;
  if (ended.event) events.push(ended.event);
  if (next.status === "ended") return { state: next, events };

  if (next.effects.shotsLeft > 0) return { state: next, events };

  const advanced = advance(next, now, null);
  next = pickUpJewels(advanced.state);
  events.push(...advanced.events);
  const afterPick = checkEnd(next);
  next = afterPick.state;
  if (afterPick.event) events.push(afterPick.event);
  return { state: next, events };
}

function applyItem(state: MatchState, slot: number, itemId: ItemId, now: number): InputResult {
  const player = state.players.find((candidate) => candidate.slot === slot);
  if (!player) return { state, events: [{ kind: "reject", slot, reason: "unknown-slot" }] };
  const item = ITEMS_BY_ID.get(itemId);
  if (!item) return { state, events: [{ kind: "reject", slot, reason: "unknown-item" }] };
  // An item between Dual's two shots would let the second shot carry a second effect (`US-CORE-009` AC2).
  const midDual = state.effects.shotsLeft > 1 || (state.effects.dualWeapon !== null && state.effects.shotsLeft > 0);
  if (midDual) return { state, events: [{ kind: "reject", slot, reason: "dual-in-progress" }] };
  const quantity = player.items[itemId] ?? 0;
  if (quantity <= 0) return { state, events: [{ kind: "reject", slot, reason: "no-item-left" }] };

  const terrain = terrainOf(state);
  let players: readonly PlayerState[] = state.players.map((candidate) =>
    candidate.slot === slot
      ? { ...candidate, items: { ...candidate.items, [itemId]: quantity - 1 }, delay: candidate.delay + item.delayCost }
      : candidate,
  );
  let effects = state.effects;
  let weather = state.weather;
  const events: MatchEvent[] = [{ kind: "item", slot, itemId }];

  switch (itemId) {
    case "itm-dual":
      effects = { ...effects, shotsLeft: 2 };
      break;
    case "itm-dual-plus":
      effects = { ...effects, shotsLeft: 2, dualPlusNext: true };
      break;
    case "itm-blood":
      effects = { ...effects, bloodNext: true };
      break;
    case "itm-power-up":
      effects = { ...effects, powerUpNext: true };
      break;
    case "itm-bunge":
      effects = { ...effects, bungeNext: true };
      break;
    case "itm-energy-1":
      players = players.map((candidate) => (candidate.slot === slot ? { ...candidate, energy: candidate.energy + 30 } : candidate));
      break;
    case "itm-energy-2":
      players = players.map((candidate) => (candidate.slot === slot ? { ...candidate, energy: candidate.energy + 60 } : candidate));
      break;
    case "itm-change-wind": {
      const rng = createRng((state.seed ^ Math.imul(state.seq + 7, 0x85ebca6b)) >>> 0);
      weather = { wind: rollWind(rng), rolledAtRound: state.turn.round };
      events.push({ kind: "weather", weather });
      break;
    }
    case "itm-teleport":
      players = players.map((candidate) =>
        candidate.slot === slot ? teleportTo(candidate, terrain, candidate.x + candidate.facing * 150) : candidate,
      );
      break;
    case "itm-team-teleport": {
      const caster = players.find((candidate) => candidate.slot === slot);
      if (caster) {
        let index = 0;
        players = players.map((candidate) => {
          if (candidate.team !== caster.team || candidate.eliminated || candidate.slot === slot) return candidate;
          // Alternate the sides of the caster so every mate lands inside 40 px, however many there are.
          const side = index % 2 === 0 ? 1 : -1;
          index += 1;
          return teleportTo(candidate, terrain, caster.x + side * 40 * caster.facing);
        });
      }
      break;
    }
    case "itm-thunder": {
      const caster = players.find((candidate) => candidate.slot === slot);
      if (caster) {
        const inBand = players.filter(
          (candidate) => !candidate.eliminated && candidate.team !== caster.team && Math.abs(candidate.x - caster.x) <= 200,
        );
        for (const victim of inBand) {
          const results = applyBlast(
            players,
            { x: victim.x, y: victim.y, radius: 220, power: 150, ownerSlot: slot },
            { defenseOf: (candidate) => mobileOf(candidate).defense },
          );
          players = mergeHits(players, results);
        }
      }
      break;
    }
    default:
      break;
  }

  let next: MatchState = commitTerrain({ ...state, players, weather, effects, seq: state.seq + 1 }, terrain);
  const ended = checkEnd(next);
  if (ended.event) {
    events.push(ended.event);
    next = ended.state;
  }
  void now;
  return { state: next, events };
}

/** Apply one validated input. Unknown senders and out-of-turn actions are rejected, never thrown. */
export function applyInput(state: MatchState, input: MatchInput, now: number): InputResult {
  if (state.status === "ended") {
    return { state, events: [{ kind: "reject", slot: input.slot, reason: "match-ended" }] };
  }
  if (input.kind === "quick_phrase" || input.kind === "emote") {
    const player = state.players.find((candidate) => candidate.slot === input.slot);
    if (!player) return { state, events: [{ kind: "reject", slot: input.slot, reason: "unknown-slot" }] };
    return { state, events: [{ kind: "chat", slot: input.slot, chatKind: input.kind, id: input.id }] };
  }
  if (input.slot !== state.turn.activeSlot) {
    return { state, events: [{ kind: "reject", slot: input.slot, reason: "not-your-turn" }] };
  }
  // The sender owns `seq` (`conventions.md` §7): a frame that is not newer than the last accepted one is a
  // retransmit or a reordering, and applying it twice would simulate a second shot (`TC-CORE-045`).
  if (state.lastInputSeq !== null && input.seq <= state.lastInputSeq) {
    return { state, events: [{ kind: "reject", slot: input.slot, reason: "stale-input" }] };
  }
  const accepted: MatchState = { ...state, lastInputSeq: input.seq };
  if (input.kind === "fire") {
    // The second shot of a Dual pair follows the first shot's weapon (`US-CORE-009` AC2).
    const weaponSlot = accepted.effects.dualWeapon ?? input.weaponSlot;
    return resolveShot(accepted, input.slot, weaponSlot, input.angle, input.force, now);
  }
  if (input.kind === "skip") {
    const advanced = advance(accepted, now, null);
    let next = pickUpJewels(advanced.state);
    const ended = checkEnd(next);
    next = ended.state;
    return { state: next, events: ended.event ? [...advanced.events, ended.event] : advanced.events };
  }
  if (input.kind === "item") {
    return applyItem(accepted, input.slot, input.itemId, now);
  }
  if (input.kind !== "move") {
    return { state, events: [{ kind: "reject", slot: input.slot, reason: "unknown-input" }] };
  }
  const player = accepted.players.find((candidate) => candidate.slot === input.slot);
  if (!player) return { state, events: [{ kind: "reject", slot: input.slot, reason: "unknown-slot" }] };
  const outcome = tryMove(player, mobileOf(player), terrainOf(accepted), input.dir, input.run, accepted.effects.movesThisTurn);
  if (!outcome.ok || !outcome.player) {
    return { state, events: [{ kind: "reject", slot: input.slot, reason: outcome.reason ?? "move-failed" }] };
  }
  const moved = outcome.player;
  const players = accepted.players.map((candidate) => (candidate.slot === input.slot ? moved : candidate));
  const next: MatchState = {
    ...accepted,
    players,
    effects: { ...accepted.effects, movesThisTurn: accepted.effects.movesThisTurn + 1 },
    lastActingTeam: player.team,
    seq: accepted.seq + 1,
  };
  return {
    // A step onto a jewel is a pickup: the walker carries it from that moment, not at turn end.
    state: pickUpJewels(next),
    events: [{ kind: "move", slot: input.slot, from: { x: player.x, y: player.y }, to: { x: moved.x, y: moved.y }, run: input.run }],
  };
}

/** Force the turn to pass (clock expired twice, or the host dropped). */
export function passTurn(state: MatchState, now: number): InputResult {
  return applyInput(state, { kind: "skip", slot: state.turn.activeSlot, seq: state.seq }, now);
}

/**
 * Re-ground every unit after terrain changed (`US-CORE-006` AC3). `seq` is left alone: the caller has
 * already committed the action, and a second bump would make one shot look like two inputs.
 */
export function reground(state: MatchState): MatchState {
  const terrain = terrainOf(state);
  return {
    ...state,
    players: state.players.map((player) => ({ ...player, y: groundY(terrain, player.x) - 8 })),
  };
}
