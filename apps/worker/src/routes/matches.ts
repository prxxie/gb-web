/**
 * Match recording (`docs/02-reference/api/matches.md`, `US-RANK-001`, `US-RANK-002`).
 *
 * The host posts the result once. Rating is computed **here**, server-side, from stored ratings —
 * never from anything the client sends (`NFR-14`) — and the whole write is one D1 batch so a match
 * either exists with its players and rating rows, or not at all.
 */
import { isValidRoomCode, kFactor, rateMatch, RULESET_VERSION, clampRating } from "@gbw/core";
import type { Env } from "../lib/db.js";
import { encodeCursor, findProfile, now, type ProfileRow } from "../lib/db.js";
import { ProblemError } from "../lib/problem.js";
import { checkLimit, RULES } from "../lib/ratelimit.js";
import type { SessionToken } from "../lib/session.js";
import { Field, limitOf, readJson, requireIdempotencyKey } from "../lib/validation.js";

interface SubmittedPlayer {
  readonly slot: number;
  readonly team: "A" | "B";
  readonly accountId: string | null;
  readonly damageDealt: number;
  readonly shotsFired: number;
  readonly hits: number;
}

export interface MatchSubmission {
  readonly matchId: string;
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

function parseSubmission(body: Record<string, unknown>): MatchSubmission {
  const field = new Field([]);
  const matchId = field.string(body["matchId"], "matchId", { min: 8, max: 64 });
  const roomCode = field.string(body["roomCode"], "roomCode", { min: 6, max: 6 });
  if (roomCode && !isValidRoomCode(roomCode)) field.fail("roomCode", "is not a valid room code");
  const rulesetVersion = field.string(body["rulesetVersion"], "rulesetVersion");
  const startedAt = field.string(body["startedAt"], "startedAt");
  const endedAt = field.string(body["endedAt"], "endedAt");
  const winnerTeamRaw = body["winnerTeam"];
  const winnerTeam = winnerTeamRaw === "A" || winnerTeamRaw === "B" ? winnerTeamRaw : null;
  if (winnerTeamRaw !== null && winnerTeamRaw !== undefined && winnerTeam === null) {
    field.fail("winnerTeam", "must be A, B or null");
  }
  const abandoned = body["abandoned"] === true;
  const rawPlayers = Array.isArray(body["players"]) ? (body["players"] as Record<string, unknown>[]) : [];
  if (rawPlayers.length < 2 || rawPlayers.length > 8) field.fail("players", "must contain 2–8 players");
  const players: SubmittedPlayer[] = rawPlayers.map((player, index) => {
    const path = `players[${index}]`;
    const team = player["team"] === "B" ? "B" : "A";
    return {
      slot: field.number(player["slot"] ?? index, `${path}.slot`, { min: 0, max: 7, integer: true }),
      team,
      accountId: typeof player["accountId"] === "string" ? player["accountId"] : null,
      damageDealt: field.number(player["damageDealt"] ?? 0, `${path}.damageDealt`, { min: 0, max: 100_000 }),
      shotsFired: field.number(player["shotsFired"] ?? 0, `${path}.shotsFired`, { min: 0, max: 1_000 }),
      hits: field.number(player["hits"] ?? 0, `${path}.hits`, { min: 0, max: 1_000 }),
    };
  });
  field.done();

  const started = Date.parse(startedAt);
  const ended = Date.parse(endedAt);
  if (Number.isNaN(started) || Number.isNaN(ended)) throw new ProblemError("validation", "Timestamps must be ISO-8601");
  const duration = ended - started;
  if (duration < MIN_DURATION_MS || duration > MAX_DURATION_MS) {
    throw new ProblemError("validation", `Match duration must be between ${MIN_DURATION_MS} and ${MAX_DURATION_MS} ms`);
  }
  return { matchId, roomCode, rulesetVersion, startedAt, endedAt, winnerTeam, abandoned, players };
}

export async function submitMatch(request: Request, env: Env, session: SessionToken): Promise<Response> {
  if (session.sub.kind !== "account" || !session.sub.accountId) {
    throw new ProblemError("unauthenticated", "Only a signed-in host can record a match");
  }
  const accountId = session.sub.accountId;
  const limit = checkLimit(`matches:${accountId}`, RULES.matchesPerAccount);
  if (!limit.allowed) throw new ProblemError("rate-limited", "Too many match submissions");

  const idempotencyKey = requireIdempotencyKey(request);
  const submission = parseSubmission(await readJson(request));

  const existing = await env.GBW_DB.prepare("SELECT match_id FROM match_record WHERE match_id = ?")
    .bind(submission.matchId)
    .first<{ match_id: string }>();
  if (existing) throw new ProblemError("match-already-recorded", "This match already exists");
  if (idempotencyKey) {
    const seen = await env.GBW_DB.prepare("SELECT request_hash FROM match_record WHERE submitted_by = ? AND match_id = ?")
      .bind(accountId, submission.matchId)
      .first<{ request_hash: string }>();
    void seen;
  }

  const ranked =
    !submission.abandoned &&
    submission.winnerTeam !== null &&
    submission.rulesetVersion === RULESET_VERSION &&
    submission.players.every((player) => player.accountId !== null);
  const rankedReason = submission.abandoned
    ? "abandoned"
    : submission.rulesetVersion !== RULESET_VERSION
      ? "ruleset_mismatch"
      : submission.winnerTeam === null
        ? "draw"
        : submission.players.some((player) => player.accountId === null)
          ? "guest"
          : null;

  const accounts = submission.players.filter((player) => player.accountId !== null);
  const profiles = new Map<string, ProfileRow>();
  for (const player of accounts) {
    const profile = await findProfile(env.GBW_DB, player.accountId!);
    if (profile) profiles.set(player.accountId!, profile);
  }

  const teamA = accounts.filter((player) => player.team === "A" && profiles.has(player.accountId!));
  const teamB = accounts.filter((player) => player.team === "B" && profiles.has(player.accountId!));
  const ratingsByPlayer: Record<string, { before: number; after: number; delta: number }> = {};

  if (ranked && teamA.length > 0 && teamB.length > 0) {
    const total = (team: readonly SubmittedPlayer[]): number =>
      team.reduce((sum, player) => sum + (profiles.get(player.accountId!)?.rating ?? 1200), 0);
    const settled = Math.max(
      ...accounts.map((player) => profiles.get(player.accountId!)?.rated_matches ?? 0),
    );
    const changes = rateMatch({
      teams: [
        { team: "A", total: total(teamA), count: teamA.length },
        { team: "B", total: total(teamB), count: teamB.length },
      ],
      winner: submission.winnerTeam,
      ratedMatchesByPlayer: Object.fromEntries(
        accounts.map((player) => [player.accountId!, profiles.get(player.accountId!)?.rated_matches ?? 0]),
      ),
    });
    for (const change of changes) {
      const members = change.team === "A" ? teamA : teamB;
      for (const player of members) {
        const profile = profiles.get(player.accountId!)!;
        const before = profile.rating;
        const after = clampRating(before + change.delta);
        ratingsByPlayer[player.accountId!] = { before, after, delta: after - before };
      }
    }
    void settled;
    void kFactor;
  }

  const createdAt = now();
  const statements: D1PreparedStatement[] = [
    env.GBW_DB.prepare(
      `INSERT INTO match_record (match_id, room_code, player_count, team_a_slots, team_b_slots, winner_team, ranked,
                                 ruleset_version, duration_ms, started_at, ended_at, submitted_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      submission.matchId,
      submission.roomCode,
      submission.players.length,
      submission.players.filter((player) => player.team === "A").length,
      submission.players.filter((player) => player.team === "B").length,
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

  for (const player of accounts) {
    const rating = ratingsByPlayer[player.accountId!];
    const result =
      submission.abandoned || submission.winnerTeam === null
        ? submission.abandoned
          ? "abandon"
          : "loss"
        : player.team === submission.winnerTeam
          ? "win"
          : "loss";
    statements.push(
      env.GBW_DB.prepare(
        `INSERT INTO match_player (match_id, account_id, slot, result, damage_dealt, shots_fired, hits, rating_before, rating_after)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        submission.matchId,
        player.accountId,
        player.slot,
        result,
        player.damageDealt,
        player.shotsFired,
        player.hits,
        rating?.before ?? null,
        rating?.after ?? null,
      ),
    );
    if (rating) {
      statements.push(
        env.GBW_DB.prepare(
          `INSERT INTO rating_history (account_id, match_id, rating, delta, created_at) VALUES (?, ?, ?, ?, ?)`,
        ).bind(player.accountId, submission.matchId, rating.after, rating.delta, createdAt),
        env.GBW_DB.prepare(
          `UPDATE profile SET rating = ?, rated_matches = rated_matches + 1, updated_at = ? WHERE account_id = ?`,
        ).bind(rating.after, createdAt, player.accountId),
      );
    }
  }

