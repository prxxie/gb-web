/**
 * Match recording (`docs/02-reference/api/matches.md`, `US-RANK-001`, `US-RANK-002`).
 *
 * The host posts the result once. Rating is computed **here**, server-side, from stored ratings —
 * never from anything the client sends (`NFR-14`) — and the whole write is one D1 batch so a match
 * either exists with its players and rating rows, or not at all. `Idempotency-Key` replay is stored
 * next to the match so a client retry can never record it twice (`matches.md`, 24 h).
 */
import { clampRating, expectedScore, isValidRoomCode, kFactor, RULESET_VERSION } from "@gbw/core";
import type { Env, ProfileRow } from "../lib/db.js";
import {
  decodeHistoryCursor,
  encodeHistoryCursor,
  findHistoryPage,
  findMatchById,
  findOpponents,
  findProfile,
  findSubmission,
  IDEMPOTENCY_TTL_MS,
  now,
  type MatchHistoryCursor,
} from "../lib/db.js";
import { ProblemError, type FieldError } from "../lib/problem.js";
import { checkLimit, RULES } from "../lib/ratelimit.js";
import type { SessionToken } from "../lib/session.js";
import { cursorOf, Field, limitOf, readJson, requireIdempotencyKey } from "../lib/validation.js";

interface SubmittedPlayer {
  readonly slot: number;
  readonly team: "A" | "B";
  readonly accountId: string | null;
  readonly damageDealt: number;
  readonly shotsFired: number;
  readonly hits: number;
  readonly forfeited: boolean;
}

export interface MatchSubmission {
  readonly matchId: string | null;
  readonly roomCode: string;
  readonly rulesetVersion: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly winnerTeam: "A" | "B" | null;
  readonly abandoned: boolean;
  readonly players: readonly SubmittedPlayer[];
}

const MIN_DURATION_MS = 60_000;
const MAX_DURATION_MS = 30 * 60_000;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;

function isoTimestamp(value: unknown, field: Field, path: string): string {
  const text = field.string(value, path, { min: 1, max: 40 });
  if (text !== "" && Number.isNaN(Date.parse(text))) field.fail(path, "must be an ISO-8601 timestamp");
  return text;
}

