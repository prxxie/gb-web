// @vitest-environment jsdom
/**
 * Route focus (`US-PWA-004` AC7) at component level, `TC-PWA-190`. The browser case for the same rule is a separate
 * id in the e2e table; sharing one id would stop a failure from saying which level broke.
 *
 * A client-side navigation must put focus on the new screen's heading, otherwise a keyboard user keeps
 * tabbing from the control they pressed and a screen reader never announces the new context.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { useRouteFocus } from "../src/app/useRouteFocus";
import type { JSX } from "react";

function Screen({ title }: { title: string }): JSX.Element {
  return (
    <main id="main">
      {/* Deliberately without `tabIndex`: the hook must make the heading focusable itself, exactly as a
          plain <h1> in a route does. */}
      <h1>{title}</h1>
    </main>
  );
}

function Frame(): JSX.Element {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useRouteFocus();
  return (
    <>
      <button type="button" onClick={() => navigate("/lobby/ABC123")}>
        join
      </button>
      {pathname === "/" ? <Screen title="Menu" /> : <Screen title="Lobby" />}
    </>
  );
}

afterEach(cleanup);

describe("route focus", () => {
  it("focuses the heading of the screen that just rendered", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Frame />
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Menu" })));
  });

  it("moves focus again on the next navigation", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Frame />
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Menu" })));
    screen.getByRole("button", { name: "join" }).click();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Lobby" })));
  });
});
