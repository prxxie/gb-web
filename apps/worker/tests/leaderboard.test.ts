/**
 * `GET /leaderboard` — shape and ordering (`leaderboard.md`, `TC-RANK-104`).
 *
 * The ranking is the product's public ranking, so the order is asserted against the documented triple
 * `rating DESC, rated_matches DESC, account_id ASC`, with the inactive and never-rated account rules on top.
 */
import { describe, expect, it } from "vitest";
import { accountSubject, createRig, seedProfile, type Rig } from "./support/fake-env";

function seedBoard(rig: Rig): void {
  seedProfile(rig.db, { accountId: "acct-top", displayName: "Top", rating: 1400, ratedMatches: 12 });
  seedProfile(rig.db, { accountId: "acct-veteran", displayName: "Veteran", rating: 1200, ratedMatches: 40 });
  seedProfile(rig.db, { accountId: "acct-rookie", displayName: "Rookie", rating: 1200, ratedMatches: 5 });
  seedProfile(rig.db, { accountId: "acct-low", displayName: "Low", rating: 900, ratedMatches: 20 });
  seedProfile(rig.db, { accountId: "acct-gone", displayName: "Gone", rating: 1900, ratedMatches: 50, status: "deleted" });
}

describe("GET /leaderboard", () => {
  it("TC-RANK-104: the page is ordered by rating, then rated matches, then account id", async () => {
    // Arrange
    const rig = createRig();
    seedBoard(rig);

    // Act
    const response = await rig.request("GET", "/leaderboard");

    // Assert
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: { displayName: string; rank: number }[] };
    // `leaderboard.md` keeps `accountId` out of items, so order is asserted on the display name.
    expect(body.items.map((row) => row.displayName)).toEqual(["Top", "Veteran", "Rookie", "Low"]);
    expect(body.items.map((row) => row.rank)).toEqual([1, 2, 3, 4]);
    rig.db.close();
  });

  it("TC-RANK-104: a deleted account is not listed", async () => {
    // Arrange
    const rig = createRig();
    seedBoard(rig);

    // Act
    const response = await rig.request("GET", "/leaderboard");

    // Assert
    const body = (await response.json()) as { items: { displayName: string }[] };
    expect(body.items.map((row) => row.displayName)).not.toContain("Gone");
    rig.db.close();
  });

  it("TC-RANK-104: an account with no rated match is not listed", async () => {
    // Arrange — leaderboard.md: "only … rated_matches > 0 are listed"
    const rig = createRig();
    seedBoard(rig);
    seedProfile(rig.db, { accountId: "acct-fresh", displayName: "Fresh", rating: 1250, ratedMatches: 0 });

    // Act
    const response = await rig.request("GET", "/leaderboard");

    // Assert
    const body = (await response.json()) as { items: { displayName: string }[] };
    expect(body.items.map((row) => row.displayName)).not.toContain("Fresh");
    rig.db.close();
  });

  it("TC-RANK-104: each row carries rank, displayName, avatarId, rating and ratedMatches", async () => {
    // Arrange
    const rig = createRig();
    seedBoard(rig);

    // Act
    const response = await rig.request("GET", "/leaderboard");

    // Assert
    const body = (await response.json()) as { items: Record<string, unknown>[] };
    expect(body.items[0]).toMatchObject({
      rank: 1,
      displayName: "Top",
      avatarId: expect.any(String),
      rating: 1400,
      ratedMatches: 12,
    });
    rig.db.close();
  });

  it("TC-RANK-163: two requests within thirty seconds are cacheable and identical", async () => {
    // Arrange
    const rig = createRig();
    seedBoard(rig);

    // Act
    const first = await rig.request("GET", "/leaderboard");
    const second = await rig.request("GET", "/leaderboard");

    // Assert — `US-RANK-004` AC6. `Vary` is what keeps `you` from being served to the next reader through a
    // shared cache, so the header is part of the contract, not a nicety. `request_id` is per-request by design,
    // so "identical content" is the page itself.
    expect(first.headers.get("cache-control")).toBe("public, max-age=30");
    expect(first.headers.get("vary")).toBe("authorization, x-session-token");
    const { request_id: _firstId, ...firstPage } = (await first.json()) as Record<string, unknown>;
    const { request_id: _secondId, ...secondPage } = (await second.json()) as Record<string, unknown>;
    expect(secondPage).toEqual(firstPage);
    rig.db.close();
  });

  it("TC-RANK-104: a page carries a cursor and the next page keeps counting from twenty-one", async () => {
    // Arrange — twenty-one rated accounts, documented default page of twenty
    const rig = createRig();
    for (let index = 0; index < 21; index += 1) {
      seedProfile(rig.db, {
        accountId: `acct-${String(index).padStart(2, "0")}`,
        displayName: `P${index}`,
        rating: 1300 + index,
        ratedMatches: 10 + index,
      });
    }

    // Act
    const first = await rig.request("GET", "/leaderboard");
    const firstBody = (await first.json()) as { items: { rank: number }[]; next_cursor?: string };
    const second = await rig.request("GET", `/leaderboard?cursor=${firstBody.next_cursor}`);
    const secondBody = (await second.json()) as { items: { rank: number }[] };

    // Assert — "rank … cursor pages continue the count"
    expect(firstBody.items).toHaveLength(20);
    expect(firstBody.next_cursor).toBeTruthy();
    expect(secondBody.items).toHaveLength(1);
    expect(secondBody.items[0]?.rank).toBe(21);
    rig.db.close();
  });

  it("TC-RANK-104: 150 ranked accounts answer the documented top 100 in order", async () => {
    // Arrange — 150 rated accounts, so the page cap (max 100) and the ordering both show.
    const rig = createRig();
    for (let index = 0; index < 150; index += 1) {
      seedProfile(rig.db, {
        accountId: `acct-${String(index).padStart(3, "0")}`,
        displayName: `P${index}`,
        rating: 1000 + ((149 - index) % 50),
        ratedMatches: 10 + (index % 7),
      });
    }

    // Act
    const response = await rig.request("GET", "/leaderboard?limit=100");

    // Assert
    const body = (await response.json()) as { items: { rank: number; rating: number; ratedMatches: number }[] };
    expect(body.items).toHaveLength(100);
    expect(body.items.map((item) => item.rank)).toEqual(Array.from({ length: 100 }, (_unused, index) => index + 1));
    const sorted = [...body.items].sort(
      (left, right) => right.rating - left.rating || right.ratedMatches - left.ratedMatches,
    );
    expect(body.items.map((item) => [item.rating, item.ratedMatches])).toEqual(
      sorted.map((item) => [item.rating, item.ratedMatches]),
    );
    rig.db.close();
  });

  it("TC-RANK-104: an equal rating and an equal count are ordered by account id, request after request", async () => {
    // Arrange — the documented triple's last key is the only thing that can separate these two, and the names
    // sort the other way, so a query that ordered by `display_name` would answer `Alpha` first.
    const rig = createRig();
    seedProfile(rig.db, { accountId: "acct-bbb", displayName: "Alpha", rating: 1300, ratedMatches: 12 });
    seedProfile(rig.db, { accountId: "acct-aaa", displayName: "Zeta", rating: 1300, ratedMatches: 12 });

    // Act
    const first = await rig.request("GET", "/leaderboard");
    const second = await rig.request("GET", "/leaderboard");

    // Assert
    const names = async (response: Response): Promise<string[]> =>
      ((await response.json()) as { items: { displayName: string }[] }).items.map((item) => item.displayName);
    expect(await names(first)).toEqual(["Zeta", "Alpha"]);
    expect(await names(second)).toEqual(["Zeta", "Alpha"]);
    rig.db.close();
  });

  it("TC-RANK-144: a signed-in reader ranked 42nd learns their rank from the same page", async () => {
    // Arrange — fifty rated accounts; the caller is the forty-second by rating.
    const rig = createRig();
    for (let index = 0; index < 50; index += 1) {
      seedProfile(rig.db, {
        accountId: `acct-${String(index).padStart(2, "0")}`,
        displayName: `P${index}`,
        rating: 1500 - index,
        ratedMatches: 20,
      });
    }
    const token = await rig.token(accountSubject("acct-41"));

    // Act
    const response = await rig.request("GET", "/leaderboard", { token });

    // Assert — the rank is the same ordering the page shows, not a count of the page's rows.
    const body = (await response.json()) as { you: { rank: number; rating: number } | null };
    expect(body.you).toEqual({ rank: 42, rating: 1459 });
    rig.db.close();
  });

  it("TC-RANK-163: a page served to a session is never stored by any cache", async () => {
    // Arrange — `you` makes the body caller-dependent, and an edge cache keys on the URL alone.
    const rig = createRig();
    seedBoard(rig);
    const token = await rig.token(accountSubject("acct-top"));

    // Act
    const response = await rig.request("GET", "/leaderboard", { token });

    // Assert
    expect(response.status).toBe(200);
    const cacheControl = response.headers.get("cache-control") ?? "";
    expect(cacheControl).toContain("private");
    expect(cacheControl).toContain("no-store");
    expect(cacheControl).not.toContain("public");
    rig.db.close();
  });

  it("TC-RANK-144: an account that is no longer active reads no position", async () => {
    // Arrange — the list excludes `status != 'active'` (§ 5), so `you` cannot answer a rank for one either.
    const rig = createRig();
    seedBoard(rig);
    seedProfile(rig.db, {
      accountId: "acct-closed",
      displayName: "Closed",
      rating: 1500,
      ratedMatches: 30,
      status: "deleted",
    });
    const token = await rig.token(accountSubject("acct-closed"));

    // Act
    const response = await rig.request("GET", "/leaderboard", { token });

    // Assert
    expect(response.status).toBe(200);
    expect(((await response.json()) as { you: unknown }).you).toBeNull();
    rig.db.close();
  });

  it("TC-RANK-147: an expired token degrades to `you: null` and a `200`", async () => {
    // Arrange — AC7's other half: a reader whose session aged out while the tab was open.
    const rig = createRig();
    seedBoard(rig);
    const token = await rig.expiredToken(accountSubject("acct-top"));

    // Act
    const response = await rig.request("GET", "/leaderboard", { token });

    // Assert — a public read never answers `401`, and the list still renders (`NFR-13`).
    expect(response.status).toBe(200);
    expect(((await response.json()) as { you: unknown }).you).toBeNull();
    rig.db.close();
  });

  it("TC-RANK-147: signed out, or with a token the server cannot read, `you` is null and the page is still 200", async () => {
    // Arrange
    const rig = createRig();
    seedBoard(rig);

    // Act
    const anonymous = await rig.request("GET", "/leaderboard");
    const stale = await rig.request("GET", "/leaderboard", { token: "not-a-session-token" });

    // Assert
    expect(anonymous.status).toBe(200);
    expect(((await anonymous.json()) as { you: unknown }).you).toBeNull();
    expect(stale.status).toBe(200);
    expect(((await stale.json()) as { you: unknown }).you).toBeNull();
    rig.db.close();
  });

  it("TC-RANK-104: an unreadable cursor is a 422, not a 500", async () => {
    // Arrange
    const rig = createRig();
    seedBoard(rig);

    // Act
    const response = await rig.request("GET", "/leaderboard?cursor=not-base64-at-all");

    // Assert
    expect(response.status).toBe(422);
    rig.db.close();
  });
});
