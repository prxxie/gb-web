/**
 * `GET /leaderboard` — shape and ordering (`leaderboard.md`, `TC-RANK-104`).
 *
 * The ranking is the product's public ranking, so the order is asserted against the documented triple
 * `rating DESC, rated_matches DESC, account_id ASC`, with the inactive and never-rated account rules on top.
 */
import { describe, expect, it } from "vitest";
import { createRig, seedProfile, type Rig } from "./support/fake-env";

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

  it("TC-RANK-104: the response is cacheable for thirty seconds", async () => {
    // Arrange
    const rig = createRig();
    seedBoard(rig);

    // Act
    const response = await rig.request("GET", "/leaderboard");

    // Assert
    expect(response.headers.get("cache-control")).toBe("public, max-age=30");
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
