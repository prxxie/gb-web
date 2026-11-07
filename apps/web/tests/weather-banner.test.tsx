// @vitest-environment jsdom
/**
 * The wind-change banner (`US-MATCH-003` AC10).
 *
 * A round rolls new wind without asking; the banner is the only thing that tells a player who was looking at their
 * own mobile. It must appear once per roll, last 1.5 s, and get out of the way on a tap.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WEATHER_BANNER_MS, WeatherBanner } from "../src/components/WeatherBanner";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const TEXT = "Thời tiết thay đổi: gió 18 hướng 135";

describe("TC-MATCH-931: the wind banner is shown once per roll (US-MATCH-003 AC10)", () => {
  it("stays hidden on mount, because the dial already shows that roll", () => {
    render(<WeatherBanner rolledAtRound={1} text={TEXT} />);
    expect(screen.queryByTestId("weather-banner")).toBeNull();
  });

  it("appears when the round rolls new wind", () => {
    const { rerender } = render(<WeatherBanner rolledAtRound={1} text={TEXT} />);
    rerender(<WeatherBanner rolledAtRound={2} text={TEXT} />);
    expect(screen.getByTestId("weather-banner").textContent).toBe(TEXT);
  });

  it("disappears after 1.5 s", () => {
    const { rerender } = render(<WeatherBanner rolledAtRound={1} text={TEXT} />);
    rerender(<WeatherBanner rolledAtRound={2} text={TEXT} />);
    act(() => {
      vi.advanceTimersByTime(WEATHER_BANNER_MS - 1);
    });
    expect(screen.queryByTestId("weather-banner")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByTestId("weather-banner")).toBeNull();
  });

  it("goes away on a tap before the timer runs out", () => {
    const { rerender } = render(<WeatherBanner rolledAtRound={1} text={TEXT} />);
    rerender(<WeatherBanner rolledAtRound={2} text={TEXT} />);
    fireEvent.click(screen.getByTestId("weather-banner"));
    expect(screen.queryByTestId("weather-banner")).toBeNull();
  });

  it("raises the banner again for the next roll", () => {
    const { rerender } = render(<WeatherBanner rolledAtRound={1} text={TEXT} />);
    rerender(<WeatherBanner rolledAtRound={2} text={TEXT} />);
    act(() => {
      vi.advanceTimersByTime(WEATHER_BANNER_MS);
    });
    rerender(<WeatherBanner rolledAtRound={3} text={TEXT} />);
    expect(screen.getByTestId("weather-banner").getAttribute("data-round")).toBe("3");
  });
});
