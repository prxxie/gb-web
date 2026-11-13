// @vitest-environment jsdom
/**
 * `TC-BAL-153` … `TC-BAL-155` — the practice screen (`screens/practice.md`, `US-BAL-007` AC5).
 *
 * The screen is exercised as the browser runs it, with no network at all: the solver is real `@gbw/core`, so the numbers
 * on the page are the numbers the contract promises, and a request would fail the fetch spy. The arithmetic itself is
 * pinned in `packages/core/tests/solver.test.ts`; what is checked here is that the page prints it, in both languages,
 * and that nothing on it is a literal string.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LocaleProvider } from "../src/app/providers";
import { PracticePage } from "../src/routes/PracticePage";
import en from "../src/i18n/en.json";
import vi from "../src/i18n/vi.json";

function show(): void {
  render(
    <MemoryRouter>
      <LocaleProvider>
        <PracticePage />
      </LocaleProvider>
    </MemoryRouter>,
  );
}

const field = (label: string): HTMLInputElement => screen.getByLabelText(label) as HTMLInputElement;
/** The answer box is an `<output>`, so it is a `status` region a screen reader announces. */
const answer = (): string => screen.getByRole("status").textContent ?? "";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("TC-BAL-153: the three modes and the notice (US-BAL-007 AC5)", () => {
  it("opens in the bar mode and prints the bar with its flight time", () => {
    show();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(vi["practice.title"]);
    const modes = screen.getAllByRole("button");
    expect(modes.map((button) => button.textContent)).toEqual([
      vi["practice.mode.bar"],
      vi["practice.mode.distance"],
      vi["practice.mode.time"],
    ]);
    expect(screen.getByRole("button", { name: vi["practice.mode.bar"] })).toHaveAttribute("aria-pressed", "true");
    // Defaults: 22.14 phần at 45° on the reference hull is the bar-4 calibration shot.
    expect(answer()).toMatch(/4,00/);
    expect(answer()).toMatch(/3,37/);
  });

  it("switches the typed field with the mode and keeps the answers in step", () => {
    show();

    fireEvent.click(screen.getByRole("button", { name: vi["practice.mode.distance"] }));
    expect(field(vi["practice.bar"])).toBeInTheDocument();
    expect(screen.queryByLabelText(vi["practice.distance"])).toBeNull();
    // The default bar 3 at 45° on the reference hull flies 12,46 phần in 2,53 s.
    expect(answer()).toMatch(/12,4\d/);
    expect(answer()).toMatch(/2,5\d/);

    fireEvent.click(screen.getByRole("button", { name: vi["practice.mode.time"] }));
    expect(screen.getByLabelText(vi["practice.bar"])).toBeInTheDocument();
    // The time mode answers with the flight time alone: one number, no distance and no second "bay" clause.
    expect(answer()).toMatch(/^Bay 2,5\d s$/);
    expect(answer()).not.toMatch(/phần/);
  });

  it("says it is flat ground and that it is not in a match, once each", () => {
    show();

    expect(screen.getAllByText(vi["practice.flatOnly"])).toHaveLength(1);
    expect(screen.getAllByText(vi["practice.notInMatch"])).toHaveLength(1);
    expect(screen.getAllByText(vi["practice.offlineNote"])).toHaveLength(1);
  });

  it("refuses an impossible question with the reason, keeping the inputs", () => {
    show();

    fireEvent.change(field(vi["practice.angle"]), { target: { value: "0" } });
    expect(answer()).toMatch(/Không giải được/);
    expect(answer()).toMatch(/góc phải trong 0…180/);
    expect(field(vi["practice.angle"])).toHaveValue(0);

    fireEvent.change(field(vi["practice.angle"]), { target: { value: "45" } });
    fireEvent.change(field(vi["practice.distance"]), { target: { value: "24" } });
    expect(answer()).toMatch(/không tới được ở góc này/);
    expect(answer()).not.toMatch(/\d,\d\d/);
  });

  it("refuses a cleared height instead of printing NaN, and answers a target below the muzzle", () => {
    show();

    fireEvent.change(field(vi["practice.height"]), { target: { value: "" } });
    expect(answer()).toMatch(/chênh cao phải là một số/);
    expect(answer()).not.toMatch(/NaN/);

    // A downhill target is a question like any other; it lands sooner, so the distance comes in with it
    // (a target 2.5 phần below the muzzle is out of the 22.14 phần reach, and the solver used to call that unreachable).
    fireEvent.change(field(vi["practice.height"]), { target: { value: "-2.5" } });
    fireEvent.change(field(vi["practice.distance"]), { target: { value: "18" } });
    expect(answer()).not.toMatch(/Không giải được/);
    expect(answer()).toMatch(/\d,\d\d/);
  });

  it("holds the wind at the engine ceiling instead of asking the solver about a hurricane", () => {
    show();

    fireEvent.change(field(vi["practice.wind"]), { target: { value: "40" } });
    expect(field(vi["practice.wind"])).toHaveValue(26);
  });

  it("reads the wind direction and the machine the player picked", () => {
    show();

    const calm = answer();
    fireEvent.change(field(vi["practice.wind"]), { target: { value: "20" } });
    fireEvent.click(screen.getByLabelText(vi["practice.windWest"]));
    // The same question in a strong headwind no longer has the same answer — here, no answer at all.
    expect(answer()).not.toEqual(calm);

    fireEvent.change(field(vi["practice.wind"]), { target: { value: "0" } });
    const reference = answer();
    fireEvent.change(field(vi["practice.machine"]), { target: { value: "mbl-05" } });
    expect(answer()).not.toEqual(reference);
  });
});

describe("TC-BAL-154: every string comes from the copy tables (US-BAL-007 AC5)", () => {
  it("renders English when the locale is English, using the en table", () => {
    localStorage.setItem("gbw.locale", "en");
    show();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(en["practice.title"]);
    expect(screen.getByText(en["practice.flatOnly"])).toBeInTheDocument();
    expect(screen.getByText(en["practice.notInMatch"])).toBeInTheDocument();
    // Numbers keep two decimals in the English locale too.
    expect(answer()).toMatch(/4\.00/);
  });

  it("has a key in both tables for every string the screen prints", () => {
    const keys = Object.keys(vi).filter((key) => key.startsWith("practice."));
    expect(keys.length).toBeGreaterThanOrEqual(20);
    for (const key of keys) {
      expect(en).toHaveProperty(key);
      expect(vi[key as keyof typeof vi]).not.toBe("");
      expect(en[key as keyof typeof en]).not.toBe("");
    }
  });
});

describe("TC-BAL-155: the screen makes no request and needs no session (US-BAL-007 AC5)", () => {
  it("solves with the network unavailable and never calls fetch", () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = ((..._args: Parameters<typeof fetch>) => {
      calls += 1;
      return Promise.reject(new TypeError("offline"));
    }) as typeof fetch;

    try {
      show();
      fireEvent.change(field(vi["practice.wind"]), { target: { value: "6" } });

      // A different question, still answered on the device.
      expect(answer()).toMatch(/\d,\d\d/);
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("announces the answer, so a screen reader hears it change", () => {
    show();

    const announced = screen.getByRole("status");
    expect(announced).toHaveAttribute("aria-live", "polite");
    expect(within(announced).getByText(/4,00/)).toBeInTheDocument();
  });
});
