// @vitest-environment jsdom
/**
 * `US-RANK-005` — the result screen renders what the room recorded, and never a number it made up.
 *
 * The story's criteria live here as component cases (the browser pass for the same criteria, and the
 * test-case ids, are in `tests/e2e/results.spec.ts`). The API and the session are mocked because this file is about the screen's
 * decisions: which record it trusts, what it prints for a delta, and what each action asks for.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RULESET_VERSION } from "@gbw/core";
import { ResultsPage } from "../src/routes/ResultsPage";
import { LocaleProvider, SessionProvider } from "../src/app/providers";
import type { ResultPayload } from "../src/lib/result";

const mocks = vi.hoisted(() => ({
  submitMatch: vi.fn(),
  history: vi.fn(),
  roomPreview: vi.fn(),
  createRoom: vi.fn(),
}));

vi.mock("../src/lib/api", () => {
  /** Same surface the hook narrows on: `instanceof` plus `status`/`type` (`net` layer contract). */
  class ApiError extends Error {
    readonly status: number;
    readonly type: string;
    constructor(status: number, type: string) {
      super(type);
      this.status = status;
      this.type = type;
    }
  }
  return { ApiError, api: mocks, errorMessage: () => "failed" };
});

const account = vi.hoisted(() => ({
  value: null as null | {
    readonly token: string;
    readonly expiresAt: number;
    readonly subject: { readonly kind: "account" | "guest"; readonly accountId?: string; readonly guestId?: string; readonly displayName: string };
  },
}));

vi.mock("../src/lib/session", async (importOriginal) => {
  const real = (await importOriginal()) as Record<string, unknown>;
  return { ...real, currentSession: () => account.value, ensureSession: async () => account.value };
});

const ACCOUNT = {
  token: "t-account",
  expiresAt: Date.now() + 3_600_000,
  subject: { kind: "account" as const, accountId: "acc-1", displayName: "An" },
};
const GUEST = {
  token: "t-guest",
  expiresAt: Date.now() + 3_600_000,
  subject: { kind: "guest" as const, guestId: "g-1", displayName: "Khách" },
};

const STARTED_AT = 1_760_000_000_000;

function payload(extra: Partial<ResultPayload> = {}): ResultPayload {
  return {
    roomCode: "AAAAAA",
    mode: "solo",
    winnerTeam: "A",
    startedAt: STARTED_AT,
    endedAt: STARTED_AT + 240_000,
    rulesetVersion: RULESET_VERSION,
    winCondition: "elimination",
    players: [
      { slot: 0, accountId: "acc-1", displayName: "An", team: "A", damageDealt: 340, shotsFired: 8, hits: 5, result: "win" },
      { slot: 1, accountId: "acc-2", displayName: "Bình", team: "B", damageDealt: 120, shotsFired: 6, hits: 2, result: "loss" },
    ],
    mapId: "map-01",
    maxPlayers: 2,
    mobileId: "mbl-01",
    kind: "online",
    isHost: true,
    submission: null,
    ...extra,
  };
}

const RANKED = {
  matchId: "AAAAAA-1760000000000",
  ranked: true,
  rankedReason: null,
  ratings: [
    { accountId: "acc-1", before: 1284, after: 1296, delta: 12 },
    { accountId: "acc-2", before: 1300, after: 1288, delta: -12 },
  ],
} as const;

function mount(): void {
  render(
    <LocaleProvider>
      <SessionProvider>
        <MemoryRouter initialEntries={["/results/AAAAAA"]}>
          <Routes>
            <Route path="/" element={<p data-testid="home">home</p>} />
            <Route path="/results/:code" element={<ResultsPage />} />
            <Route path="/lobby/:code" element={<p data-testid="lobby">lobby</p>} />
            <Route path="/match/:code" element={<p data-testid="match">match</p>} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </LocaleProvider>,
  );
}

function store(extra: Partial<ResultPayload> = {}): void {
  sessionStorage.setItem("gbw.result", JSON.stringify(payload(extra)));
}

beforeEach(() => {
  sessionStorage.clear();
  account.value = ACCOUNT;
  mocks.submitMatch.mockReset();
  mocks.submitMatch.mockResolvedValue({ matchId: RANKED.matchId, ranked: true, rankedReason: null, ratings: RANKED.ratings });
  mocks.history.mockReset();
  mocks.history.mockResolvedValue({ items: [], next_cursor: null, has_more: false });
  mocks.roomPreview.mockReset();
  mocks.roomPreview.mockResolvedValue({ roomCode: "AAAAAA", status: "ended", joined: 2 });
  mocks.createRoom.mockReset();
  mocks.createRoom.mockResolvedValue({ roomCode: "NEW234", playerId: "p-9", wsUrl: "wss://x", settings: {} });
});

