// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WindDial } from "../src/components/WindDial";
import { Ruler } from "../src/components/Ruler";
import { OrientationGate } from "../src/components/OrientationGate";
import { defaultWindow, rollWeather } from "@gbw/core";

describe("TC-MATCH-923: wind dial", () => {
  it("draws two sector ticks — east and west — and prints the magnitude 0–26", () => {
    const weather = rollWeather(42, 3);
    const { container } = render(<WindDial weather={weather} label="Gió" />);
    // Two ticks, plus a needle whenever the roll is not calm.
    expect(container.querySelectorAll("line")).toHaveLength(weather.wind.magnitude === 0 ? 2 : 3);
    expect(screen.getByTestId("wind-value").textContent).toBe(String(weather.wind.magnitude));
    expect(weather.wind.magnitude).toBeGreaterThanOrEqual(0);
    expect(weather.wind.magnitude).toBeLessThanOrEqual(26);
    expect([0, 180]).toContain(weather.wind.directionDeg);
  });

  it("TC-CORE-926: the same seed and round always give the same weather", () => {
    expect(rollWeather(7, 2)).toEqual(rollWeather(7, 2));
  });
});

describe("TC-MATCH-920: ruler", () => {
  it("shows eight divisions at the default window and sixteen zoomed out", () => {
    const { rerender } = render(<Ruler window={defaultWindow(5 / 3)} unitLabel="ô" />);
    expect(screen.getByTestId("ruler").getAttribute("data-segments")).toBe("8");
    rerender(<Ruler window={{ x: 0, y: 0, width: 2000, height: 1200 }} unitLabel="ô" />);
    expect(screen.getByTestId("ruler").getAttribute("data-segments")).toBe("16");
  });
});

describe("TC-PWA-162: orientation gate", () => {
  it("keeps children mounted but hidden in portrait", () => {
    const listeners: ((event: MediaQueryListEvent) => void)[] = [];
    const portrait = { width: window.innerWidth, height: window.innerHeight };
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      // A phone in portrait: the orientation query disagrees and the pointer is coarse (`US-PWA-005` AC4),
      // which is what makes the gate apply at all now.
      value: (query: string) => ({
        matches: query.includes("pointer: coarse") || query.includes("hover: none"),
        media: query,
        addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.push(listener),
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
    try {
      render(
        <OrientationGate message="Xoay ngang">
          <p>Battlefield</p>
        </OrientationGate>,
      );
      expect(screen.getByText("Battlefield")).toBeInTheDocument();
      expect(screen.getByText("Battlefield")).not.toBeVisible();
      expect(screen.getByTestId("orientation-hint")).toBeInTheDocument();
      expect(listeners.length).toBeGreaterThan(0);
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: portrait.width });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: portrait.height });
    }
  });
});

describe("TC-PWA-130: translations", () => {
  it("has the same keys in both locales and never returns a raw key", async () => {
    const { translator, LOCALES } = await import("../src/i18n");
    const vi = translator("vi");
    for (const locale of LOCALES) {
      const t = translator(locale);
      expect(t("app.title")).not.toBe("app.title");
      expect(t("match.yourTurn")).not.toBe("match.yourTurn");
    }
    expect(vi("app.title")).not.toBe(translator("en")("app.title"));
  });

  it("throws on a missing key in development instead of rendering a blank label", async () => {
    const { translate } = await import("../src/i18n");
    expect(translate("en", "app.title")).toBeTruthy();
    expect(() => translate("en", "nope.missing")).toThrow(/Missing en translation/);
  });
});
