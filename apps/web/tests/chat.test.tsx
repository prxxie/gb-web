// @vitest-environment jsdom
/**
 * TC-MATCH-947: what a chat frame is, how long its banner stays, and what an unknown id renders
 * (`US-MATCH-004` AC3, AC6, AC7).
 *
 * The frame carries an id from the catalogue and nothing else: no free text leaves the client (`OQ-17`), so the
 * receiver translates the id in its own locale (AC5). `translate` throws in development for a missing key, so an id
 * the catalogue does not know is refused here rather than reaching the translator.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { chatFrame, chatText, isChatFrame, toastMs, EMOTE_TOAST_MS, PHRASE_TOAST_MS } from "../src/net/chat";
import { translator } from "../src/i18n";

describe("TC-MATCH-947: a chat frame is an id (US-MATCH-004 AC3, AC6, AC7)", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    cleanup();
    warn.mockRestore();
  });

  it("sends the kind and the id, and no text field at all", () => {
    const frame = chatFrame("quick_phrase", "phrase-01");

    expect(frame).toEqual({ t: "chat", kind: "quick_phrase", id: "phrase-01" });
    expect("text" in frame).toBe(false);
  });

  it("keeps a phrase for three seconds and an emote for one and a half", () => {
    expect(PHRASE_TOAST_MS).toBe(3000);
    expect(EMOTE_TOAST_MS).toBe(1500);
    expect(toastMs("quick_phrase")).toBe(PHRASE_TOAST_MS);
    expect(toastMs("quick_phrase")).toBe(EMOTE_TOAST_MS * 2);
    expect(toastMs("emote")).toBe(EMOTE_TOAST_MS);
  });

  it("renders the receiver's own locale for the same id", () => {
    expect(chatText(translator("vi"), "quick_phrase", "phrase-01")).toBe("Chào nhé!");
    expect(chatText(translator("en"), "quick_phrase", "phrase-01")).toBe("Hello!");
  });

  it("renders nothing for an id outside the catalogue, and says so once", () => {
    expect(chatText(translator("vi"), "quick_phrase", "phrase-99")).toBeNull();
    expect(chatText(translator("vi"), "quick_phrase", "phrase-99")).toBeNull();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("phrase-99");
  });

  it("recognises a chat frame and refuses anything else", () => {
    expect(isChatFrame({ t: "chat", kind: "emote", id: "emote-02" })).toBe(true);
    expect(isChatFrame({ t: "chat", kind: "emote" })).toBe(false);
    expect(isChatFrame({ t: "chat", kind: "shout", id: "emote-02" })).toBe(false);
    expect(isChatFrame({ t: "chat", kind: "emote", id: "emote-02", text: "x" })).toBe(false);
    expect(isChatFrame(null)).toBe(false);
  });
});
