// @vitest-environment jsdom
/**
 * TC-PWA-130: locale loading and completeness (`US-FND-003` AC2–AC3, `US-PWA-002` AC1–AC3).
 *
 * Nothing here asserts a fixture: the strings checked are the real tables, and the "no leak" case
 * compares what the provider renders against every value in the other table.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocaleProvider, useLocale } from "../src/app/providers";
import { translate } from "../src/i18n";
import en from "../src/i18n/en.json";
import vi from "../src/i18n/vi.json";

/** Five real strings from five different screens, so a swap has to reach more than the title. */
const SAMPLE = ["app.title", "main.playBot", "main.createRoom", "lobby.start", "match.yourTurn"] as const;

function Harness() {
  const { locale, t, setLocale } = useLocale();
  return (
    <div>
      <button type="button" onClick={() => setLocale(locale === "vi" ? "en" : "vi")}>
        {locale.toUpperCase()}
      </button>
      <h1>{t("app.title")}</h1>
      {SAMPLE.slice(1).map((key) => (
        <p key={key} data-key={key}>
          {t(key)}
        </p>
      ))}
      <p data-testid="waiting">{t("match.waitingTurn", { name: "An" })}</p>
    </div>
  );
}

function mount() {
  return render(
    <LocaleProvider>
      <Harness />
    </LocaleProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.lang = "";
});

afterEach(cleanup);

describe("TC-PWA-130: the first paint", () => {
  it("starts in Vietnamese with no stored choice (AC2)", () => {
    mount();
    expect(document.documentElement.lang).toBe("vi");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(vi["app.title"]);
    expect(screen.getByRole("button")).toHaveTextContent("VI");
  });

  it("starts in the stored language instead (AC3)", () => {
    localStorage.setItem("gbw.locale", "en");
    mount();
    expect(document.documentElement.lang).toBe("en");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(en["app.title"]);
  });
});

describe("TC-PWA-130: switching", () => {
  it("swaps every visible string and updates <html lang>", async () => {
    mount();
    for (const key of SAMPLE) {
      const shown = key === "app.title" ? screen.getByRole("heading", { level: 1 }) : screen.getByText(vi[key as keyof typeof vi]);
      expect(shown).toBeTruthy();
    }

    await userEvent.click(screen.getByRole("button"));

    expect(document.documentElement.lang).toBe("en");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(en["app.title"]);
    for (const key of SAMPLE.slice(1)) {
      const paragraph = document.querySelector(`[data-key="${key}"]`);
      expect(paragraph).toHaveTextContent(en[key as keyof typeof en]);
      expect(paragraph).not.toHaveTextContent(vi[key as keyof typeof vi]);
    }
    expect(screen.getByRole("button")).toHaveTextContent("EN");
  });

  it("persists the choice under gbw.locale (AC3)", async () => {
    mount();
    await userEvent.click(screen.getByRole("button"));
    expect(localStorage.getItem("gbw.locale")).toBe("en");
  });

  it("leaves no Vietnamese string from the tables on screen (AC1)", async () => {
    mount();
    await userEvent.click(screen.getByRole("button"));

    const changed = Object.keys(vi).filter(
      (key) => key in en && vi[key as keyof typeof vi] !== en[key as keyof typeof en] && vi[key as keyof typeof vi].length > 3,
    );
    const text = document.body.textContent ?? "";
    const leaked = changed.filter((key) => text.includes(vi[key as keyof typeof vi] as string));
    expect(leaked).toEqual([]);
  });

  it("interpolates a name in the target language", async () => {
    mount();
    expect(screen.getByTestId("waiting")).toHaveTextContent(vi["match.waitingTurn"].replace("{name}", "An"));
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("waiting")).toHaveTextContent(en["match.waitingTurn"].replace("{name}", "An"));
  });
});

describe("TC-PWA-130: table completeness (AC3)", () => {
  it("vi and en have identical key sets", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(vi).sort());
  });

  it("every key translates to a non-empty string in both languages", () => {
    for (const key of Object.keys(vi)) {
      expect(translate("vi", key), `vi.${key}`).toBeTruthy();
      expect(translate("en", key), `en.${key}`).toBeTruthy();
      expect(translate("en", key), `en.${key} fell back to the key`).not.toBe(key);
    }
  });

  it("keeps every {placeholder} the Vietnamese string uses", () => {
    for (const key of Object.keys(vi)) {
      const placeholders = [...(vi[key as keyof typeof vi] as string).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      if (placeholders.length === 0) continue;
      const english = en[key as keyof typeof en] as string;
      expect([...english.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(), key).toEqual(placeholders);
    }
  });
});
