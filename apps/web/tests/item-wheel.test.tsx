// @vitest-environment jsdom
/**
 * TC-MATCH-951: the loadout fans out around the player's own mobile (`US-MATCH-006` AC3, owner's layout 2026-11-09).
 *
 * The six slots left the bottom bar: a press **held on the mobile** opens them as a half circle around it, a pick or a press
 * anywhere else closes them again. What is under test here is the geometry of the arc and the two ways out — the gesture
 * itself lives in `scene.ts` and is covered by the gesture cases.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  ITEM_SLOTS,
  ItemWheel,
  WHEEL_RADIUS,
  wheelAngle,
  wheelCentre,
  wheelPoint,
  type EquippedItem,
} from "../src/components/ItemWheel";

afterEach(cleanup);

const AT = { x: 400, y: 300 };

const ITEMS: readonly EquippedItem[] = [
  { id: "itm-dual-plus", qty: 2, delay: 40, name: "Đạn đôi" },
  { id: "itm-heal", qty: 1, delay: 0, name: "Sửa chữa" },
];

function wheel(overrides: Partial<Parameters<typeof ItemWheel>[0]> = {}) {
  const onUse = vi.fn();
  const onClose = vi.fn();
  render(
    <ItemWheel
      items={ITEMS}
      enabled
      at={AT}
      label="Vật phẩm"
      quantityLabel="Số lượng"
      delayLabel="Độ trễ"
      onUse={onUse}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onUse, onClose };
}

describe("TC-MATCH-951: the arc", () => {
  it("fans the slots over a half circle, left to right", () => {
    const angles = Array.from({ length: ITEM_SLOTS }, (_, index) => wheelAngle(index, ITEM_SLOTS));
    // Every slot points upwards: 180° (left) down to 0° (right), never below the horizontal.
    expect(angles.every((angle) => angle > 0 && angle < 180)).toBe(true);
    // Monotonic, so slot order reads left to right and never zig-zags.
    for (let index = 1; index < angles.length; index += 1) {
      expect(angles[index]!).toBeLessThan(angles[index - 1]!);
    }
    // Symmetric about the vertical: the first and last slots sit at the same height.
    const first = wheelPoint(AT, angles[0]!);
    const last = wheelPoint(AT, angles[angles.length - 1]!);
    expect(first.y).toBeCloseTo(last.y, 5);
    expect(first.x + last.x).toBeCloseTo(AT.x * 2, 5);
  });

  it("puts every slot above the mobile, inside the radius", () => {
    for (let index = 0; index < ITEM_SLOTS; index += 1) {
      const point = wheelPoint(AT, wheelAngle(index, ITEM_SLOTS));
      // Screen y grows downwards, so "above" is a smaller y.
      expect(point.y).toBeLessThan(AT.y);
      expect(Math.hypot(point.x - AT.x, point.y - AT.y)).toBeCloseTo(WHEEL_RADIUS, 5);
    }
  });

  it("keeps every slot on screen and evenly spaced at any hull position", () => {
    // Measured in a real match: a hull at `x 76` put the leftmost slot at `x −13`, and clamping the wedges one by one
    // stacked the two end slots on top of each other. The arc moves as a whole instead.
    const bounds = { width: 844, height: 390 };
    for (const at of [{ x: 76, y: 300 }, { x: 800, y: 300 }, { x: 420, y: 300 }, { x: 60, y: 372 }]) {
      const centre = wheelCentre(at, bounds);
      const points = Array.from({ length: ITEM_SLOTS }, (_, index) =>
        wheelPoint(centre, wheelAngle(index, ITEM_SLOTS), WHEEL_RADIUS),
      );
      // No two slots closer than a slot's own width: a crowded arc is a mis-tap.
      for (let a = 0; a < points.length; a += 1) {
        for (let b = a + 1; b < points.length; b += 1) {
          expect(Math.hypot(points[a]!.x - points[b]!.x, points[a]!.y - points[b]!.y)).toBeGreaterThan(44);
        }
      }
      for (const point of points) {
        expect(point.x).toBeGreaterThanOrEqual(30);
        expect(point.x).toBeLessThanOrEqual(844 - 30);
        expect(point.y).toBeGreaterThanOrEqual(30);
        expect(point.y).toBeLessThanOrEqual(390 - 30);
      }
    }
  });

  it("draws six slots even with two items, so the arc never reflows", () => {
    const { container } = render(
      <ItemWheel
        items={ITEMS}
        enabled
        at={AT}
        label="Vật phẩm"
        quantityLabel="Số lượng"
        delayLabel="Độ trễ"
        onUse={() => undefined}
        onClose={() => undefined}
      />,
    );
    // Six wedges whether or not they hold something: a filled slot is a button, an empty one a placeholder.
    expect(container.querySelectorAll(".item-wheel__slot")).toHaveLength(ITEM_SLOTS);
    expect(screen.getByTestId("item-itm-dual-plus")).toBeTruthy();
    expect(screen.getByTestId("item-itm-heal")).toBeTruthy();
    for (let index = ITEMS.length; index < ITEM_SLOTS; index += 1) {
      expect(screen.getByTestId(`item-slot-${index}`)).toBeTruthy();
    }
  });

  it("positions each slot on the arc, not in a row", () => {
    const { container } = render(
      <ItemWheel
        items={ITEMS}
        enabled
        at={AT}
        label="Vật phẩm"
        quantityLabel="Số lượng"
        delayLabel="Độ trễ"
        onUse={() => undefined}
        onClose={() => undefined}
      />,
    );
    const slots = [...container.querySelectorAll<HTMLElement>(".item-wheel__slot")];
    const tops = slots.map((slot) => Number.parseFloat(slot.style.top));
    // A row would share one `top`; an arc cannot.
    expect(new Set(tops).size).toBeGreaterThan(1);
    const lefts = slots.map((slot) => Number.parseFloat(slot.style.left));
    for (let index = 1; index < lefts.length; index += 1) {
      expect(lefts[index]!).toBeGreaterThan(lefts[index - 1]!);
    }
  });
});

describe("TC-MATCH-951: the two ways out", () => {
  it("uses the item and closes the wheel in the same tap", () => {
    const { onUse, onClose } = wheel();
    screen.getByTestId("item-itm-dual-plus").click();
    expect(onUse).toHaveBeenCalledWith("itm-dual-plus");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the player presses anywhere else", () => {
    const { onUse, onClose } = wheel();
    screen.getByTestId("item-wheel-scrim").click();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onUse).not.toHaveBeenCalled();
  });

  it("refuses an item the turn cannot use, and one with no stock", () => {
    wheel({ enabled: false });
    expect((screen.getByTestId("item-itm-dual-plus") as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    wheel({ items: [{ id: "itm-heal", qty: 0, delay: 0, name: "Sửa chữa" }] });
    expect((screen.getByTestId("item-itm-heal") as HTMLButtonElement).disabled).toBe(true);
  });

  it("prints the stock on the slot", () => {
    wheel();
    expect(screen.getByTestId("item-qty-itm-dual-plus").textContent).toBe("2");
  });
});