afterEach(cleanup);

describe("US-RANK-005 AC1/AC3: every participant sees their own rating change", () => {
  it("prints both deltas from the room's record and the statistics of the match", async () => {
    store({ submission: RANKED, players: payload().players });
    mount();

    await waitFor(() => expect(screen.getByTestId("result-banner")).toBeTruthy());
    expect(screen.getByTestId("result-banner").textContent).toBe("Đội A thắng");
    // AC1: `before → after (delta)`, signed, exactly as the room sent it.
    expect(screen.getByTestId("result-rating-0").textContent).toBe("1284 → 1296 (+12)");
    expect(screen.getByTestId("result-rating-1").textContent).toBe("1300 → 1288 (-12)");
    // AC3: damage, shots and hits per player, and the viewer's row is the marked one.
    const mine = screen.getByTestId("result-row-you");
    expect(mine.textContent).toContain("340");
    expect(mine.textContent).toContain("8");
    expect(mine.textContent).toContain("5");
    expect(mine.className).toContain("me");
  });

  it("marks a guest's row from the seat the match recorded, not from an account", async () => {
    account.value = GUEST;
    store({
      localSlot: 1,
      submission: RANKED,
      players: [
        { slot: 0, accountId: "acc-2", displayName: "Bình", team: "A", damageDealt: 200, shotsFired: 5, hits: 3, result: "win" },
        { slot: 1, accountId: null, displayName: "Khách", team: "B", damageDealt: 90, shotsFired: 4, hits: 1, result: "loss" },
      ],
    });
    mount();
    await waitFor(() => expect(screen.getByTestId("result-row-you")).toBeTruthy());
    expect(screen.getByTestId("result-row-you").textContent).toContain("Khách");
  });

  it("does not ask the API to record the match a second time", async () => {
    store({ submission: RANKED });
    mount();
    await waitFor(() => expect(screen.getByTestId("result-banner")).toBeTruthy());
    expect(mocks.submitMatch).not.toHaveBeenCalled();
  });
});

describe("US-RANK-005 AC2/AC7: an unranked match states the reason", () => {
  it("prints no rating numbers for a guest match, only the reason", async () => {
    store({ submission: { ranked: false, rankedReason: "guest", ratings: [] } });
    mount();
    await waitFor(() => expect(screen.getByTestId("result-reason")).toBeTruthy());
    expect(screen.getByTestId("result-reason").textContent).toBe("Trận này không tính điểm");
    expect(screen.getByTestId("result-rating-0").textContent).toBe("—");
    expect(screen.getByTestId("result-rating-1").textContent).toBe("—");
  });

  it("says a practice match is not rated and never calls the API", async () => {
    store({
      kind: "bot",
      submission: { ranked: false, rankedReason: "bot", ratings: [] },
      players: [
        { slot: 0, accountId: null, displayName: "Khách", team: "A", damageDealt: 210, shotsFired: 6, hits: 3, result: "win" },
        { slot: 1, accountId: null, displayName: "Máy", team: "B", damageDealt: 40, shotsFired: 4, hits: 1, result: "loss" },
      ],
    });
    mount();
    await waitFor(() => expect(screen.getByTestId("result-reason")).toBeTruthy());
    expect(screen.getByTestId("result-reason").textContent).toBe("Đấu với máy — không tính điểm");
    expect(mocks.submitMatch).not.toHaveBeenCalled();
  });

  it("names a ruleset mismatch even though this client can never see one on its own", async () => {
    store({ submission: { ranked: false, rankedReason: "ruleset_mismatch", ratings: [] } });
    mount();
    await waitFor(() => expect(screen.getByTestId("result-reason")).toBeTruthy());
    expect(screen.getByTestId("result-reason").textContent).toBe("Luật chơi đã đổi — không tính điểm");
  });

  it("says nothing about an old payload whose room never sent a reason", async () => {
    // A record without a `rankedReason` could be an unrated guest match or a rated one whose write was lost,
    // so the screen prints no reason instead of guessing one.
    store({ winnerTeam: null, submission: { ranked: false, rankedReason: null, ratings: [] } });
    mount();
    await waitFor(() => expect(screen.getByTestId("result-banner")).toBeTruthy());
    expect(screen.getByTestId("result-banner").textContent).toBe("Hoà");
    expect(screen.queryByTestId("result-reason")).toBeNull();
  });
});

