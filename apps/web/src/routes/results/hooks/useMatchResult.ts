/**
 * The state behind the result screen (`US-RANK-005`).
 *
 * Three ways into this screen and one hook to serve them:
 * - the match screen just wrote the payload, with the room's `match_recorded` inside it (the normal path);
 * - the payload is gone (a reload) and the account's newest record is all that is left;
 * - there is nothing at all, and the screen says the match is over rather than inventing numbers.
 *
 * The hook never computes a rating: a delta is shown only when the room or the API sent one.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api, errorMessage, type HistoryItem } from "../../../lib/api";
import { botMatchPlan, writePlan } from "../../../lib/plan";
import {
  readResult,
  viewerOf,
  writeResult,
  type RecordedMatch,
  type ResultPayload,
} from "../../../lib/result";
import { useLocale, useSession } from "../../../app/providers";

export type ResultView =
  /** The payload from the match screen: the only view that can show rating deltas from the room itself. */
  | { readonly status: "ready"; readonly payload: ResultPayload }
  /** A reload without the payload: the newest record of the signed-in account, minus the per-player detail. */
  | { readonly status: "recovered"; readonly record: HistoryItem }
  /** No payload and no record: a neutral "the match is over", never an invented result. */
  | { readonly status: "empty" }
  /** Nothing to show at all; the caller sends the player home. */
  | { readonly status: "missing" }
  | { readonly status: "loading" };

/** Which round trip is in flight: only a retry means "recording" (`AC6`); a rematch is just navigation. */
export type Busy = "retry" | "rematch" | null;

export interface MatchResultActions {
  readonly view: ResultView;
  readonly busy: Busy;
  readonly error: string | null;
  /** Ask the API to record the match again; safe to press twice (`AC6`). */
  readonly retry: () => Promise<void>;
  /** `Chơi lại`: back to the lobby, a new room when the old code is closed, a fresh practice match (`AC4`). */
  readonly rematch: () => Promise<void>;
}

/**
 * The body the room itself posts (`room-do.ts` § recordMatch), rebuilt from the payload.
 *
 * A retry only exists for a match that ended with a winner: `POST /matches` refuses `winnerTeam: null`
 * (`matches.ts`, "winnerTeam must be A or B"), so a draw or an abandonment cannot be recorded this way.
 */
function submissionBody(payload: ResultPayload, matchId: string): Record<string, unknown> {
  return {
    matchId,
    roomCode: payload.roomCode,
    rulesetVersion: payload.rulesetVersion,
    startedAt: new Date(payload.startedAt).toISOString(),
    endedAt: new Date(payload.endedAt).toISOString(),
    winnerTeam: payload.winnerTeam,
    // A record that reached the screen never needs a retry, so this flag can only be read off a record that
    // says so; a forfeit whose record was lost leaves no payload at all (the local match never ended).
    abandoned: payload.submission?.rankedReason === "abandoned",
    players: payload.players.map((player) => ({
      slot: player.slot,
      accountId: player.accountId,
      displayName: player.displayName,
      team: player.team,
      damageDealt: player.damageDealt,
      shotsFired: player.shotsFired,
      hits: player.hits,
    })),
  };
}

/** The record the API already holds for `matchId`, if the account's newest page still shows it. */
async function newestRecord(token: string, matchId: string): Promise<HistoryItem | null> {
  try {
    const page = await api.history(token);
    return page.items.find((item) => item.matchId === matchId) ?? null;
  } catch {
    return null;
  }
}

/** `409` means the match is already recorded — the outcome the retry wanted, not a failure (`AC6`). */
function alreadyRecorded(caught: unknown): boolean {
  return caught instanceof ApiError && (caught.status === 409 || caught.type === "match-already-recorded");
}

