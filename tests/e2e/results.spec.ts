import { expect, test, type Page } from "@playwright/test";

/**
 * `TC-RANK-153`, `154`, `155`, `157` — `docs/02-reference/screens/results.md`. The Back criterion is a
 * `web` case: it needs the match screen's own handover, which a browser test can only reach by finishing a
 * real match, so it lives in `apps/web/tests/match-record.test.tsx`.
 *
 * The payload is seeded the way the match screen writes it: driving a real 1v1 to a wipe takes a physics
 * simulation and a dozen shots, which is what `match.spec.ts` and the engine suites already do. What this
 * file proves is the screen: the deltas it prints, what it refuses to print, and what each action asks of
 * the API.
 */
test.beforeEach(async ({ page }, testInfo) => {
  // `NFR-25` allows thirty sessions a minute from one address, and the run's shared header is spent by the
  // specs that run before this one. A file of its own address keeps these cases about the result screen.
  await page.setExtraHTTPHeaders({ "cf-connecting-ip": `198.51.100.${200 + testInfo.workerIndex}` });
});

const RULESET = "2026-11-05";
const STARTED_AT = 1_760_000_000_000;

function payload(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    roomCode: "AAAAAA",
    mode: "solo",
    winnerTeam: "A",
    startedAt: STARTED_AT,
    endedAt: STARTED_AT + 240_000,
    rulesetVersion: RULESET,
    winCondition: "elimination",
    players: [
      { slot: 0, accountId: "acc-1", displayName: "Khách", team: "A", damageDealt: 340, shotsFired: 8, hits: 5, result: "win" },
      { slot: 1, accountId: "acc-2", displayName: "Máy", team: "B", damageDealt: 120, shotsFired: 6, hits: 2, result: "loss" },
    ],
    localSlot: 0,
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
  matchId: `AAAAAA-${STARTED_AT}`,
  ranked: true,
  rankedReason: null,
  ratings: [
    { accountId: "acc-1", before: 1284, after: 1296, delta: 12 },
    { accountId: "acc-2", before: 1300, after: 1288, delta: -12 },
  ],
};

/** A stored identity, the way `apps/web/src/lib/session.ts` writes it. */
const ACCOUNT = {
  token: "test-account-token",
  expiresAt: Date.now() + 3_600_000,
  subject: { kind: "account", accountId: "acc-1", displayName: "Khách" },
};

/**
 * Open the screen exactly as the match screen leaves it: a stored payload and a live session. The storage
 * is seeded before the app boots, because the menu's own boot would mint (and store) a guest first.
 */
async function openResults(page: Page, stored: Record<string, unknown>, account = false): Promise<void> {
  await page.addInitScript(
    ([value, identity]) => {
      sessionStorage.setItem("gbw.result", JSON.stringify(value));
      if (identity) sessionStorage.setItem("gbw.session", JSON.stringify(identity));
    },
    [stored, account ? ACCOUNT : null] as const,
  );
  await page.goto(`/results/${String(stored.roomCode)}`);
  await expect(page.getByTestId("result-banner")).toBeVisible();
}

test("TC-RANK-153: the result screen shows the rating change the room recorded", async ({ page }) => {
  await openResults(page, payload({ submission: RANKED }));

  // AC1: the winner, and both signed deltas exactly as `match_recorded` sent them.
  await expect(page.getByTestId("result-banner")).toHaveText("Đội A thắng");
  await expect(page.getByTestId("result-rating-0")).toHaveText("1284 → 1296 (+12)");
  await expect(page.getByTestId("result-rating-1")).toHaveText("1300 → 1288 (-12)");

  // AC3: damage, shots and hits per player, with the viewer's seat marked.
  const mine = page.getByTestId("result-row-you");
  await expect(mine).toHaveClass(/\bme\b/);
  await expect(mine).toContainText("340");
});

test("TC-RANK-154: an unranked match states the reason and prints no numbers", async ({ page }) => {
  await openResults(page, payload({ submission: { ranked: false, rankedReason: "guest", ratings: [] } }));

  // AC2: the reason in the current locale, and a dash where a rating would be.
  await expect(page.getByTestId("result-reason")).toHaveText("Trận này không tính điểm");
  await expect(page.getByTestId("result-rating-0")).toHaveText("—");
  await expect(page.getByTestId("result-rating-1")).toHaveText("—");
});

test("TC-RANK-155: Chơi lại on a closed room opens a new lobby", async ({ page }) => {
  // A preview never reveals whether a code was ever used, so a *finished* room is the only closed room the
  // screen can hear about: it answers `410 room-closed` (`docs/02-reference/api/rooms.md`).
  await page.route("**/api/v1/rooms/AAAAAA", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 410,
      contentType: "application/problem+json",
      body: JSON.stringify({ type: "room-closed", title: "Room closed", status: 410, detail: "That match is already over" }),
    });
  });

  await openResults(page, payload({ submission: RANKED, maxPlayers: 4, mode: "score" }));

  // The screen makes a room with the same shape instead of routing into a lobby that would bounce the
  // player straight back (AC4).
  await page.getByTestId("result-rematch").click();
  await expect(page).toHaveURL(/\/lobby\/[A-HJ-NP-Z2-9]{6}$/);
  const opened = (await page.getByTestId("room-code").innerText()).trim();
  expect(opened).not.toBe("AAAAAA");

  const created = await page.request.get(`/api/v1/rooms/${opened}`);
  const room = (await created.json()) as { settings: { maxPlayers: number; mode: string; mapId: string } };
  expect(room.settings.maxPlayers).toBe(4);
  expect(room.settings.mode).toBe("score");
  // The payload's map, not the map `POST /rooms` defaults to: the rematch replays the match's settings.
  expect(room.settings.mapId).toBe("map-01");
});

test("TC-RANK-157: a retry treats a 409 as success", async ({ page }) => {
  // Another client already recorded this match: the second submission is answered `409` and the screen
  // must accept that as the outcome it wanted (AC6).
  await page.route("**/api/v1/matches", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/problem+json",
      body: JSON.stringify({
        type: "match-already-recorded",
        title: "Match already recorded",
        status: 409,
        detail: "This match is already on the board",
      }),
    });
  });

  // A retry needs an account: `POST /matches` refuses a guest, and the button is not offered without one.
  await openResults(page, payload({ submission: { ranked: false, rankedReason: null, ratings: [], failed: true } }), true);
  await expect(page.getByTestId("result-record-failed")).toBeVisible();

  await page.getByTestId("result-retry").click();
  // The 409 settles the question: no failure line, no error, and no button that could only be refused
  // again — even when the history lookup that follows comes back empty.
  await expect(page.getByTestId("result-retry")).toHaveCount(0);
  await expect(page.getByTestId("result-record-failed")).toHaveCount(0);
  await expect(page.getByTestId("result-error")).toHaveCount(0);
  await expect(page.getByTestId("result-rating-0")).toHaveText("—");
});