describe("US-RANK-005 AC6: a lost record can be sent again", () => {
  const failed = { ranked: false, rankedReason: null, ratings: [], failed: true } as const;

  it("offers the host a retry that renders the deltas it brings back", async () => {
    store({ submission: failed });
    mount();
    await waitFor(() => expect(screen.getByTestId("result-retry")).toBeTruthy());
    expect(screen.getByTestId("result-record-failed").textContent).toBe("Không ghi được kết quả");

    await userEvent.click(screen.getByTestId("result-retry"));

    await waitFor(() => expect(screen.getByTestId("result-rating-0").textContent).toBe("1284 → 1296 (+12)"));
    expect(screen.queryByTestId("result-record-failed")).toBeNull();
  });

  it("sends the match id the room used, as the idempotency key, on every press", async () => {
    store({ submission: failed });
    mount();
    await waitFor(() => expect(screen.getByTestId("result-retry")).toBeTruthy());
    await userEvent.click(screen.getByTestId("result-retry"));
    await waitFor(() => expect(mocks.submitMatch).toHaveBeenCalledTimes(1));
    const [, body, key] = mocks.submitMatch.mock.calls[0] as [string, { matchId: string }, string];
    expect(body.matchId).toBe("AAAAAA-1760000000000");
    expect(key).toBe("AAAAAA-1760000000000");
    expect(mocks.submitMatch.mock.calls[0]?.[0]).toBe("t-account");
  });

  it("shows the failure without a button to a guest host, who could only be refused", async () => {
    account.value = GUEST;
    store({ submission: failed });
    mount();
    await waitFor(() => expect(screen.getByTestId("result-record-failed")).toBeTruthy());
    // `POST /matches` needs an account, so a retry from a guest would fail on arrival (`AC6`).
    expect(screen.queryByTestId("result-retry")).toBeNull();
    expect(mocks.submitMatch).not.toHaveBeenCalled();
  });

  it("shows the stored record when a 409 says the match is already recorded", async () => {
    const { ApiError } = await import("../src/lib/api");
    mocks.submitMatch.mockRejectedValueOnce(new ApiError(409, "match-already-recorded"));
    mocks.history.mockResolvedValueOnce({
      items: [
        {
          matchId: "AAAAAA-1760000000000",
          playedAt: new Date(STARTED_AT).toISOString(),
          team: "A",
          result: "win",
          playerCount: 2,
          opponents: [{ displayName: "Bình", team: "B" }],
          damageDealt: 340,
          shotsFired: 8,
          hits: 5,
          ratingDelta: 12,
          ranked: true,
          rankedReason: null,
          rulesetVersion: RULESET_VERSION,
        },
      ],
      next_cursor: null,
      has_more: false,
    });
    store({ submission: failed });
    mount();
    await waitFor(() => expect(screen.getByTestId("result-retry")).toBeTruthy());

    await userEvent.click(screen.getByTestId("result-retry"));

    // The record already exists, so the screen shows it — never a "recorded" badge around invented numbers.
    await waitFor(() => expect(screen.getByTestId("result-rating").textContent).toContain("+12"));
    expect(screen.queryByTestId("result-record-failed")).toBeNull();
    expect(screen.queryByTestId("result-error")).toBeNull();
  });

  it("stops offering a retry when a 409 cannot read the record back", async () => {
    // The server said the match exists; the history lookup then failed. Asking again could only be refused
    // again, so the failure line and the button go and the deltas print as unknown.
    const { ApiError } = await import("../src/lib/api");
    mocks.submitMatch.mockRejectedValueOnce(new ApiError(409, "match-already-recorded"));
    mocks.history.mockRejectedValueOnce(new ApiError(401, "unauthenticated"));
    store({ submission: failed });
    mount();
    await waitFor(() => expect(screen.getByTestId("result-retry")).toBeTruthy());

    await userEvent.click(screen.getByTestId("result-retry"));

    await waitFor(() => expect(screen.queryByTestId("result-retry")).toBeNull());
    expect(screen.queryByTestId("result-record-failed")).toBeNull();
    expect(screen.queryByTestId("result-error")).toBeNull();
    expect(screen.getByTestId("result-rating-0").textContent).toBe("—");
    // Written down too, so a reload does not ask the same question again.
    const written = JSON.parse(sessionStorage.getItem("gbw.result") ?? "{}") as {
      submission?: { unresolved?: boolean };
    };
    expect(written.submission?.unresolved).toBe(true);
  });

  it("offers no retry for a match that ended without a winner, which the API would refuse", async () => {
    store({ winnerTeam: null, submission: failed });
    mount();
    await waitFor(() => expect(screen.getByTestId("result-record-failed")).toBeTruthy());
    // `POST /matches` answers "winnerTeam must be A or B", so the button could only ever fail (`AC6`).
    expect(screen.queryByTestId("result-retry")).toBeNull();
  });
});

