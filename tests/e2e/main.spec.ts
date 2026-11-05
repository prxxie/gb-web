/**
 * `docs/02-reference/screens/main.md` — the main menu is the entry point of every flow: it offers a
 * bot match, room creation and joining, and the two account routes.
 */
import { expect, test } from "@playwright/test";
import { createRoom, joinRoom, newPlayer, sessionOf } from "./support";

test.describe("main menu", () => {
  test("TC-ROOM-133: the menu offers the bot match, room creation and the account routes", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1, name: "Bắn Súng Đạn Đạo" })).toBeVisible();
    await expect(page.getByTestId("play-bot")).toBeVisible();
    await expect(page.getByTestId("room-code-input")).toBeVisible();
    await expect(page.getByRole("link", { name: "Bảng xếp hạng" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Hồ sơ" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Đăng nhập" })).toBeVisible();
  });

  test("TC-ROOM-133: create a room from the menu lands on its lobby with the host seated", async ({ page }) => {
    await page.goto("/");
    const name = (await sessionOf(page)).subject.displayName;

    const code = await createRoom(page);
    await expect(page).toHaveURL(new RegExp(`/lobby/${code}$`));
    await expect(page.getByTestId("team-A")).toContainText(name);
    await expect(page.getByTestId("start-match")).toBeVisible();
  });

  test("TC-ROOM-134: a second player joins by code and both see each other", async ({ browser }) => {
    const host = await newPlayer(browser);
    const guest = await newPlayer(browser);
    const code = await createRoom(host.page);
    const hostName = (await sessionOf(host.page)).subject.displayName;

    await joinRoom(guest.page, code);
    const guestName = (await sessionOf(guest.page)).subject.displayName;

    await expect(host.page.getByTestId("team-B")).toContainText(guestName);
    await expect(guest.page.getByTestId("team-A")).toContainText(hostName);
    await expect(guest.page.getByTestId("start-match")).toHaveCount(0);

    await host.context.close();
    await guest.context.close();
  });

  test("TC-ROOM-136: joining a room that does not exist keeps the player on the menu with a banner", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("room-code-input").fill("ZZZZZZ");
    await page.getByTestId("join-room").click();

    await expect(page.getByText("Không tìm thấy phòng.")).toBeVisible();
    await expect(page).toHaveURL("/");
  });

  test("the offline hint is not shown while the player is online", async ({ page, context }) => {
    await page.goto("/");
    const hint = page.getByText("Bạn đang ngoại tuyến — chỉ chơi được với máy.");

    await expect(hint).toHaveCount(0);

    await context.setOffline(true);
    await expect(hint).toBeVisible();
    await context.setOffline(false);
    await expect(hint).toHaveCount(0);
  });

  test("the top bar exposes the VI/EN switch and the choice survives a reload", async ({ page }) => {
    await page.goto("/");

    const english = page.getByRole("button", { name: "EN" });
    await expect(english).toBeVisible();
    await english.click();
    await expect(page.getByRole("heading", { level: 1, name: "Turn-Based Artillery" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Turn-Based Artillery" })).toBeVisible();
  });

  test("a stored locale is honoured on load", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("gbw.locale", "en"));
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1, name: "Turn-Based Artillery" })).toBeVisible();
    await expect(page.getByTestId("play-bot")).toHaveText("Play the bot");
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  });
});
