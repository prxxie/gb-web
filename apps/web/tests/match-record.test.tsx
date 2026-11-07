// @vitest-environment jsdom
/**
 * `US-RANK-005` AC1 on the match side: the host ends the match, the room records it, and the payload the
 * result screen reads carries the deltas the room sent — not ones the client computed.
 *
 * The renderer, the engine's end condition, the socket and the mesh are mocked: this file is about the
 * handover, and every one of them has its own suite elsewhere.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type { BattleCallbacks } from "../src/game/scene";
import type { ServerMessage } from "../src/net/signaling";

const capture: { options: { onMessage: (message: ServerMessage) => void } | null } = { options: null };
const send = vi.fn();
let callbacks: BattleCallbacks | null = null;

vi.mock("../src/game/scene", () => ({
  mountBattle: (options: { callbacks: BattleCallbacks }) => {
    callbacks = options.callbacks;
    return { setState: vi.fn(), setAimAllowed: vi.fn(), setWeaponSlot: vi.fn(), setAimDelta: vi.fn(), destroy: vi.fn() };
  },
}));

/** End the match on the first input, so the page's `status === "ended"` path runs without a simulation. */
vi.mock("@gbw/core", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    applyInput: (state: { players: readonly { team: "A" | "B" }[]; seq: number }) => ({
      state: {
        ...state,
        status: "ended",
        winnerTeam: state.players[0]?.team ?? "A",
        seq: state.seq + 1,
        turn: { ...(state as { turn?: object }).turn, activeSlot: 0 },
      },
      events: [{ kind: "end", winner: state.players[0]?.team ?? "A", scores: { A: 0, B: 0 } }],
    }),
  };
});

vi.mock("../src/net/reconnect", () => ({
  connectWithReconnect: (options: { onMessage: (message: ServerMessage) => void }) => {
    capture.options = options;
    return { send, close: vi.fn(), stop: vi.fn(), readyState: 1 };
  },
}));

vi.mock("../src/net/mesh", () => ({
  createMesh: () => ({
    addPeer: vi.fn(),
    removePeer: vi.fn(),
    broadcast: vi.fn(),
    sendControl: vi.fn(),
    sendControlAll: vi.fn(),
    applySignal: vi.fn(),
    close: vi.fn(),
  }),
}));

vi.mock("../src/lib/api", () => ({
  api: { turnCredentials: async () => ({ iceServers: [], ttl: 600 }) },
  ApiError: class extends Error {},
  errorMessage: () => "failed",
}));

vi.mock("../src/lib/session", () => ({
  currentSession: () => ({
    token: "t-account",
    expiresAt: Date.now() + 3_600_000,
    subject: { kind: "account", accountId: "acc-1", displayName: "An" },
  }),
  ensureSession: async () => null,
}));

const { MatchPage } = await import("../src/routes/MatchPage");
const { LocaleProvider, SessionProvider } = await import("../src/app/providers");

const SEATS = [
  { slot: 0, team: "A" as const, accountId: "acc-1", displayName: "An", mobileId: "mbl-01" },
  { slot: 1, team: "B" as const, accountId: "acc-2", displayName: "Bình", mobileId: "mbl-02" },
];

const ROOM_STARTED_AT = 1_760_000_000_000;

function plan(extra: Record<string, unknown> = {}) {
  return {
    kind: "online",
    roomCode: "AAAAAA",
    localSlot: 0,
    playerId: "p-local",
    seats: SEATS,
    seed: 7,
    mapId: "map-01",
    mode: "solo",
    maxPlayers: 2,
    hostPlayerId: "p-local",
    // The room's own clock, from `match_started`: it is half of the record's id (`AC6`).
    startedAt: ROOM_STARTED_AT,
    ...extra,
  };
}

/** The result screen, reduced to the two things this file asks of it: where it is, and what Back does. */
function ResultsStub(): JSX.Element {
  const navigate = useNavigate();
  return (
    <div>
      <p data-testid="results-stub">results</p>
      <p data-testid="results-location">{useLocation().pathname}</p>
      <button type="button" data-testid="results-back" onClick={() => void navigate(-1)}>
        back
      </button>
    </div>
  );
}

function mount(): void {
  render(
    <LocaleProvider>
      <SessionProvider>
        <MemoryRouter initialEntries={["/match/AAAAAA"]}>
          <Routes>
            <Route path="/match/:code" element={<MatchPage />} />
            <Route path="/results/:code" element={<ResultsStub />} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </LocaleProvider>,
  );
}

