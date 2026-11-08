// @vitest-environment jsdom
/**
 * `TC-RANK-144` … `TC-RANK-147` — the leaderboard screen (`screens/leaderboard.md`, `US-RANK-004` AC3–AC5, AC7).
 *
 * The API client is faked at its module boundary, so the screen is exercised exactly as the browser runs it:
 * the list arrives as `{ items, you }` and the DOM is what the player sees. The cases that need a real cursor
 * and a real cache header are the Worker's (`apps/worker/tests/leaderboard.test.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LocaleProvider, SessionProvider } from "../src/app/providers";
import { LeaderboardPage, leaderboardName } from "../src/routes/LeaderboardPage";
import type * as ApiModule from "../src/lib/api";
import copy from "../src/i18n/vi.json";

const client = vi.hoisted(() => ({
  leaderboard: vi.fn(),
  createGuestSession: vi.fn(),
  me: vi.fn(),
}));

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, api: client };
});

const ACCOUNT = {
  token: "test-account-token",
  expiresAt: Date.now() + 3_600_000,
  subject: { kind: "account", accountId: "acc_me", displayName: "Bao" },
};

interface Row {
  readonly rank: number;
  readonly displayName: string;
  readonly avatarId: string;
  readonly rating: number;
  readonly ratedMatches: number;
}

function row(rank: number, extra: Partial<Row> = {}): Row {
  return { rank, displayName: `P${rank}`, avatarId: "avatar-01", rating: 1600 - rank, ratedMatches: 20, ...extra };
}

/** Twenty rows: the documented default page (`api/matches.md` § GET /leaderboard). */
function page(count = 20): Row[] {
  return Array.from({ length: count }, (_unused, index) => row(index + 1));
}

function serves(overrides: Partial<{ items: Row[]; next_cursor: string | null; has_more: boolean; you: { rank: number; rating: number } | null }> = {}): void {
  client.leaderboard.mockResolvedValue({
    items: page(),
    next_cursor: null,
    has_more: false,
    you: null,
    ...overrides,
  });
}

function mount(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <LocaleProvider>
        <SessionProvider>
          <LeaderboardPage />
        </SessionProvider>
      </LocaleProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  document.documentElement.lang = "";
  client.leaderboard.mockReset();
  client.me.mockReset();
  client.createGuestSession.mockResolvedValue({
    sessionToken: "guest-token",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    subject: { kind: "guest", guestId: "guest_1", displayName: "Khách" },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TC-RANK-144: the caller's own row (AC3)", () => {
  it("shows the rank in a footer when the caller is outside the page, without a tinted row", async () => {
    sessionStorage.setItem("gbw.session", JSON.stringify(ACCOUNT));
    serves({ you: { rank: 42, rating: 1338 } });
    mount();

    await waitFor(() => expect(screen.getByTestId("leaderboard-you")).toBeInTheDocument());
    expect(screen.getByTestId("leaderboard-you")).toHaveTextContent("#42");
    expect(screen.getByTestId("leaderboard-you")).toHaveTextContent("1338");
    // Nothing on this page is the caller, so nothing is tinted and nothing claims `aria-current`.
    expect(screen.getByTestId("leaderboard-row-1")).not.toHaveClass("me");
    expect(document.querySelector("[aria-current]")).toBeNull();
  });

  it("tints and marks the row instead of adding a footer when the caller is on this page", async () => {
    sessionStorage.setItem("gbw.session", JSON.stringify(ACCOUNT));
    serves({ you: { rank: 3, rating: 1597 } });
    mount();

    const mine = await screen.findByTestId("leaderboard-row-3");
    expect(mine).toHaveClass("me");
    expect(mine).toHaveAttribute("aria-current", "true");
    expect(screen.queryByTestId("leaderboard-you")).toBeNull();
  });
});

describe("TC-RANK-144: paging to the caller's own row (AC3)", () => {
  it("keeps the footer until the page that holds the caller's row arrives", async () => {
    sessionStorage.setItem("gbw.session", JSON.stringify(ACCOUNT));
    client.leaderboard
      .mockResolvedValueOnce({ items: page(), next_cursor: "c1", has_more: true, you: { rank: 24, rating: 1576 } })
      .mockResolvedValueOnce({
        items: Array.from({ length: 20 }, (_unused, index) => row(index + 21)),
        next_cursor: null,
        has_more: false,
        you: { rank: 24, rating: 1576 },
      });
    mount();

    await waitFor(() => expect(screen.getByTestId("leaderboard-you")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: copy["leaderboard.loadMore"] }));

    await waitFor(() => expect(screen.getByTestId("leaderboard-row-24")).toHaveClass("me"));
    expect(screen.queryByTestId("leaderboard-you")).toBeNull();
    // The cursor travels to the second request, so the screen asks for the page after the one it holds.
    expect(client.leaderboard).toHaveBeenLastCalledWith("c1", ACCOUNT.token);
  });

  it("drops the footer when a later page answers `you: null` (the session aged out)", async () => {
    sessionStorage.setItem("gbw.session", JSON.stringify(ACCOUNT));
    client.leaderboard
      .mockResolvedValueOnce({ items: page(), next_cursor: "c1", has_more: true, you: { rank: 42, rating: 1338 } })
      .mockResolvedValueOnce({
        items: Array.from({ length: 20 }, (_unused, index) => row(index + 21)),
        next_cursor: null,
        has_more: false,
        you: null,
      });
    mount();

    await waitFor(() => expect(screen.getByTestId("leaderboard-you")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: copy["leaderboard.loadMore"] }));

    await waitFor(() => expect(screen.getByTestId("leaderboard-row-40")).toBeInTheDocument());
    expect(screen.queryByTestId("leaderboard-you")).toBeNull();
  });
});

