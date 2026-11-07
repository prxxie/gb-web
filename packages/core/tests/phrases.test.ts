/**
 * The preset chat catalogue (`US-MATCH-004` AC5, AC7, `OQ-17`).
 *
 * The protocol refuses any id outside this list, so the list itself is the contract: twelve quick phrases, eight
 * emotes, no id shared between the two kinds — an emote that answered to `phrase-01` would let a client send one kind
 * and render the other.
 */
import { describe, expect, it } from "vitest";
import { EMOTE_IDS, PHRASE_IDS, isChatId, isChatKind } from "../src/phrases.js";

describe("TC-CORE-963: the chat catalogue is the wire contract (US-MATCH-004 AC5, AC7)", () => {
  it("offers twelve quick phrases and eight emotes", () => {
    expect(PHRASE_IDS.length).toBe(12);
    expect(EMOTE_IDS.length).toBe(8);
  });

  it("names every id once, and never in both kinds", () => {
    expect(new Set(PHRASE_IDS).size).toBe(PHRASE_IDS.length);
    expect(new Set(EMOTE_IDS).size).toBe(EMOTE_IDS.length);
    expect(PHRASE_IDS.filter((id) => (EMOTE_IDS as readonly string[]).includes(id))).toEqual([]);
  });

  it("accepts an id only for its own kind", () => {
    expect(isChatId("quick_phrase", "phrase-01")).toBe(true);
    expect(isChatId("emote", "emote-08")).toBe(true);
    expect(isChatId("quick_phrase", "emote-01")).toBe(false);
    expect(isChatId("emote", "phrase-01")).toBe(false);
    expect(isChatId("quick_phrase", "phrase-13")).toBe(false);
    expect(isChatId("emote", "")).toBe(false);
    expect(isChatId("emote", 7)).toBe(false);
  });

  it("knows exactly the two kinds", () => {
    expect(isChatKind("quick_phrase")).toBe(true);
    expect(isChatKind("emote")).toBe(true);
    expect(isChatKind("shout")).toBe(false);
    expect(isChatKind(undefined)).toBe(false);
  });
});