export function useMatchResult(roomCode: string): MatchResultActions {
  const { t } = useLocale();
  const { session, ready } = useSession();
  const navigate = useNavigate();
  const [view, setView] = useState<ResultView>({ status: "loading" });
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const account = session && session.subject.kind === "account" ? session : null;

  useEffect(() => {
    if (!ready) return;
    const stored = readResult(roomCode);
    if (stored) {
      setView({ status: "ready", payload: stored });
      return;
    }
    // Nothing in storage: a guest has no history, so there is no result to show and the menu is the answer.
    if (!account) {
      setView({ status: "missing" });
      navigate("/", { replace: true });
      return;
    }
    let live = true;
    void api
      .history(account.token)
      .then((page) => {
        if (!live) return;
        const record = page.items[0];
        setView(record ? { status: "recovered", record } : { status: "empty" });
      })
      .catch(() => {
        if (live) setView({ status: "empty" });
      });
    return () => {
      live = false;
    };
  }, [account, navigate, ready, roomCode]);

  const retry = useCallback(async () => {
    if (view.status !== "ready" || !account || busy !== null) return;
    const payload = view.payload;
    // The room submits as `idempotency-key: ${roomCode}-${startedAt}` with `startedAt` from its own clock
    // (`room-do.ts` § recordMatch), and `startedAt` in this payload is that same value — the match screen
    // seeds the engine with it. So this key is the room's key, not a client invention, and a replay is
    // answered from the stored record instead of writing a second one.
    const matchId = `${payload.roomCode}-${payload.startedAt}`;
    if (payload.startedAt <= 0) {
      // A payload from before the room's start time was carried: no key can match the room's, so no retry.
      setError(t("results.recordFailed"));
      return;
    }
    setBusy("retry");
    setError(null);
    try {
      const response = await api.submitMatch(account.token, submissionBody(payload, matchId), matchId);
      const recorded: RecordedMatch = {
        matchId: response.matchId,
        ranked: response.ranked,
        rankedReason: response.rankedReason,
        ratings: response.ratings,
      };
      writeResult({ ...payload, submission: recorded });
      setView({
        status: "ready",
        payload: { ...payload, submission: recorded },
      });
    } catch (caught) {
      if (!alreadyRecorded(caught)) {
        setError(errorMessage(caught, t));
        setBusy(null);
        return;
      }
      // Recorded already — by the room, most likely while this screen was showing "-". The deltas live in
      // the stored record, so the screen shows that record instead of inventing one (`screens/results.md`).
      const stored = await newestRecord(account.token, matchId);
      if (stored) {
        setView({ status: "recovered", record: stored });
        return;
      }
      // The lookup itself failed. The match is recorded — the server just said so — so the screen stops
      // claiming a failure and stops offering a retry that would only be refused again; the deltas are
      // unknown, which it prints as `—`. Written down as well, so a reload does not ask again.
      //
      // `ranked: true` is a placeholder: the screen never prints it, and `unresolved` is what tells the
      // difference between "rated, numbers lost" and "not rated".
      const settled: RecordedMatch = { ranked: true, rankedReason: null, ratings: [], unresolved: true };
      writeResult({ ...payload, submission: settled });
      setView({ status: "ready", payload: { ...payload, submission: settled } });
    } finally {
      setBusy(null);
    }
  }, [account, busy, t, view]);

  const rematch = useCallback(async () => {
    if (busy !== null) return;
    if (view.status !== "ready") {
      navigate("/");
      return;
    }
    const payload = view.payload;
    // The seat that played this device, not seat 0: a guest in seat 1 must not name the room after its
    // opponent (`AC4`).
    const mine = viewerOf(payload, session?.subject.accountId ?? null);
    if (payload.kind === "bot") {
      const plan = botMatchPlan({
        displayName: mine?.displayName ?? t("signIn.guest"),
        accountId: mine?.accountId ?? null,
        mobileId: payload.mobileId,
        botLabel: t("match.bot"),
        mapId: payload.mapId,
      });
      writePlan(plan);
      navigate(`/match/${plan.roomCode}`);
      return;
    }
    setBusy("rematch");
    setError(null);
    try {
      // A finished room answers `410 room-closed`, and a preview is how the screen learns that before
      // routing the player into a lobby that would only bounce them back (`AC4`).
      await api.roomPreview(roomCode);
      navigate(`/lobby/${roomCode}`);
      return;
    } catch (caught) {
      // Only a closed room earns a new one. A dropped connection or a 500 must say so, not silently put
      // the player in a different room (`AC4`).
      if (
        !(caught instanceof ApiError) ||
        !(caught.status === 404 || caught.status === 410 || caught.type === "room-closed")
      ) {
        setError(errorMessage(caught, t));
        setBusy(null);
        return;
      }
    }
    // Any session can open a room — the menu's own `POST /rooms` works for a guest (`US-ROOM-001`).
    if (!session) {
      setError(t("errors.unauthenticated"));
      setBusy(null);
      return;
    }
    try {
      const room = await api.createRoom(session.token, {
        displayName: mine?.displayName ?? session?.subject.displayName ?? t("signIn.guest"),
        mobileId: payload.mobileId,
        avatarId: session?.subject.avatarId ?? "default",
        maxPlayers: payload.maxPlayers,
        mode: payload.mode,
        mapId: payload.mapId,
      });
      // The lobby reuses the seat this call created, exactly as the menu's create-room does.
      sessionStorage.setItem(`gbw.room.${room.roomCode}`, room.playerId);
      navigate(`/lobby/${room.roomCode}`);
    } catch (caught) {
      setError(errorMessage(caught, t));
    } finally {
      setBusy(null);
    }
  }, [busy, navigate, roomCode, session, t, view]);

  return { view, busy, error, retry, rematch };
}