describe("TC-RANK-144: a rank that moves between two snapshots (AC3)", () => {
  it("prints a repeated rank once instead of two rows", async () => {
    // `LIMIT/OFFSET` over a 30-second snapshot: the row that held rank 20 on page one may be rank 21 by page two.
    sessionStorage.setItem("gbw.session", JSON.stringify(ACCOUNT));
    client.leaderboard
      .mockResolvedValueOnce({ items: page(), next_cursor: "c1", has_more: true, you: null })
      .mockResolvedValueOnce({
        items: [row(20, { displayName: "Shifted" }), ...Array.from({ length: 2 }, (_unused, index) => row(index + 21))],
        next_cursor: null,
        has_more: false,
        you: null,
      });
    mount();

    await waitFor(() => expect(screen.getByTestId("leaderboard-row-19")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: copy["leaderboard.loadMore"] }));

    await waitFor(() => expect(screen.getByTestId("leaderboard-row-22")).toBeInTheDocument());
    expect(screen.getAllByTestId("leaderboard-row-20")).toHaveLength(1);
    expect(screen.getByTestId("leaderboard-row-20")).toHaveTextContent("P20");
  });

  it("does not tint a stranger who now holds the caller's rank", async () => {
    // Server row 20 is rated 1580; `you` says the caller holds rank 20 at 1579, so the two are different people.
    sessionStorage.setItem("gbw.session", JSON.stringify(ACCOUNT));
    client.leaderboard
      .mockResolvedValueOnce({ items: page(), next_cursor: "c1", has_more: true, you: null })
      .mockResolvedValueOnce({
        items: Array.from({ length: 4 }, (_unused, index) => row(index + 21)),
        next_cursor: null,
        has_more: false,
        you: { rank: 20, rating: 1579 },
      });
    mount();

    await waitFor(() => expect(screen.getByTestId("leaderboard-row-19")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: copy["leaderboard.loadMore"] }));

    await waitFor(() => expect(screen.getByTestId("leaderboard-you")).toBeInTheDocument());
    expect(screen.getByTestId("leaderboard-you")).toHaveTextContent("#20");
    expect(screen.getByTestId("leaderboard-row-20")).not.toHaveClass("me");
    expect(screen.getByTestId("leaderboard-row-20")).not.toHaveAttribute("aria-current");
  });
});

