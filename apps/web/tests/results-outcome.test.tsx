// @vitest-environment jsdom
/**
 * The wiring behind `US-CORE-010` AC6: the line the match screen writes is the line the result screen
 * prints. `TC-CORE-962` in `outcome.test.tsx` pins the rules; this file pins the screen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ResultsPage } from "../src/routes/ResultsPage";
import { LocaleProvider, SessionProvider } from "../src/app/providers";
import { winConditionOf } from "../src/lib/outcome";

vi.mock("../src/lib/api", () => ({
  api: { submitMatch: vi.fn(async () => ({ ranked: false, rankedReason: "guest", ratings: [] })) },
  errorMessage: () => "failed",
}));
vi.mock("../src/lib/session", async (importOriginal) => {
  const real = (await importOriginal()) as Record<string, unknown>;
  return { ...real, ensureSession: vi.fn(async () => null), currentSession: () => null };
});

const KEY = "gbw.result";

function payload(extra: Record<string, unknown> = {}) {
  return {
    roomCode: "AAAAAA",
    mode: "score",
    winnerTeam: "A" as const,
    startedAt: Date.now() - 60_000,
    endedAt: Date.now(),
    rulesetVersion: "2026-11-05",
    players: [
      { slot: 0, accountId: null, displayName: "Guest", team: "A" as const, damageDealt: 900, shotsFired: 5, hits: 4, result: "win" as const },
      { slot: 1, accountId: null, displayName: "Máy", team: "B" as const, damageDealt: 400, shotsFired: 5, hits: 2, result: "loss" as const },
    ],
    ...extra,
  };
}

function mount(): void {
  render(
    <LocaleProvider>
      <SessionProvider>
        <MemoryRouter initialEntries={["/results/AAAAAA"]}>
          <Routes>
            <Route path="/results/:code" element={<ResultsPage />} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </LocaleProvider>,
  );
}

describe("TC-CORE-962: the result screen prints the mode and the win condition (US-CORE-010 AC6)", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(cleanup);

  it("prints the line for the payload the match screen writes", async () => {
    sessionStorage.setItem(KEY, JSON.stringify(payload({ winCondition: "score-cap" })));
    mount();
    await waitFor(() => expect(screen.getByTestId("result-outcome")).toBeTruthy());
    expect(screen.getByTestId("result-outcome").textContent).toBe(
      "Chế độ Điểm số — thắng bằng: nhiều sát thương hơn khi hết số lượt",
    );
    expect(screen.getByTestId("result-banner").textContent).toBe("Đội A thắng");
  });

  it("still names the mode for a payload written before the condition existed", async () => {
    sessionStorage.setItem(KEY, JSON.stringify(payload()));
    mount();
    await waitFor(() => expect(screen.getByTestId("result-outcome")).toBeTruthy());
    expect(screen.getByTestId("result-outcome").textContent).toContain("không xác định được");
  });

  it("is what the match screen would write for a wipe, a cap and a draw", () => {
    const players = [
      { team: "A" as const, eliminated: false },
      { team: "B" as const, eliminated: true },
    ];
    expect(winConditionOf({ mode: "solo", winnerTeam: "A", players })).toBe("elimination");
    expect(winConditionOf({ mode: "score", winnerTeam: "A", players: players.map((p) => ({ ...p, eliminated: false })) })).toBe("score-cap");
    expect(winConditionOf({ mode: "score", winnerTeam: null, players })).toBe("draw");
  });
});