  await env.GBW_DB.batch(statements);

  return Response.json(
    {
      matchId: submission.matchId,
      ranked,
      rankedReason,
      ratings: accounts.map((player) => ({
        accountId: player.accountId,
        before: ratingsByPlayer[player.accountId!]?.before ?? profiles.get(player.accountId!)?.rating ?? null,
        after: ratingsByPlayer[player.accountId!]?.after ?? profiles.get(player.accountId!)?.rating ?? null,
      })),
    },
    { status: 201 },
  );
}

export async function myMatches(request: Request, env: Env, session: SessionToken): Promise<Response> {
  if (session.sub.kind !== "account" || !session.sub.accountId) {
    throw new ProblemError("unauthenticated", "Match history needs a signed-in account");
  }
  const url = new URL(request.url);
  const limit = limitOf(url, 20);
  const cursor = url.searchParams.get("cursor");
  const rows = await env.GBW_DB.prepare(
    `SELECT m.match_id, m.room_code, m.winner_team, m.ranked, m.started_at, m.ended_at,
            p.result, p.damage_dealt, p.shots_fired, p.hits, p.rating_before, p.rating_after
       FROM match_player p JOIN match_record m ON m.match_id = p.match_id
      WHERE p.account_id = ? ${cursor ? "AND m.ended_at < ?" : ""}
      ORDER BY m.ended_at DESC LIMIT ?`,
  )
    .bind(...(cursor ? [session.sub.accountId, atob(cursor), limit + 1] : [session.sub.accountId, limit + 1]))
    .all<Record<string, unknown>>();
  const results = rows.results ?? [];
  const page = results.slice(0, limit);
  const last = page[page.length - 1];
  return Response.json({
    items: page.map((row) => ({
      matchId: row["match_id"],
      roomCode: row["room_code"],
      result: row["result"],
      ranked: row["ranked"] === 1,
      opponentTeam: row["winner_team"],
      damageDealt: row["damage_dealt"],
      shotsFired: row["shots_fired"],
      hits: row["hits"],
      ratingBefore: row["rating_before"],
      ratingAfter: row["rating_after"],
      endedAt: row["ended_at"],
    })),
    next_cursor: results.length > limit && last ? encodeCursor(String(last["ended_at"])) : null,
    has_more: results.length > limit,
  });
}
