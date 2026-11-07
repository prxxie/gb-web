// @vitest-environment jsdom
/**
 * TC-MATCH-921: the first tap asks for fullscreen where the API exists (`US-MATCH-007` AC1).
 *
 * The scene cannot call `requestFullscreen()` at mount — browsers only honour it inside a gesture — so it arms a
 * one-shot listener instead. iPhone Safari has no Fullscreen API on elements, and a refusal (or a synchronous throw
 * from an old WebKit) must leave the page usable: the layout already fills the viewport.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { armFullscreen, requestFullscreen } from "../src/lib/fullscreen";

afterEach(cleanup);

function canvas(withApi: boolean): HTMLElement & { requestFullscreen?: () => Promise<void> } {
  const element = document.createElement("canvas");
  if (withApi) element.requestFullscreen = vi.fn(() => Promise.resolve());
  return element as HTMLElement & { requestFullscreen?: () => Promise<void> };
}

describe("TC-MATCH-921: fullscreen on the first tap (US-MATCH-007 AC1)", () => {
  it("asks once, on the first pointer down, and never again", () => {
    const element = canvas(true);
    const disarm = armFullscreen(element);

    element.dispatchEvent(new Event("pointerdown"));
    element.dispatchEvent(new Event("pointerdown"));
    element.dispatchEvent(new Event("pointerdown"));

    expect(element.requestFullscreen).toHaveBeenCalledTimes(1);
    disarm();
  });

  it("does nothing where the API is missing, and stays silent when the browser refuses", async () => {
    const plain = canvas(false);
    expect(() => {
      requestFullscreen(plain);
      armFullscreen(plain).call(null);
      armFullscreen(null);
    }).not.toThrow();

    const refusing = canvas(true);
    (refusing.requestFullscreen as () => Promise<void>) = vi.fn(() => Promise.reject(new Error("denied")));
    expect(() => requestFullscreen(refusing)).not.toThrow();
    await Promise.resolve();
  });

  it("stops listening once disarmed, so a remounted match does not stack requests", () => {
    const element = canvas(true);
    const disarm = armFullscreen(element);
    disarm();
    element.dispatchEvent(new Event("pointerdown"));
    expect(element.requestFullscreen).not.toHaveBeenCalled();
  });
});