function parseSubmission(body: Record<string, unknown>): MatchSubmission {
  const field = new Field([]);
  const matchId =
    body["matchId"] === undefined || body["matchId"] === null
      ? null
      : field.string(body["matchId"], "matchId", { min: 8, max: 64 });
  const roomCode = field.string(body["roomCode"], "roomCode", { min: 6, max: 6 });
  if (roomCode !== "" && !isValidRoomCode(roomCode)) field.fail("roomCode", "is not a valid room code");
  const rulesetVersion = field.string(body["rulesetVersion"], "rulesetVersion", { min: 1, max: 64 });
  const startedAt = isoTimestamp(body["startedAt"], field, "startedAt");
  const endedAt = isoTimestamp(body["endedAt"], field, "endedAt");

  const winnerTeamRaw = body["winnerTeam"];
  const winnerTeam = winnerTeamRaw === "A" || winnerTeamRaw === "B" ? winnerTeamRaw : null;
  if (winnerTeam === null) field.fail("winnerTeam", "must be A or B");

  const abandoned = body["abandoned"] === true;
  const rawPlayers = Array.isArray(body["players"]) ? (body["players"] as Record<string, unknown>[]) : [];
  if (rawPlayers.length < MIN_PLAYERS || rawPlayers.length > MAX_PLAYERS) {
    field.fail("players", `must contain ${MIN_PLAYERS}–${MAX_PLAYERS} players`);
  }

  const players: SubmittedPlayer[] = rawPlayers.map((player, index) => {
    const path = `players[${index}]`;
    const teamRaw = player["team"];
    if (teamRaw !== "A" && teamRaw !== "B") field.fail(`${path}.team`, "must be A or B");
    const accountRaw = player["accountId"];
    let accountId: string | null = null;
    if (accountRaw !== null && accountRaw !== undefined) {
      const parsed = field.string(accountRaw, `${path}.accountId`, { min: 1, max: 64 });
      accountId = parsed === "" ? null : parsed;
    }
    const shotsFired = field.number(player["shotsFired"] ?? 0, `${path}.shotsFired`, { min: 0, max: 1_000, integer: true });
    const hits = field.number(player["hits"] ?? 0, `${path}.hits`, { min: 0, max: 1_000, integer: true });
    if (hits > shotsFired) field.fail(`${path}.hits`, "cannot exceed shotsFired");
    // `displayName` is documented as required but is only for readability; identity is `accountId`,
    // so a missing name is not a reason to reject an otherwise valid record (`matches.md`).
    if (player["displayName"] !== undefined) field.string(player["displayName"], `${path}.displayName`, { max: 64 });
    return {
      slot: field.number(player["slot"], `${path}.slot`, { min: 0, max: 7, integer: true }),
      team: teamRaw === "B" ? "B" : "A",
      accountId,
      damageDealt: field.number(player["damageDealt"] ?? 0, `${path}.damageDealt`, { min: 0, max: 100_000, integer: true }),
      shotsFired,
      hits,
      forfeited: player["forfeited"] === true,
    };
  });

  const seenSlots = new Map<number, number>();
  const seenAccounts = new Map<string, number>();
  players.forEach((player, index) => {
    const firstSlot = seenSlots.get(player.slot);
    if (firstSlot !== undefined) {
      field.fail(`players[${index}].slot`, `duplicates players[${firstSlot}].slot`);
    } else {
      seenSlots.set(player.slot, index);
    }
    if (player.accountId !== null) {
      const firstAccount = seenAccounts.get(player.accountId);
      if (firstAccount !== undefined) {
        field.fail(`players[${index}].accountId`, `duplicates players[${firstAccount}].accountId`);
      } else {
        seenAccounts.set(player.accountId, index);
      }
    }
    if (!abandoned && player.forfeited && winnerTeam !== null && player.team === winnerTeam) {
      field.fail(`players[${index}].forfeited`, "cannot forfeit for the winning team");
    }
  });

  const teamA = players.filter((player) => player.team === "A").length;
  const teamB = players.filter((player) => player.team === "B").length;
  if (teamA > 0 && teamB > 0 && teamA !== teamB) field.fail("players", "teams must have equal sizes");

  if (startedAt !== "" && endedAt !== "") {
    const duration = Date.parse(endedAt) - Date.parse(startedAt);
    if (duration < MIN_DURATION_MS || duration > MAX_DURATION_MS) {
      field.fail("endedAt", `match duration must be between ${MIN_DURATION_MS} and ${MAX_DURATION_MS} ms`);
    }
  }

  field.done();
  return { matchId, roomCode, rulesetVersion, startedAt, endedAt, winnerTeam, abandoned, players };
}

