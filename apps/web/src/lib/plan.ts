/**
 * The plan a match runs from (`gbw.match`).
 *
 * The lobby writes one when the host starts the match, the menu writes one for a practice match, and the
 * match screen reads it back. It lives in its own module because the result screen needs it too: `Chơi lại`
 * on a practice match starts a fresh plan without going through the menu (`US-RANK-005` AC4, AC7).
 */
import { MAPS, makeRoomCode, resolveMobileId, type Seat } from "@gbw/core";

export interface PlannedMatch {
  readonly kind: "bot" | "online";
  readonly roomCode: string;
  readonly localSlot: number;
  readonly playerId: string;
  readonly seats: readonly Seat[];
  readonly seed: number;
  readonly mapId: string;
  readonly mode: "solo" | "score" | "tag" | "jewel";
  readonly maxPlayers: number;
  readonly hostPlayerId: string;
  /**
   * The room's own start time, from `match_started` (`US-RANK-005` AC6). The record's id is
   * `${roomCode}-${startedAt}` on the room's clock, so the match must start from this number and the result
   * payload must carry it — otherwise the retry would ask the server to record a second match.
   * A practice match has no room and omits it.
   */
  readonly startedAt?: number | undefined;
}

export const PLAN_KEY = "gbw.match";

export function readPlan(): PlannedMatch | null {
  try {
    const raw = sessionStorage.getItem(PLAN_KEY);
    if (!raw) return null;
    const plan = JSON.parse(raw) as PlannedMatch;
    // A plan written before the roster changed can name a machine this build no longer ships. Normalise it here, at
    // the one place a stored plan is read, so no screen ever hands `undefined` to `getMobile` (`US-BAL-005` § 5).
    return {
      ...plan,
      seats: plan.seats.map((seat) => ({ ...seat, mobileId: resolveMobileId(seat.mobileId) })),
    };
  } catch {
    return null;
  }
}

export function writePlan(plan: PlannedMatch): void {
  try {
    sessionStorage.setItem(PLAN_KEY, JSON.stringify(plan));
  } catch {
    /* private mode blocks storage: the match screen falls back to a practice match instead */
  }
}

export interface BotMatchInput {
  readonly displayName: string;
  readonly accountId: string | null;
  readonly mobileId: string;
  /** The opponent's label, already translated: `core` carries no copy (`NFR-18`). */
  readonly botLabel: string;
  readonly mapId?: string;
}

/**
 * What a practice match gives every seat (`US-MATCH-009`).
 *
 * The wheel was built and then never had anything in it: a practice seat carried no loadout, so the six-slot tray opened on
 * an empty state in every match a developer or a new player ever started, and the item rules were unreachable without a
 * room. The kit is deliberately the items whose effect changes a shot — a heal, a wind flip, a damage buff, a terrain
 * carve and a mobility item — so one practice match exercises each item rule. It stays inside `LOADOUT_CAP` and every id
 * is a real one; a case pins both.
 */
export const PRACTICE_LOADOUT: Readonly<Record<string, number>> = {
  "itm-energy-1": 2,
  "itm-change-wind": 1,
  "itm-power-up": 1,
  "itm-bunge": 1,
  "itm-teleport": 1,
};

/** A practice match: one device, one opponent, no session and no network (`NFR-21`). */
export function botMatchPlan(input: BotMatchInput): PlannedMatch {
  const mapId = input.mapId ?? MAPS[0]?.mapId ?? "map-01";
  return {
    kind: "bot",
    roomCode: makeRoomCode(() => Math.floor(Math.random() * 31)),
    localSlot: 0,
    playerId: "local",
    seats: [
      {
        slot: 0,
        team: "A",
        accountId: input.accountId,
        displayName: input.displayName,
        mobileId: input.mobileId,
        loadout: PRACTICE_LOADOUT,
      },
      // A practice match always has an opponent, or the team check would end it on the first turn.
      {
        slot: 1,
        team: "B",
        accountId: null,
        displayName: input.botLabel,
        mobileId: "mbl-04",
        // The bot carries the same kit, so the practice is symmetric and the bot's own item rule has something to spend.
        loadout: PRACTICE_LOADOUT,
      },
    ],
    seed: Math.floor(Math.random() * 0xffffff),
    mapId,
    mode: "solo",
    maxPlayers: 2,
    hostPlayerId: "local",
  };
}