describe("TC-RANK-164: a failed read and an empty board", () => {
  it("states the failure and refetches the first page on retry", async () => {
    // The read keeps failing until the retry, which is what the button is for.
    client.leaderboard.mockRejectedValue(new Error("offline"));
    mount();

    const alert = await screen.findByTestId("leaderboard-error");
    expect(alert).toHaveTextContent(copy["leaderboard.error"]);

    client.leaderboard.mockResolvedValue({ items: page(), next_cursor: null, has_more: false, you: null });
    fireEvent.click(screen.getByRole("button", { name: copy["common.retry"] }));

    await waitFor(() => expect(screen.getByTestId("leaderboard-row-1")).toBeInTheDocument());
    expect(screen.queryByTestId("leaderboard-error")).toBeNull();
    // The retry asks for the first page again, never for the cursor the failed read held.
    expect(client.leaderboard.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(client.leaderboard.mock.calls.at(-1)?.[0]).toBeNull();
  });

  it("offers a route back to the menu on an empty board", async () => {
    serves({ items: [] });
    mount();

    const cta = await screen.findByRole("link", { name: copy["leaderboard.emptyCta"] });
    expect(cta).toHaveAttribute("href", "/");
  });
});

describe("TC-RANK-145: the low-sample badge (AC4)", () => {
  it("marks a row with fewer than ten rated matches and leaves ten unmarked", async () => {
    serves({ items: [row(1, { ratedMatches: 9 }), row(2, { ratedMatches: 10 })] });
    mount();

    const rookie = await screen.findByTestId("leaderboard-row-1");
    expect(rookie).toHaveTextContent(copy["leaderboard.newPlayer"]);
    expect(screen.getByTestId("leaderboard-row-2")).not.toHaveTextContent(copy["leaderboard.newPlayer"]);
  });
});

describe("TC-RANK-146: a hostile or long display name (AC5)", () => {
  it("renders markup as text, not as nodes", async () => {
    serves({ items: [row(1, { displayName: "<b>Bao</b>" })] });
    mount();

    const mine = await screen.findByTestId("leaderboard-row-1");
    expect(mine).toHaveTextContent("<b>Bao</b>");
    expect(mine.querySelector("b")).toBeNull();
  });

  it("clips a name longer than sixteen characters and leaves a shorter one alone", async () => {
    const long = "Nguyễn Văn Bảo Lộc";
    serves({ items: [row(1, { displayName: long }), row(2, { displayName: "Bảo" })] });
    mount();

    const clipped = await screen.findByTestId("leaderboard-row-1");
    expect(clipped).toHaveTextContent(`${Array.from(long).slice(0, 16).join("")}…`);
    expect(clipped).not.toHaveTextContent(long);
    expect(screen.getByTestId("leaderboard-row-2")).toHaveTextContent("Bảo");
  });

  it("counts an emoji sequence as one character when clipping", () => {
    // A ZWJ family is one grapheme: a code-unit `slice` would cut it mid-sequence and print a broken glyph.
    expect(leaderboardName("👨‍👩‍👧‍👦".repeat(16))).toBe("👨‍👩‍👧‍👦".repeat(16));
    expect(leaderboardName("👨‍👩‍👧‍👦".repeat(17))).toBe(`${"👨‍👩‍👧‍👦".repeat(16)}…`);
  });
});

describe("TC-RANK-147: signed out (AC7)", () => {
  it("renders the list with no footer and no `GET /me`", async () => {
    serves();
    mount();

    await waitFor(() => expect(screen.getByTestId("leaderboard-row-1")).toBeInTheDocument());
    expect(screen.queryByTestId("leaderboard-you")).toBeNull();
    expect(client.me).not.toHaveBeenCalled();
  });
});