const RECORDED: ServerMessage = {
  t: "match_recorded",
  matchId: `AAAAAA-${ROOM_STARTED_AT}`,
  winnerTeam: "A",
  ranked: false,
  rankedReason: "ruleset_mismatch",
  ratings: [
    { accountId: "acc-1", before: 1284, after: 1296, delta: 12 },
    { accountId: "acc-2", before: 1300, after: 1288, delta: -12 },
  ],
  players: [
    { slot: 0, result: "win" },
    { slot: 1, result: "loss" },
  ],
};

function stored(): Record<string, unknown> {
  const raw = sessionStorage.getItem("gbw.result");
  expect(raw).not.toBeNull();
  return JSON.parse(raw!) as Record<string, unknown>;
}

beforeEach(() => {
  sessionStorage.clear();
  capture.options = null;
  callbacks = null;
  send.mockClear();
});

afterEach(cleanup);

describe("US-RANK-005 AC1: the host ends the match and the room records it", () => {
  it("sends match_end with the winner and the statistics", async () => {
    sessionStorage.setItem("gbw.match", JSON.stringify(plan()));
    mount();
    await waitFor(() => expect(callbacks).not.toBeNull());
    await waitFor(() => expect(capture.options).not.toBeNull());

    callbacks!.onRelease(16, 45);

    await waitFor(() => expect(send).toHaveBeenCalled());
    const ended = send.mock.calls.find((call) => (call[0] as { t?: string }).t === "match_end");
    expect(ended).toBeTruthy();
    const frame = ended![0] as { winnerTeam: string; stats: readonly { slot: number }[] };
    expect(frame.winnerTeam).toBe("A");
    expect(frame.stats.map((stat) => stat.slot)).toEqual([0, 1]);
  });

  it("writes the deltas from match_recorded into the payload the result screen reads", async () => {
    sessionStorage.setItem("gbw.match", JSON.stringify(plan()));
    mount();
    await waitFor(() => expect(capture.options).not.toBeNull());
    callbacks!.onRelease(16, 45);

    // The payload is written before the round trip, so its presence means the wait for `match_recorded` is armed.
    await waitFor(() => expect(sessionStorage.getItem("gbw.result")).not.toBeNull());
    // The room answers on the socket the match screen already holds.
    capture.options!.onMessage(RECORDED);

    await waitFor(() => expect(screen.getByTestId("results-stub")).toBeTruthy());
    const payload = stored() as {
      kind: string;
      isHost: boolean;
      startedAt: number;
      players: readonly { slot: number; result: string }[];
      submission: {
        matchId: string;
        ranked: boolean;
        rankedReason: string | null;
        ratings: readonly { accountId: string; delta: number }[];
      };
    };
    expect(payload.kind).toBe("online");
    expect(payload.isHost).toBe(true);
    // The payload carries the room's start time, so the result screen can rebuild the room's own match id.
    expect(payload.startedAt).toBe(ROOM_STARTED_AT);
    expect(payload.submission.matchId).toBe(`AAAAAA-${ROOM_STARTED_AT}`);
    expect(payload.submission.ranked).toBe(false);
    // The reason comes from the record: this client cannot derive `ruleset_mismatch` (`AC2`).
    expect(payload.submission.rankedReason).toBe("ruleset_mismatch");
    expect(payload.players.map((player) => player.result)).toEqual(["win", "loss"]);
  });

  it("TC-RANK-156: replaces its own entry, so Back cannot reopen a match that already ended", async () => {
    // The match screen leaves one entry pointing at `/results/…`; a push would leave `/match/…` behind it and
    // Back would restart a match that the room already recorded (`AC5`).
    sessionStorage.setItem("gbw.match", JSON.stringify(plan()));
    mount();
    await waitFor(() => expect(capture.options).not.toBeNull());
    callbacks!.onRelease(16, 45);
    await waitFor(() => expect(sessionStorage.getItem("gbw.result")).not.toBeNull());
    capture.options!.onMessage(RECORDED);

    await waitFor(() => expect(screen.getByTestId("results-location").textContent).toBe("/results/AAAAAA"));
    screen.getByTestId("results-back").click();
    await waitFor(() => expect(screen.getByTestId("results-location").textContent).toBe("/results/AAAAAA"));
  });
});