describe("US-RANK-005 AC4: Chơi lại finds a lobby", () => {
  it("returns to the same lobby while the room still answers", async () => {
    store({ submission: RANKED });
    mount();
    await waitFor(() => expect(screen.getByTestId("result-rematch")).toBeTruthy());

    await userEvent.click(screen.getByTestId("result-rematch"));

    await waitFor(() => expect(screen.getByTestId("lobby")).toBeTruthy());
    expect(mocks.createRoom).not.toHaveBeenCalled();
  });

  it("creates a room with the same settings when the old code is closed", async () => {
    const { ApiError } = await import("../src/lib/api");
    mocks.roomPreview.mockRejectedValueOnce(new ApiError(410, "room-closed"));
    store({ submission: RANKED, maxPlayers: 4, mode: "score", mapId: "map-02" });
    mount();
    await waitFor(() => expect(screen.getByTestId("result-rematch")).toBeTruthy());

    await userEvent.click(screen.getByTestId("result-rematch"));

    await waitFor(() => expect(screen.getByTestId("lobby")).toBeTruthy());
    expect(mocks.createRoom).toHaveBeenCalledWith(
      "t-account",
      expect.objectContaining({ maxPlayers: 4, mode: "score", mapId: "map-02", mobileId: "mbl-01" }),
    );
    expect(sessionStorage.getItem("gbw.room.NEW234")).toBe("p-9");
  });

  it("names the new room after the seat that played, not after seat 0", async () => {
    const { ApiError } = await import("../src/lib/api");
    mocks.roomPreview.mockRejectedValueOnce(new ApiError(410, "room-closed"));
    store({
      localSlot: 1,
      submission: RANKED,
      players: [
        { slot: 0, accountId: "acc-2", displayName: "Bình", team: "A", damageDealt: 200, shotsFired: 5, hits: 3, result: "win" },
        { slot: 1, accountId: "acc-1", displayName: "An", team: "B", damageDealt: 90, shotsFired: 4, hits: 1, result: "loss" },
      ],
    });
    mount();
    await waitFor(() => expect(screen.getByTestId("result-rematch")).toBeTruthy());

    await userEvent.click(screen.getByTestId("result-rematch"));

    await waitFor(() => expect(mocks.createRoom).toHaveBeenCalled());
    expect(mocks.createRoom.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ displayName: "An" }));
  });

  it("keeps the player on the screen when the preview fails for a reason other than a closed room", async () => {
    const { ApiError } = await import("../src/lib/api");
    mocks.roomPreview.mockRejectedValueOnce(new ApiError(500, "internal"));
    store({ submission: RANKED });
    mount();
    await waitFor(() => expect(screen.getByTestId("result-rematch")).toBeTruthy());

    await userEvent.click(screen.getByTestId("result-rematch"));

    await waitFor(() => expect(screen.getByTestId("result-error")).toBeTruthy());
    // A 500 is not a closed room: creating a different room would lose the player's lobby silently (`AC4`).
    expect(mocks.createRoom).not.toHaveBeenCalled();
  });
});

describe("a reload without the payload trusts the account's newest record", () => {
  it("shows the record the history returns", async () => {
    mocks.history.mockResolvedValueOnce({
      items: [
        {
          matchId: "m-1",
          playedAt: new Date(STARTED_AT).toISOString(),
          team: "B",
          result: "loss",
          playerCount: 2,
          opponents: [{ displayName: "An", team: "A" }],
          damageDealt: 88,
          shotsFired: 4,
          hits: 1,
          ratingDelta: -7,
          ranked: true,
          rankedReason: null,
          rulesetVersion: RULESET_VERSION,
        },
      ],
      next_cursor: null,
      has_more: false,
    });
    sessionStorage.clear();
    mount();

    await waitFor(() => expect(screen.getByTestId("result-banner")).toBeTruthy());
    expect(screen.getByTestId("result-banner").textContent).toBe("Đội A thắng");
    expect(screen.getByTestId("result-rating").textContent).toContain("-7");
    // The history has no room code, so the screen says which match it is showing rather than claiming it is this one.
    expect(screen.getByTestId("result-recovered").textContent).toBe("Trận gần nhất trong lịch sử của bạn");
    expect(mocks.submitMatch).not.toHaveBeenCalled();
  });

  it("says the match is over when there is no record at all", async () => {
    sessionStorage.clear();
    mount();
    await waitFor(() => expect(screen.getByTestId("result-banner")).toBeTruthy());
    expect(screen.getByTestId("result-banner").textContent).toBe("Trận đã kết thúc");
  });

  it("sends a guest with nothing to show home", async () => {
    account.value = GUEST;
    sessionStorage.clear();
    mount();
    await waitFor(() => expect(screen.getByTestId("home")).toBeTruthy());
  });
});
