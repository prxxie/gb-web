// @vitest-environment jsdom
/**
 * Install prompt (`US-PWA-001` §5: offered from the results screen only, one tap, dismissible and
 * remembered).
 *
 * The browser's `beforeinstallprompt` event is the only install UI the app can own, so these cases drive
 * that event directly: nothing before it, one tap after it, and a dismissal that survives a reload.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { LocaleProvider } from "../src/app/providers";
import { InstallPrompt } from "../src/components/InstallPrompt";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function installEvent(outcome: "accepted" | "dismissed"): InstallEvent {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as InstallEvent;
  const prompt = vi.fn().mockResolvedValue(undefined);
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome }) });
  return event;
}

function renderPrompt(): void {
  render(
    <LocaleProvider>
      <InstallPrompt />
    </LocaleProvider>,
  );
}

function fire(event: InstallEvent): void {
  act(() => {
    window.dispatchEvent(event);
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(cleanup);

describe("install prompt", () => {
  it("is absent on a browser that never offers an install", () => {
    renderPrompt();
    expect(screen.queryByTestId("install-prompt")).toBeNull();
  });

  it("takes over the browser dialog instead of letting it fire on first load", () => {
    renderPrompt();
    const event = installEvent("accepted");
    fire(event);
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByTestId("install-prompt")).toBeVisible();
  });

  it("installs with one tap", async () => {
    renderPrompt();
    const event = installEvent("accepted");
    fire(event);
    await act(async () => {
      screen.getByTestId("install-action").click();
    });
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("install-prompt")).toBeNull();
  });

  it("hides itself when the player dismisses the browser dialog", async () => {
    renderPrompt();
    fire(installEvent("dismissed"));
    await act(async () => {
      screen.getByTestId("install-action").click();
    });
    expect(screen.queryByTestId("install-prompt")).toBeNull();
    expect(window.localStorage.getItem("gbw.install.dismissed")).toBe("1");
  });

  it("remembers a dismissal across visits", () => {
    window.localStorage.setItem("gbw.install.dismissed", "1");
    renderPrompt();
    fire(installEvent("accepted"));
    expect(screen.queryByTestId("install-prompt")).toBeNull();
  });

  it("is offered in the active locale", () => {
    window.localStorage.setItem("gbw.locale", "en");
    renderPrompt();
    fire(installEvent("accepted"));
    expect(screen.getByTestId("install-action")).toHaveTextContent("Install app");
  });
});
