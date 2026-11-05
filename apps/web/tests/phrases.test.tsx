// @vitest-environment jsdom
/**
 * TC-MATCH-905: skip and preset phrases (`US-MATCH-004` AC1–AC3/AC7).
 *
 * The picker never sends text — only ids — and skip is a separate intent with no chat attached.
 * The rate limit itself is covered by `match-controls.test.tsx`; here the contract is "one tap, one
 * frame, the right id".
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhrasePicker } from "../src/components/PhrasePicker";

const PHRASES = Array.from({ length: 12 }, (_, index) => `phrase-${String(index + 1).padStart(2, "0")}`);
const EMOTES = Array.from({ length: 8 }, (_, index) => `emote-${String(index + 1).padStart(2, "0")}`);
const LABELS = { skip: "Bỏ lượt", phrases: "Câu nói nhanh", emotes: "Cảm xúc" };

afterEach(cleanup);

function picker(overrides: Partial<Parameters<typeof PhrasePicker>[0]> = {}) {
  const onSkip = vi.fn();
  const onChat = vi.fn();
  render(
    <PhrasePicker
      skipEnabled
      phraseIds={PHRASES}
      emoteIds={EMOTES}
      labels={LABELS}
      phraseText={(id) => `nội dung ${id}`}
      emoteText={(id) => `cảm xúc ${id}`}
      onSkip={onSkip}
      onChat={onChat}
      {...overrides}
    />,
  );
  return { onSkip, onChat };
}

describe("TC-MATCH-905: skip", () => {
  it("sends skip once and nothing else (AC1)", async () => {
    const { onSkip, onChat } = picker();
    await userEvent.click(screen.getByTestId("match-skip"));
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onChat).not.toHaveBeenCalled();
  });

  it("is disabled outside the player's turn and sends nothing then (AC2)", async () => {
    const { onSkip } = picker({ skipEnabled: false });
    const skip = screen.getByTestId("match-skip");
    expect(skip).toBeDisabled();
    await userEvent.click(skip);
    expect(onSkip).not.toHaveBeenCalled();
  });
});

describe("TC-MATCH-905: a chosen phrase", () => {
  it("sends the chosen id once, as a quick_phrase (AC3)", async () => {
    const { onChat, onSkip } = picker();
    await userEvent.click(screen.getByTestId("phrase-phrase-03"));
    expect(onSkip).not.toHaveBeenCalled();
    expect(onChat).toHaveBeenCalledTimes(1);
    expect(onChat).toHaveBeenCalledWith("quick_phrase", "phrase-03");
  });

  it("sends no text at all — only the id crosses the wire (AC7)", async () => {
    const { onChat } = picker();
    await userEvent.click(screen.getByTestId("phrase-phrase-07"));
    const [kind, id] = onChat.mock.calls[0] as [string, string];
    expect(kind).toBe("quick_phrase");
    expect(id).toBe("phrase-07");
    expect(onChat.mock.calls[0]).toHaveLength(2);
  });

  it("an emote uses its own kind", async () => {
    const { onChat } = picker();
    await userEvent.click(screen.getByTestId("emote-emote-04"));
    expect(onChat).toHaveBeenCalledWith("emote", "emote-04");
  });
});

describe("TC-MATCH-905: the picker's surface", () => {
  it("shows the fixed 12-phrase grid and the 8 emotes in labelled groups", () => {
    picker();
    const phrases = screen.getByRole("group", { name: LABELS.phrases });
    const emotes = screen.getByRole("group", { name: LABELS.emotes });
    expect(within(phrases).getAllByRole("button")).toHaveLength(12);
    expect(within(emotes).getAllByRole("button")).toHaveLength(8);
  });

  it("offers no free-text field anywhere in the picker", () => {
    const { container } = render(
      <PhrasePicker
        skipEnabled
        phraseIds={PHRASES}
        emoteIds={EMOTES}
        labels={LABELS}
        phraseText={(id) => id}
        emoteText={(id) => id}
        onSkip={vi.fn()}
        onChat={vi.fn()}
      />,
    );
    expect(container.querySelector("input, textarea, [contenteditable]")).toBeNull();
  });
});
