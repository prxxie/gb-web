// @vitest-environment jsdom
/**
 * TC-MATCH-906: the weapon strip (`US-MATCH-005` AC1–AC3).
 *
 * The strip is DOM (not canvas) so the weapon name, its charge state and the selected slot are text
 * a screen reader can read (AC7). Tapping a slot hands the *slot index* to the caller — that index
 * is the `weaponSlot` the shot frame carries.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getMobile } from "@gbw/core";
import { WeaponStrip } from "../src/components/WeaponStrip";

const WEAPONS = getMobile("mbl-01").weapons;
const NAMES = ["Đạn 1", "Đạn 2", "Siêu đạn"] as const;
const CHARGE_LABELS = ["Sẵn sàng", "Sẵn sàng", "Còn 1/1"] as const;
const LABEL = "Vũ khí";

afterEach(cleanup);

function strip(overrides: Partial<Parameters<typeof WeaponStrip>[0]> = {}) {
  const onSelect = vi.fn();
  render(
    <WeaponStrip
      weapons={WEAPONS}
      active={0}
      charges={[1, 1, 1]}
      names={NAMES}
      chargeLabels={CHARGE_LABELS}
      label={LABEL}
      onSelect={onSelect}
      {...overrides}
    />,
  );
  return { onSelect };
}

describe("TC-MATCH-906: three weapons, one selected", () => {
  it("renders all three slots with their names inside the labelled group", () => {
    strip();
    const group = screen.getByRole("group", { name: LABEL });
    const slots = screen.getAllByRole("button");
    expect(slots).toHaveLength(3);
    expect(group).toContainElement(slots[0]!);
    for (const slot of slots) expect(slot).toHaveTextContent(/đạn/i);
  });

  it("marks the selected slot pressed and only that one", () => {
    strip({ active: 1 });
    expect(screen.getByTestId("weapon-0")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("weapon-1")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("weapon-2")).toHaveAttribute("aria-pressed", "false");
  });

  it("names each slot with its weapon and charge state for a screen reader (AC7)", () => {
    strip();
    expect(screen.getByTestId("weapon-1")).toHaveAccessibleName(`${NAMES[1]} — ${WEAPONS[1]!.name} (${CHARGE_LABELS[1]})`);
  });
});

describe("TC-MATCH-906: picking a slot sends that slot", () => {
  it("tapping slot 1 asks for weapon slot 1 exactly once", async () => {
    const { onSelect } = strip();
    await userEvent.click(screen.getByTestId("weapon-1"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("the slot's own index is what is sent, for all three slots", async () => {
    const { onSelect } = strip();
    for (const slot of [0, 1, 2] as const) {
      await userEvent.click(screen.getByTestId(`weapon-${slot}`));
      expect(onSelect).toHaveBeenLastCalledWith(slot);
      expect(screen.getByTestId(`weapon-${slot}`)).toHaveAttribute("data-slot", String(slot));
    }
    expect(onSelect).toHaveBeenCalledTimes(3);
  });
});

describe("TC-MATCH-906: a spent super shot is empty for the rest of the match (AC3)", () => {
  it("disables slot 2 and shows the spent label", async () => {
    const { onSelect } = strip({ charges: [1, 1, 0], chargeLabels: ["Sẵn sàng", "Sẵn sàng", "Đã dùng"] });
    const superShot = screen.getByTestId("weapon-2");
    expect(superShot).toBeDisabled();
    expect(screen.getByTestId("weapon-charge-2").textContent).toBe("Đã dùng");
    await userEvent.click(superShot);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("leaves the other two slots usable", () => {
    strip({ charges: [1, 1, 0] });
    expect(screen.getByTestId("weapon-0")).toBeEnabled();
    expect(screen.getByTestId("weapon-1")).toBeEnabled();
  });

  it("locks every slot while the turn is over", async () => {
    const { onSelect } = strip({ disabled: true });
    for (const slot of [0, 1, 2]) expect(screen.getByTestId(`weapon-${slot}`)).toBeDisabled();
    await userEvent.click(screen.getByTestId("weapon-0"));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
