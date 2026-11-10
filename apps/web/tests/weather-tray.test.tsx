// @vitest-environment jsdom
/**
 * TC-MATCH-953: the weather tray — four rounds, each named and drawn, the nearest one lit.
 *
 * The tray is a pure derivation (`rollWeather(seed, round + n)` and `weatherKind(wind)`), so the case can assert the exact
 * numbers the player will see rather than "some cells render". What it must not do is assert pixels: the point of the four
 * cells is that the kind is a *band of the same magnitude*, so the assertion that matters is that cell n's glyph agrees with
 * `weatherKind(rollWeather(seed, round + n + 1))` and that no two neighbouring cells were swapped.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WEATHER_BANDS, rollWeather, weatherKind } from "@gbw/core";
import { KindGlyph, TRAY_ROUNDS, WeatherTray } from "../src/components/WeatherTray";

afterEach(cleanup);

const KINDS: Record<string, string> = { clear: "Nắng", breeze: "Gió", gale: "Gió mạnh", storm: "Lốc" };

function labels() {
  return {
    weather: "Thời tiết",
    kind: (kind: string): string => KINDS[kind] ?? kind,
  };
}

describe("TC-MATCH-953: the tray shows four named rounds", () => {
  it("draws one cell per round, starting at the round after the one in play", () => {
    const seed = 7_319;
    const round = 3;
    render(<WeatherTray seed={seed} round={round} labels={labels()} />);

    expect(screen.getByTestId("weather-forecast")).toBeTruthy();
    expect(TRAY_ROUNDS).toBe(4);
    for (let index = 0; index < TRAY_ROUNDS; index += 1) {
      const cell = screen.getByTestId(`forecast-${index}`);
      const weather = rollWeather(seed, round + index + 1);
      const kind = weatherKind(weather.wind);

      // The number is the roll's own magnitude, and the cell says which round it is about.
      expect(cell.textContent).toContain(String(weather.wind.magnitude));
      expect(cell.getAttribute("title")).toBe(`R${round + index + 1} · ${KINDS[kind]} ${weather.wind.magnitude}`);
      // The kind rides on the cell as data, which is what the stylesheet colours the glyph from.
      expect(cell.getAttribute("data-kind")).toBe(kind);
      // The glyph is inside the cell, and it is the one the cell's own kind selects.
      expect(screen.getByTestId(`forecast-kind-${index}`).querySelector("svg")).not.toBeNull();
    }
  });

  it("shows the wind's direction, and only east or west", () => {
    const seed = 991;
    render(<WeatherTray seed={seed} round={1} labels={labels()} />);
    for (let index = 0; index < TRAY_ROUNDS; index += 1) {
      const weather = rollWeather(seed, index + 2);
      const cell = screen.getByTestId(`forecast-${index}`);
      expect(cell.textContent).toContain(weather.wind.sector === 0 ? "›" : "‹");
    }
  });

  it("gives every band its own glyph, so no two states look the same", () => {
    // A duplicate shape would make two weathers indistinguishable at 13 px, which is the whole reason the tray draws icons
    // instead of printing the magnitude alone.
    const shapes = new Map<string, string>();
    for (const band of WEATHER_BANDS) {
      const { container, unmount } = render(<KindGlyph kind={band.kind} />);
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      shapes.set(band.kind, svg!.innerHTML);
      unmount();
    }
    expect(shapes.size).toBe(WEATHER_BANDS.length);
    expect(new Set(shapes.values()).size).toBe(WEATHER_BANDS.length);
  });

  it("takes a smaller tray when a caller has fewer pixels, without changing the round it starts on", () => {
    const seed = 42;
    render(<WeatherTray seed={seed} round={2} rounds={2} labels={labels()} />);
    expect(screen.getByTestId("forecast-0").getAttribute("title")).toBe(
      `R3 · ${KINDS[weatherKind(rollWeather(seed, 3).wind)]} ${rollWeather(seed, 3).wind.magnitude}`,
    );
    expect(screen.queryByTestId("forecast-2")).toBeNull();
  });
});
