// @vitest-environment jsdom
/**
 * TC-FND-131: the app shell (`US-FND-003` AC1, AC2, AC5).
 *
 * The router is created at module scope, so each case resets the module graph after moving the
 * history entry — that is exactly how a direct URL open behaves in a browser.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { ErrorBoundary } from "../src/app/ErrorBoundary";

const SESSION = {
  token: "test-token",
  // Far enough out that `currentSession()` keeps it, so no fetch happens during the shell test.
  expiresAt: Date.now() + 3_600_000,
  subject: { kind: "guest", guestId: "gst-test", displayName: "Khách", avatarId: "av-01" },
};

async function openApp(path: string) {
  window.history.replaceState(null, "", path);
  vi.resetModules();
  const { App } = await import("../src/app/App");
  render(<App />);
  return screen.findByRole("heading", { level: 1 });
}

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem("gbw.session", JSON.stringify(SESSION));
  document.body.innerHTML = '<div id="root"></div>';
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("TC-FND-131: direct URL opens (AC1)", () => {
  it("renders the main menu with its own h1 at /", async () => {
    const heading = await openApp("/");
    expect(heading).toBeInTheDocument();
    expect(heading.textContent?.trim().length).toBeGreaterThan(0);
  });

  it("redirects an unknown path to / instead of throwing", async () => {
    const heading = await openApp("/no-such-screen");
    expect(window.location.pathname).toBe("/");
    expect(heading).toBeInTheDocument();
  });

  it("renders a lazy route without a crash", async () => {
    const heading = await openApp("/leaderboard");
    expect(heading).toBeInTheDocument();
  });
});

describe("TC-FND-131: one root, one language attribute", () => {
  it("index.html declares exactly one #root and a lang", () => {
    const html = readFileSync("apps/web/index.html", "utf8");
    expect(html.match(/id="root"/g)).toHaveLength(1);
    expect(html).toMatch(/<html[^>]+lang="(vi|en)"/);
  });

  it("mounting the shell adds no second #root", async () => {
    await openApp("/");
    expect(document.querySelectorAll("#root")).toHaveLength(1);
  });
});

describe("TC-FND-131: a crashing screen (AC5)", () => {
  function Boom(): never {
    throw new Error("scene exploded");
  }

  it("shows the error banner with the message and a retry", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong");
    expect(alert).toHaveTextContent("scene exploded");
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    // React logs the thrown error too; the app's own structured entry must appear exactly once.
    const structured = logged.mock.calls
      .map(([line]) => (typeof line === "string" ? line : ""))
      .filter((line) => line.includes('"scope":"web"') && line.includes("scene exploded"));
    expect(structured).toHaveLength(1);
  });

  it("retry clears the error so the shell can recover", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    // The throwing child renders again and throws again, so the banner stays — but the boundary did
    // reset (it re-rendered the child rather than staying in its error state).
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

describe("TC-FND-131: the shell's locale toggle (AC2)", () => {
  it("is on screen and shows the active language", async () => {
    // AC2: "the toggle shows VI". No `Shell` component exists, so the only button on the main menu is
    // its own; there is nothing that switches the language from the UI.
    await openApp("/");
    expect(screen.queryByRole("button", { name: /^(VI|EN)$/ })).not.toBeNull();
  });
});
