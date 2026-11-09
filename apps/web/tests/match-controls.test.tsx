// @vitest-environment jsdom
/**
 * In-match control surfaces (`US-MATCH-005` weapon strip and item tray, `US-MATCH-004` skip and
 * preset chat).
 *
 * These are component-level cases: the shot itself is resolved by `@gbw/core`, which the core tests
 * own, so what is asserted here is what the HUD offers, what it disables, and the exact frame or
 * input a tap produces.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { getMobile } from "@gbw/core";
import { ItemTray, type ItemTrayProps } from "../src/components/ItemTray";
import { PhrasePicker, type PhrasePickerProps } from "../src/components/PhrasePicker";
import { WeaponStrip, type WeaponStripProps } from "../src/components/WeaponStrip";
import { itemFrame } from "../src/net/frames";

const weapons = getMobile("mbl-01").weapons;

// `globals: false` means Testing Library cannot register its own cleanup.
afterEach(cleanup);

function renderStrip(overrides: Partial<WeaponStripProps> = {}): ReturnType<typeof vi.fn> {
  const onSelect = vi.fn();
  render(
    <WeaponStrip
      weapons={weapons}
      active={0}
      charges={[1, 1, 1]}
      names={["Đạn 1", "Đạn 2", "Siêu đạn"]}
      chargeLabels={["Sẵn sàng", "Sẵn sàng", "Còn 1/1"]}
      label="Vũ khí"
      onSelect={onSelect}
      {...overrides}
    />,
  );
  return onSelect;
}

const trayLabels: ItemTrayProps["labels"] = {
  toggle: "Vật phẩm",
  empty: "Chưa có vật phẩm",
  quantity: "SL",
  delay: "Độ trễ",
};

function renderTray(overrides: Partial<ItemTrayProps> = {}): ReturnType<typeof vi.fn> {
  const onUse = vi.fn();
  render(
    <ItemTray
      items={[
        { id: "itm-dual", qty: 0, delay: 20 },
        { id: "itm-blood", qty: 2, delay: 15 },
      ]}
      labels={trayLabels}
      onUse={onUse}
      {...overrides}
    />,
  );
  return onUse;
}

const pickerLabels: PhrasePickerProps["labels"] = {
  skip: "Bỏ lượt",
  phrases: "Câu nói nhanh",
  emotes: "Cảm xúc",
};

function renderPicker(overrides: Partial<PhrasePickerProps> = {}): {
  onSkip: ReturnType<typeof vi.fn>;
  onChat: ReturnType<typeof vi.fn>;
} {
  const onSkip = vi.fn();
  const onChat = vi.fn();
  render(
    <PhrasePicker
      open
      skipEnabled
      phraseIds={["phrase-01", "phrase-02", "phrase-03"]}
      emoteIds={["emote-01", "emote-02"]}
      labels={pickerLabels}
      phraseText={(id) => `phrase text ${id}`}
      emoteText={(id) => `emote text ${id}`}
      onSkip={onSkip}
      onChat={onChat}
      {...overrides}
    />,
  );
  return { onSkip, onChat };
}

describe("TC-MATCH-906: weapon strip", () => {
  it("TC-MATCH-906: shows three slots and marks the active one", () => {
    renderStrip({ active: 1 });
    const strip = screen.getByRole("group", { name: "Vũ khí" });
    expect(strip.querySelectorAll("button")).toHaveLength(3);
    expect(screen.getByTestId("weapon-1").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("weapon-0").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("weapon-2").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("weapon-1").className).toContain("weapon-strip__slot--active");
    expect(screen.getByTestId("weapon-charge-2").textContent).toBe("Còn 1/1");
  });

  it("TC-MATCH-906: selecting another slot changes the aim state", () => {
    const onSelect = renderStrip();
    fireEvent.click(screen.getByTestId("weapon-2"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("TC-MATCH-906: a spent super shot disables its slot for the rest of the match", () => {
    const onSelect = renderStrip({ charges: [1, 1, 0], chargeLabels: ["Sẵn sàng", "Sẵn sàng", "Đã dùng"] });
    const superShot = screen.getByTestId("weapon-2") as HTMLButtonElement;
    expect(superShot.disabled).toBe(true);
    expect(screen.getByTestId("weapon-charge-2").textContent).toBe("Đã dùng");
    fireEvent.click(superShot);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("TC-MATCH-906: a player cannot fire outside their turn", () => {
    const onSelect = renderStrip({ disabled: true });
    for (const slot of [0, 1, 2]) {
      const button = screen.getByTestId(`weapon-${slot}`) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
    }
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("TC-MATCH-006: item tray", () => {
  it("TC-MATCH-006: a zero-quantity item stays visible and disabled", () => {
    renderTray();
    fireEvent.click(screen.getByTestId("item-tray-toggle"));
    const spent = screen.getByTestId("item-itm-dual") as HTMLButtonElement;
    expect(spent.disabled).toBe(true);
    expect(screen.getByTestId("item-qty-itm-dual").textContent).toBe("×0");
    expect(screen.getByTestId("item-delay-itm-dual").textContent).toBe("+20");
  });

  it("TC-MATCH-006: using an item emits exactly one item frame and closes the tray", () => {
    const onUse = renderTray();
    fireEvent.click(screen.getByTestId("item-tray-toggle"));
    fireEvent.click(screen.getByTestId("item-itm-blood"));
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onUse).toHaveBeenCalledWith("itm-blood");
    expect(screen.queryByTestId("item-itm-blood")).toBeNull();
    // The frame is the engine's `ClientFrame`: two keys, no `item` field (`signaling.md` § 9).
    expect(itemFrame("itm-blood")).toEqual({ t: "item", id: "itm-blood" });
    expect(Object.keys(itemFrame("itm-blood"))).toEqual(["t", "id"]);
  });

  it("TC-MATCH-006: an empty tray shows the empty state and no dead buttons", () => {
    renderTray({ items: [] });
    fireEvent.click(screen.getByTestId("item-tray-toggle"));
    expect(screen.getByTestId("item-tray-empty").textContent).toBe("Chưa có vật phẩm");
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("TC-MATCH-006: an item cannot be used outside the player's turn", () => {
    const onUse = renderTray({ enabled: false });
    fireEvent.click(screen.getByTestId("item-tray-toggle"));
    const item = screen.getByTestId("item-itm-blood") as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    fireEvent.click(item);
    expect(onUse).not.toHaveBeenCalled();
  });
});

describe("TC-MATCH-905: skip and preset chat", () => {
  it("TC-MATCH-905: skip sends one skip input and no chat", () => {
    const { onSkip, onChat } = renderPicker();
    fireEvent.click(screen.getByTestId("match-skip"));
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onChat).not.toHaveBeenCalled();
  });

  it("TC-MATCH-905: skip is disabled outside the player's turn", () => {
    const { onSkip } = renderPicker({ skipEnabled: false });
    const skip = screen.getByTestId("match-skip") as HTMLButtonElement;
    expect(skip.disabled).toBe(true);
    fireEvent.click(skip);
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("TC-MATCH-905: a phrase tap sends one quick_phrase and drops the third in a second", () => {
    const { onChat } = renderPicker();
    // The grid opens from the chat button: the closed picker is one 60 × 60 target so the canvas stays free
    // for the pull gesture (`screens/match.md` § Controls).
    fireEvent.click(screen.getByTestId("phrase-phrase-01"));
    fireEvent.click(screen.getByTestId("phrase-phrase-02"));
    fireEvent.click(screen.getByTestId("phrase-phrase-03"));
    expect(onChat).toHaveBeenCalledTimes(2);
    expect(onChat.mock.calls).toEqual([
      ["quick_phrase", "phrase-01"],
      ["quick_phrase", "phrase-02"],
    ]);
  });

  it("TC-MATCH-905: an emote tap sends one emote id", () => {
    const { onChat } = renderPicker();
    fireEvent.click(screen.getByTestId("emote-emote-02"));
    expect(onChat).toHaveBeenCalledTimes(1);
    expect(onChat.mock.calls).toEqual([["emote", "emote-02"]]);
  });
});
