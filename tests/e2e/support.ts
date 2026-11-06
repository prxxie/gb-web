/**
 * Shared helpers for the browser flows in `docs/02-reference/screens/`.
 *
 * Only orchestration lives here — every assertion stays in the spec that owns the contract, so a
 * failing case keeps naming the doc row it proves.
 */
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

/** The room-code alphabet of `US-ROOM-001`: no `I`, `O`, `0` or `1`. */
export const ROOM_CODE = /^[A-HJ-NP-Z2-9]{6}$/;

/** A second player needs its own context: a session is per tab, not per browser. */
export async function newPlayer(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  return { context, page };
}

export interface StoredSession {
  readonly token: string;
  readonly expiresAt: number;
  readonly subject: {
    readonly kind: "guest" | "account";
    readonly guestId?: string;
    readonly accountId?: string;
    readonly displayName: string;
    readonly avatarId?: string;
  };
}

/** `docs/03-stories/EPIC-01-accounts/US-AUTH-001-continue-as-a-guest.md` — the token lives in sessionStorage. */
export async function sessionOf(page: Page): Promise<StoredSession> {
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("gbw.session")), { message: "the client mints a guest session" })
    .not.toBeNull();
  const raw = await page.evaluate(() => sessionStorage.getItem("gbw.session"));
  return JSON.parse(raw as string) as StoredSession;
}

/** Create a room on the main menu and return its code (`US-ROOM-001`). */
export async function createRoom(page: Page): Promise<string> {
  await page.goto("/");
  await page.getByTestId("create-room").click();
  const heading = page.getByTestId("room-code");
  await expect(heading).toBeVisible();
  const code = (await heading.innerText()).trim();
  expect(code).toMatch(ROOM_CODE);
  return code;
}

/** Join an existing room from the main menu. */
export async function joinRoom(page: Page, code: string): Promise<void> {
  await page.goto("/");
  await page.getByTestId("room-code-input").fill(code);
  await page.getByTestId("join-room").click();
  await expect(page.getByTestId("room-code")).toHaveText(code);
}

/** Start a bot match from the main menu and wait for the battlefield. */
export async function openBotMatch(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("play-bot").click();
  await expect(page.getByTestId("match-screen")).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
}

/**
 * A point on the canvas the HUD does not cover at 844 × 390. `.match__actions` (the phrase picker)
 * sits over the middle of the battlefield, so a drag has to start left of it.
 */
export const AIM_START = { x: 0.15, y: 0.45 } as const;

export interface RoomSockets {
  /** Every frame the relay sent the page, in order. */
  readonly frames: string[];
  /** Close the live sockets from the relay side, the way a dropped network would. */
  drop(): void;
}

const ROOM_SOCKET = /\/api\/v1\/rooms\/[A-HJ-NP-Z2-9]+\/ws$/;

/**
 * Keep the room socket out of the browser's WebSocket stack.
 *
 * `wrangler dev` (miniflare 5.20261103 beta) fails the upgrade of any handshake that carries an
 * `Origin` header — which every browser sends — with `500` (`WebSocket request did not return status
 * 101 Switching Protocols response with Web Socket`). The Worker itself still answers `101` and the
 * Durable Object still runs, so the specs hold the connection from the test process instead: Node's
 * `WebSocket` sends no `Origin`, every frame is relayed untouched, and the server side under test is
 * the real one. `wrangler dev` listens on `:8787` (`playwright.config.ts`).
 */
export async function bridgeRoomSockets(page: Page): Promise<RoomSockets> {
  const frames: string[] = [];
  const live = new Set<{ close: (options?: { code?: number; reason?: string }) => void }>();
  /** The matcher sees the URL, the handler does not: hand it over in arrival order. */
  const pending: string[] = [];

  await page.routeWebSocket(
    (url) => {
      const match = ROOM_SOCKET.test(url.pathname);
      if (match) pending.push(url.toString());
      return match;
    },
    (client) => {
      const pageUrl = pending.shift() ?? "";
      const upstream = new WebSocket(pageUrl.replace(/^ws:\/\/[^/]+/, "ws://127.0.0.1:8787"));
      const queued: string[] = [];
      live.add(client);

      upstream.addEventListener("open", () => {
        for (const frame of queued.splice(0)) upstream.send(frame);
      });
      upstream.addEventListener("message", (event) => {
        const frame = String(event.data);
        frames.push(frame);
        client.send(frame);
      });
      upstream.addEventListener("close", () => client.close());
      client.onMessage((message) => {
        const frame = String(message);
        if (upstream.readyState === WebSocket.OPEN) upstream.send(frame);
        else queued.push(frame);
      });
      client.onClose(() => {
        live.delete(client);
        upstream.close();
      });
    },
  );

  return {
    frames,
    drop: () => {
      for (const socket of live) socket.close({ code: 1006, reason: "dropped" });
      live.clear();
    },
  };
}

/** One-finger pull from {@link AIM_START} towards the lower right, which raises the power readout. */
export async function pullAim(page: Page): Promise<void> {
  const box = await page.locator("canvas").boundingBox();
  expect(box, "the battlefield canvas has a box").not.toBeNull();
  if (!box) return;
  const startX = box.x + box.width * AIM_START.x;
  const startY = box.y + box.height * AIM_START.y;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 90, startY + 70, { steps: 12 });
}
