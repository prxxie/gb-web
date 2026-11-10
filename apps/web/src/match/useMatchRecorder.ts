/**
 * The result hand-off (`US-RANK-005`).
 *
 * A finished match becomes one stored payload and one navigation, and an online room's `match_recorded` replaces
 * whatever this client guessed with the record's own deltas. The wait for that answer lives in refs here, so a screen
 * the player walked away from can never be dragged back to.
 */
import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { MatchState } from "@gbw/core";
import { winConditionOf } from "../lib/outcome";
import { writeResult, type RecordedMatch, type ResultPayload } from "../lib/result";
import type { PlannedMatch } from "../lib/plan";
import type { MatchStatus, MatchWiring } from "./wiring";

/**
 * How long a finished match waits for the room's `match_recorded` before the screen offers a retry
 * (`US-RANK-005` AC6). The round trip is one D1 batch; a room that has not answered in five seconds is
 * better shown as "not recorded yet" than a screen that never appears.
 */
export const RECORD_TIMEOUT_MS = 5_000;

/**
 * The seats with the result the record gave them: the room decides who won, lost or walked out, and the
 * screen must not keep a second opinion (`US-RANK-005` AC3, `signaling.md` § match_recorded).
 */
function withRecordedResults(
  players: ResultPayload["players"],
  recorded: Pick<RecordedMatch, "results">,
): ResultPayload["players"] {
  if (!recorded.results || recorded.results.length === 0) return players;
  const bySlot = new Map(recorded.results.map((entry) => [entry.slot, entry.result]));
  return players.map((player) => {
    const result = bySlot.get(player.slot);
    return result ? { ...player, result } : player;
  });
}

export interface MatchRecorderOptions {
  readonly plan: PlannedMatch | null;
  readonly setStatus: (status: MatchStatus) => void;
  readonly wiring: MatchWiring;
}

export interface MatchRecorder {
  /** Hand a finished state over to the results screen, once. */
  readonly finish: (final: MatchState) => void;
  /** The room's answer to `match_end`, forwarded from the socket. */
  readonly onRecorded: (recorded: RecordedMatch) => void;
}

export function useMatchRecorder(options: MatchRecorderOptions): MatchRecorder {
  const { plan, setStatus, wiring } = options;
  const { hostPlayerId, socket } = wiring;
  const navigate = useNavigate();
  /** A finished match hands over exactly once (`US-MATCH-001` AC7). */
  const ended = useRef(false);
  /** Resolves the wait for `match_recorded` started by `finish`; `null` when no result is pending (`AC6`). */
  const recording = useRef<((recorded: RecordedMatch) => void) | null>(null);
  /** The same wait's other end, and its timer, so a finished screen can disarm both on unmount. */
  const resolveRecording = useRef<((recorded: RecordedMatch) => void) | null>(null);
  const recordTimer = useRef<number | null>(null);

  // Leaving the screen forgets a record still in flight: its answer would navigate from a dead page.
  useEffect(
    () => () => {
      if (recordTimer.current !== null) window.clearTimeout(recordTimer.current);
      recordTimer.current = null;
      resolveRecording.current = null;
      recording.current = null;
    },
    [],
  );

  const finish = useCallback(
    (final: MatchState) => {
      if (ended.current) return;
      ended.current = true;
      setStatus("ended");
      const local = final.players.find((player) => player.slot === plan?.localSlot) ?? null;
      const payload: ResultPayload = {
        roomCode: final.roomCode,
        mode: final.mode,
        winnerTeam: final.winnerTeam,
        startedAt: final.startedAt,
        endedAt: Date.now(),
        rulesetVersion: final.rulesetVersion,
        // Which rule ended it, for the result screen (`US-CORE-010` AC6): the engine keeps only the
        // winner, so the condition is read back with the same rules `conclusionOf` used.
        winCondition: winConditionOf(final),
        players: final.players.map((player) => ({
          slot: player.slot,
          accountId: player.accountId,
          displayName: player.displayName,
          team: player.team,
          damageDealt: player.damageDealt,
          shotsFired: player.shotsFired,
          hits: player.hits,
          result: final.winnerTeam === null ? "abandon" : final.winnerTeam === player.team ? "win" : "loss",
        })),
        localSlot: plan?.localSlot ?? 0,
        mapId: final.mapId,
        maxPlayers: plan?.maxPlayers ?? final.players.length,
        mobileId: local?.mobileId ?? "mbl-01",
        kind: plan?.kind === "online" ? "online" : "bot",
        // The host is who runs the simulation now, not who created the room: a migration moves the role
        // (`US-NET-003` AC2), and only the host may name the winner (`signaling.md` § match_end).
        isHost: plan?.kind === "online" ? plan.playerId === hostPlayerId.current : true,
        submission: null,
      };

      // A practice match never leaves the device: there is nothing to record and the screen says so
      // (`US-RANK-005` AC7).
      if (payload.kind === "bot") {
        writeResult({ ...payload, submission: { ranked: false, rankedReason: "bot", ratings: [] } });
        navigate(`/results/${final.roomCode}`, { replace: true });
        return;
      }

      // Written before the round trip, so a reload mid-record still lands on a result screen with the stats.
      writeResult(payload);
      if (payload.isHost) {
        // The host names the winner and the statistics the room's record is built from; every client then
        // waits for the broadcast that carries the deltas, because a finished room refuses new sockets
        // (`signaling.md` § match_end → `match_recorded`).
        socket.current?.send({
          t: "match_end",
          winnerTeam: final.winnerTeam,
          stats: final.players.map((player) => ({
            slot: player.slot,
            damageDealt: player.damageDealt,
            shotsFired: player.shotsFired,
            hits: player.hits,
          })),
        });
      }
      // A peer cannot end a match, so a room that never answers leaves the host to resubmit from the
      // result screen; the wait below is what turns that into a visible state instead of a hang (`AC6`).
      const timer = window.setTimeout(() => {
        resolveRecording.current?.({
          ranked: false,
          rankedReason: null,
          ratings: [],
          failed: true,
        });
        resolveRecording.current = null;
        // Nothing waits after this: the screen has already handed over, and this page unmounts with the
        // socket, so an answer that arrives later has no one to reach. Only a resubmit from the result screen
        // can turn that into deltas (`409` -> the stored record).
        recording.current = null;
      }, RECORD_TIMEOUT_MS);
      // Kept in refs so unmount can disarm it: a timer that fires after the player left would drag them
      // back to a result screen they already walked away from.
      recordTimer.current = timer;
      resolveRecording.current = (recorded) => {
        window.clearTimeout(timer);
        recordTimer.current = null;
        recording.current = null;
        writeResult({ ...payload, submission: recorded, players: withRecordedResults(payload.players, recorded) });
        navigate(`/results/${final.roomCode}`, { replace: true });
      };
      recording.current = (recorded) => {
        const resolve = resolveRecording.current;
        resolveRecording.current = null;
        resolve?.(recorded);
      };
    },
    [hostPlayerId, navigate, plan, setStatus, socket],
  );

  /** The socket's `match_recorded`, funnelled into whichever wait `finish` armed. */
  const onRecorded = useCallback((recorded: RecordedMatch) => {
    recording.current?.(recorded);
  }, []);

  return { finish, onRecorded };
}
