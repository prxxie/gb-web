// @vitest-environment jsdom
/**
 * `US-AUTH-001` AC6 — a session dies with the tab (`TC-AUTH-162`).
 *
 * The token is a bearer credential: anything in `localStorage` survives a closed tab, a shared kiosk and a
 * back-button restore, so the rule is that a session only ever lives in `sessionStorage`.
 */
import { afterEach, describe, expect, it } from "vitest";

import { clearSession, currentSession, ensureSession } from "../src/lib/session";

const TOKEN = "header.payload.signature";

function sessionResponse(): Response {
  return Response.json({
    sessionToken: TOKEN,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    subject: {
      kind: "guest",
      guestId: "guest_1",
      accountId: null,
      displayName: "Khách",
      avatarId: "default",
      rating: 1200,
      ratedMatches: 0,
    },
  });
}

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem("__used", "1");
});

describe("TC-AUTH-162: the session never lands in localStorage", () => {
  it("mints a guest session into sessionStorage and leaves localStorage empty", async () => {
    // Arrange
    sessionStorage.clear();
    const fetch = async (): Promise<Response> => sessionResponse();
    const original = globalThis.fetch;
    globalThis.fetch = fetch as typeof globalThis.fetch;

    // Act
    const session = await ensureSession().finally(() => {
      globalThis.fetch = original;
    });

    // Assert
    expect(session.token).toBe(TOKEN);
    expect(sessionStorage.getItem("gbw.session")).toContain(TOKEN);
    expect(localStorage.length).toBe(0);
  });

});

describe("TC-ROOM-710: one guest identity per page load", () => {
  it("mints one guest for a page load, however many callers ask at once", async () => {
    // Arrange: a fresh tab, and two callers that both arrive before the first mint lands (`TC-ROOM-710`).
    sessionStorage.clear();
    const original = globalThis.fetch;
    let mints = 0;
    globalThis.fetch = (async (): Promise<Response> => {
      mints += 1;
      return sessionResponse();
    }) as typeof globalThis.fetch;

    // Act
    const [first, second] = await Promise.all([ensureSession(), ensureSession()]).finally(() => {
      globalThis.fetch = original;
    });

    // Assert
    expect(mints).toBe(1);
    expect(second.token).toBe(first.token);
    expect(second.subject.guestId).toBe(first.subject.guestId);
  });

});

describe("TC-AUTH-162: the stored token is readable and clearable", () => {
  it("reads it back and clears only the tab store", async () => {
    currentSession();
    sessionStorage.setItem(
      "gbw.session",
      JSON.stringify({ token: TOKEN, expiresAt: Date.now() + 60_000, subject: { kind: "guest", guestId: "g" } }),
    );
    expect(currentSession()?.token).toBe(TOKEN);

    clearSession();

    expect(currentSession()).toBeNull();
    expect(sessionStorage.getItem("gbw.session")).toBeNull();
  });
});