interface RatingChange {
  readonly accountId: string;
  readonly before: number;
  readonly after: number;
  readonly delta: number;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Per-team expected score from the rated players' averages; per-player K (`US-RANK-002` AC2/AC3). */
function rateTeam(
  players: readonly SubmittedPlayer[],
  profiles: ReadonlyMap<string, ProfileRow>,
  winnerTeam: "A" | "B",
  opponentAverage: number,
  ownAverage: number,
): RatingChange[] {
  const expected = expectedScore(ownAverage, opponentAverage);
  return players.map((player) => {
    const profile = profiles.get(player.accountId!);
    if (!profile) throw new ProblemError("internal", "A rated player has no profile");
    const score = player.team === winnerTeam ? 1 : 0;
    const before = profile.rating;
    const after = clampRating(before + Math.round(kFactor(profile.rated_matches) * (score - expected)));
    return { accountId: player.accountId!, before, after, delta: after - before };
  });
}

export async function submitMatch(request: Request, env: Env, session: SessionToken): Promise<Response> {
  if (session.sub.kind !== "account" || !session.sub.accountId) {
    throw new ProblemError("unauthenticated", "Only a signed-in host can record a match");
  }
  const accountId = session.sub.accountId;
  const limit = checkLimit(`matches:${accountId}`, RULES.matchesPerAccount);
  if (!limit.allowed) {
    throw new ProblemError("rate-limited", "Too many match submissions", [], limit.retryAfterSeconds, "account_matches");
  }

  const idempotencyKey = requireIdempotencyKey(request);
  const body = await readJson(request);
  const submission = parseSubmission(body);

  if (idempotencyKey) {
    const seen = await findSubmission(env.GBW_DB, idempotencyKey);
    if (seen) {
      if (seen.account_id !== accountId) {
        throw new ProblemError("validation", "Idempotency-Key was already used by another submission", [
          { field: "Idempotency-Key", detail: "belongs to another account" },
        ]);
      }
      if (Date.now() - Date.parse(seen.created_at) < IDEMPOTENCY_TTL_MS) {
        return Response.json(JSON.parse(seen.response_body) as Record<string, unknown>, { status: seen.status_code });
      }
    }
  }

  if (!submission.players.some((player) => player.accountId === accountId)) {
    throw new ProblemError("forbidden", "Only a participant can record a match");
  }

  const matchId = submission.matchId ?? crypto.randomUUID();
  if (await findMatchById(env.GBW_DB, matchId)) {
    throw new ProblemError("match-already-recorded", "This match already exists");
  }
  const duplicate = await env.GBW_DB.prepare("SELECT match_id FROM match_record WHERE room_code = ? AND started_at = ?")
    .bind(submission.roomCode, submission.startedAt)
    .first<{ match_id: string }>();
  if (duplicate) throw new ProblemError("match-already-recorded", "This room occurrence is already recorded");

  const profiles = new Map<string, ProfileRow>();
  const unregistered: FieldError[] = [];
  for (const [index, player] of submission.players.entries()) {
    if (player.accountId === null || profiles.has(player.accountId)) continue;
    const profile = await findProfile(env.GBW_DB, player.accountId);
    if (profile) profiles.set(player.accountId, profile);
    else unregistered.push({ field: `players[${index}].accountId`, detail: "is not a registered account" });
  }
  if (unregistered.length > 0) {
    throw new ProblemError("validation", "Every player row must map to an existing account", unregistered);
  }

  const registered = submission.players.filter((player) => player.accountId !== null);
  const teamA = registered.filter((player) => player.team === "A");
  const teamB = registered.filter((player) => player.team === "B");
  const abandoned = submission.abandoned;
  const ranked =
    !abandoned &&
    submission.rulesetVersion === RULESET_VERSION &&
    teamA.length > 0 &&
    teamB.length > 0;

  const changes: RatingChange[] = [];
  if (ranked) {
    const average = (players: readonly SubmittedPlayer[]): number =>
      players.reduce((sum, player) => sum + profiles.get(player.accountId!)!.rating, 0) / players.length;
    const averageA = average(teamA);
    const averageB = average(teamB);
    changes.push(...rateTeam(teamA, profiles, submission.winnerTeam!, averageB, averageA));
    changes.push(...rateTeam(teamB, profiles, submission.winnerTeam!, averageA, averageB));
  }
  const changeByAccount = new Map(changes.map((change) => [change.accountId, change]));

  const createdAt = now();
  const slots = (players: readonly SubmittedPlayer[]): string =>
    JSON.stringify(players.map((player) => player.slot).sort((left, right) => left - right));
  const statements: D1PreparedStatement[] = [
    env.GBW_DB.prepare(
      `INSERT INTO match_record (match_id, room_code, player_count, team_a_slots, team_b_slots, winner_team, ranked,
                                 ruleset_version, duration_ms, started_at, ended_at, submitted_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      matchId,
      submission.roomCode,
      submission.players.length,
      slots(submission.players.filter((player) => player.team === "A")),
      slots(submission.players.filter((player) => player.team === "B")),
      submission.winnerTeam,
      ranked ? 1 : 0,
      submission.rulesetVersion,
      Date.parse(submission.endedAt) - Date.parse(submission.startedAt),
      submission.startedAt,
      submission.endedAt,
      accountId,
      createdAt,
    ),
  ];

  for (const player of registered) {
    const change = changeByAccount.get(player.accountId!);
    const result =
      abandoned || player.forfeited ? "abandon" : player.team === submission.winnerTeam ? "win" : "loss";
    statements.push(
      env.GBW_DB.prepare(
        `INSERT INTO match_player (match_id, account_id, slot, team, result, damage_dealt, shots_fired, hits,
                                   rating_before, rating_after)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        matchId,
        player.accountId,
        player.slot,
        player.team,
        result,
        player.damageDealt,
        player.shotsFired,
        player.hits,
        change?.before ?? null,
        change?.after ?? null,
      ),
    );
    if (change) {
      statements.push(
        env.GBW_DB.prepare(
          `INSERT INTO rating_history (account_id, match_id, rating_before, rating_after, delta, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).bind(player.accountId, matchId, change.before, change.after, change.delta, createdAt),
        env.GBW_DB.prepare(
          "UPDATE profile SET rating = ?, rated_matches = rated_matches + 1, updated_at = ? WHERE account_id = ?",
        ).bind(change.after, createdAt, player.accountId),
      );
    }
  }

  const payload = {
    matchId,
    ranked,
    ratings: changes.map((change) => ({
      accountId: change.accountId,
      before: change.before,
      after: change.after,
      delta: change.delta,
    })),
  };
  const responseBody = JSON.stringify(payload);
  if (idempotencyKey) {
    statements.push(
      env.GBW_DB.prepare(
        `INSERT INTO match_submission (idempotency_key, account_id, request_hash, status_code, response_body, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (idempotency_key) DO UPDATE SET
           account_id = excluded.account_id,
           request_hash = excluded.request_hash,
           status_code = excluded.status_code,
           response_body = excluded.response_body,
           created_at = excluded.created_at`,
      ).bind(idempotencyKey, accountId, await sha256Hex(JSON.stringify(body)), 201, responseBody, createdAt),
    );
  }

  await env.GBW_DB.batch(statements);

  return Response.json(payload, { status: 201 });
}

const OPPONENT_CHUNK = 50;

export async function myMatches(request: Request, env: Env, session: SessionToken): Promise<Response> {
  if (session.sub.kind !== "account" || !session.sub.accountId) {
    throw new ProblemError("unauthenticated", "Match history needs a signed-in account");
  }
  const accountId = session.sub.accountId;
  const url = new URL(request.url);
  const limit = limitOf(url, 20);
  const rawCursor = cursorOf(url);
  // Decoded here so an unreadable cursor is a problem, never a 500.
  const after: MatchHistoryCursor | null = rawCursor ? decodeHistoryCursor(rawCursor) : null;

  const rows = await findHistoryPage(env.GBW_DB, accountId, after, limit);
  const page = rows.slice(0, limit);
  const matchIds = page.map((row) => row.match_id);

  const opponentsByMatch = new Map<string, { displayName: string; team: string }[]>();
  for (let start = 0; start < matchIds.length; start += OPPONENT_CHUNK) {
    const chunk = matchIds.slice(start, start + OPPONENT_CHUNK);
    for (const opponent of await findOpponents(env.GBW_DB, chunk, accountId)) {
      const list = opponentsByMatch.get(opponent.match_id) ?? [];
      list.push({ displayName: opponent.display_name ?? "", team: opponent.team });
      opponentsByMatch.set(opponent.match_id, list);
    }
  }

  const items = page.map((row) => ({
    matchId: row.match_id,
    playedAt: row.ended_at,
    team: row.team,
    result: row.result,
    opponents: opponentsByMatch.get(row.match_id) ?? [],
    damageDealt: row.damage_dealt,
    shotsFired: row.shots_fired,
    hits: row.hits,
    ratingDelta:
      row.rating_before === null || row.rating_after === null ? null : row.rating_after - row.rating_before,
    rulesetVersion: row.ruleset_version,
  }));
  const last = page[page.length - 1];
  const nextCursor =
    rows.length > limit && last ? encodeHistoryCursor({ endedAt: last.ended_at, matchId: last.match_id }) : null;

  return Response.json({ items, next_cursor: nextCursor, has_more: nextCursor !== null });
}
