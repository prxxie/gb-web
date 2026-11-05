// @vitest-environment jsdom
/**
 * The "Cập nhật" prompt (`US-PWA-001` AC5).
 *
 * The prompt is visible, names the action and waits for the tap; it never shows on `/match/:code`,
 * because swapping the bundle there would drop the match.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { LocaleProvider } from "../src/app/providers";
import { UpdatePrompt } from "../src/components/UpdatePrompt";

const serviceWorker = vi.hoisted(() => ({ register: vi.fn(), apply: vi.fn() }));

vi.mock("../src/app/serviceWorker", () => ({
  registerServiceWorker: serviceWorker.register,
  applyUpdate: serviceWorker.apply,
}));

function renderPrompt(suspended = false): void {
  render(
    <LocaleProvider>
      <UpdatePrompt suspended={suspended} />
    </LocaleProvider>,
  );
}

/** Fire the callback the component handed to the registration: a new build has landed. */
function deliverUpdate(): void {
  const call = serviceWorker.register.mock.calls.at(-1) as [() => void] | undefined;
  act(() => call?.[0]());
}

beforeEach(() => {
  window.localStorage.clear();
  serviceWorker.register.mockReset();
  serviceWorker.apply.mockReset();
});

afterEach(cleanup);

describe("update prompt", () => {
  it("stays hidden until a new build is installed", () => {
    renderPrompt();
    expect(screen.queryByTestId("update-prompt")).toBeNull();
  });

  it("shows the offer in Vietnamese with a 'Cập nhật' action", () => {
    renderPrompt();
    deliverUpdate();
    expect(screen.getByTestId("update-prompt")).toBeVisible();
    expect(screen.getByTestId("update-apply")).toHaveTextContent("Cập nhật");
  });

  it("applies the waiting worker only when the player taps the action", () => {
    renderPrompt();
    deliverUpdate();
    expect(serviceWorker.apply).not.toHaveBeenCalled();
    act(() => screen.getByTestId("update-apply").click());
    expect(serviceWorker.apply).toHaveBeenCalledTimes(1);
  });

  it("can be dismissed without applying anything", () => {
    renderPrompt();
    deliverUpdate();
    act(() => screen.getByText("Để sau").click());
    expect(screen.queryByTestId("update-prompt")).toBeNull();
    expect(serviceWorker.apply).not.toHaveBeenCalled();
  });

  it("never shows in the middle of a match", () => {
    renderPrompt(true);
    deliverUpdate();
    expect(screen.queryByTestId("update-prompt")).toBeNull();
  });

  it("registers the service worker once the shell mounts", () => {
    renderPrompt();
    expect(serviceWorker.register).toHaveBeenCalledTimes(1);
  });
});
