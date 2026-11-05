// @vitest-environment jsdom
/**
 * TC-MATCH-916: two fingers, pinch, and the size of what a thumb taps
 * (`docs/02-reference/screens/match.md` § gesture table, NFR-17).
 *
 * The gesture arbitration is pure (`game/viewport.ts`): one finger pulls, two fingers pan or zoom,
 * and a second finger that arrives during a pull cancels it instead of firing. The tap-target check
 * reads the real stylesheet because jsdom has no layout — the numbers are the ones the browser gets.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { TUNABLES, defaultWindow, panBy, pinchTo } from "@gbw/core";
import { addPointer, classify, clearPointers, movePointer } from "../src/game/viewport";
import { DirectionPad } from "../src/components/DirectionPad";
import { PhrasePicker } from "../src/components/PhrasePicker";
import { WeaponStrip } from "../src/components/WeaponStrip";

const SHORT_EDGE = 600;
const LABELS = { up: "Tăng góc", down: "Giảm góc", left: "Lùi", right: "Tiến" } as const;

afterEach(cleanup);

function twoFingers(ax: number, ay: number, bx: number, by: number) {
  let state = addPointer(clearPointers(), { id: 1, x: ax, y: ay });
  state = addPointer(state, { id: 2, x: bx, y: by });
  return state;
}

describe("TC-MATCH-916: two fingers move together → pan", () => {
  it("reports the centroid delta of the fingers", () => {
    const start = twoFingers(200, 300, 400, 300);
    const moved = movePointer(movePointer(start, { id: 1, x: 260, y: 340 }), { id: 2, x: 460, y: 340 });
    const gesture = classify(moved, {
      origin: { id: 1, x: 200, y: 300 },
      facing: 1,
      screenShorterEdge: SHORT_EDGE,
      previousSpread: 200,
    });
    expect(gesture.kind).toBe("pan");
    if (gesture.kind !== "pan") return;
    // `origin` is where the first finger landed; pan is measured from there to the new midpoint.
    expect(gesture.dx).toBeCloseTo(160, 0);
    expect(gesture.dy).toBeCloseTo(40, 0);
  });

  it("the pan it produces stops at the map edge instead of showing void (AC4)", () => {
    const window = defaultWindow(5 / 3);
    const panned = panBy(window, -10_000, -10_000, 800);
    expect(panned.x + panned.width).toBe(TUNABLES.mapWidth);
    expect(panned.y + panned.height).toBe(TUNABLES.mapHeight);
  });

  it("a separation change under 12 px is still a pan, not a zoom (AC3)", () => {
    const start = twoFingers(200, 300, 400, 300);
    const nudged = movePointer(movePointer(start, { id: 1, x: 205, y: 300 }), { id: 2, x: 405, y: 300 });
    const gesture = classify(nudged, {
      origin: { id: 1, x: 200, y: 300 },
      facing: 1,
      screenShorterEdge: SHORT_EDGE,
      previousSpread: 200,
    });
    expect(gesture.kind).toBe("pan");
  });
});

describe("TC-MATCH-916: pinch", () => {
  it("zooms by the ratio the spread grew by", () => {
    const spread = 200;
    const start = twoFingers(200, 300, 400, 300);
    const pinched = movePointer(movePointer(start, { id: 1, x: 150, y: 300 }), { id: 2, x: 450, y: 300 });
    const gesture = classify(pinched, {
      origin: { id: 1, x: 200, y: 300 },
      facing: 1,
      screenShorterEdge: SHORT_EDGE,
      previousSpread: spread,
    });
    expect(gesture.kind).toBe("zoom");
    if (gesture.kind !== "zoom") return;
    expect(gesture.scale).toBeCloseTo(300 / spread, 3);
  });

  it("zooms in but never past the 250 × 150 limit (AC3)", () => {
    const window = defaultWindow(5 / 3);
    const zoomed = pinchTo(window, 8, window.x + window.width / 2, window.y + window.height / 2);
    expect(zoomed.width).toBeGreaterThanOrEqual(TUNABLES.zoomMaxWidth);
    expect(zoomed.height).toBeGreaterThanOrEqual(TUNABLES.zoomMaxHeight);
  });

  it("a second finger that arrives mid-pull never fires (AC5)", () => {
    // The pull had an origin (one finger down, dragging); the second finger turns the gesture into a
    // pan/zoom, which is what makes the scene cancel the shot.
    const state = twoFingers(100, 100, 300, 100);
    const gesture = classify(state, {
      origin: { id: 1, x: 100, y: 100 },
      facing: 1,
      screenShorterEdge: SHORT_EDGE,
      previousSpread: 200,
    });
    expect(gesture.kind).not.toBe("pull");
  });

  it("one finger that has not moved is no gesture at all", () => {
    const state = addPointer(clearPointers(), { id: 1, x: 100, y: 100 });
    expect(
      classify(state, { origin: null, facing: 1, screenShorterEdge: SHORT_EDGE, previousSpread: null }).kind,
    ).toBe("none");
  });
});

describe("TC-MATCH-916 / NFR-17: what a thumb taps is at least 60 × 60", () => {
  function size(selector: string): { width: number; height: number } {
    const element = document.querySelector(selector);
    expect(element, `${selector} is rendered`).not.toBeNull();
    const style = getComputedStyle(element as Element);
    return { width: Number.parseFloat(style.minWidth), height: Number.parseFloat(style.minHeight) };
  }

  it("the pad, the skip and the phrase buttons declare a 60 px target", () => {
    const css = readFileSync("apps/web/src/styles.css", "utf8");
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);

    render(
      <>
        <DirectionPad enabled canMove labels={LABELS} onAction={() => undefined} onRepeat={() => undefined} />
        <PhrasePicker
          skipEnabled
          phraseIds={["phrase-01"]}
          emoteIds={["emote-01"]}
          labels={{ skip: "Bỏ lượt", phrases: "Câu nói nhanh", emotes: "Cảm xúc" }}
          phraseText={(id) => id}
          emoteText={(id) => id}
          onSkip={() => undefined}
          onChat={() => undefined}
        />
        <WeaponStrip
          weapons={[]}
          active={0}
          charges={[1, 1, 1]}
          names={["Đạn 1", "Đạn 2", "Siêu đạn"]}
          chargeLabels={["Sẵn sàng", "Sẵn sàng", "Sẵn sàng"]}
          label="Vũ khí"
          onSelect={() => undefined}
        />
      </>,
    );

    // The chat grid is closed by default, so its buttons are measured after opening it: `NFR-17` applies to
    // every target a thumb can reach, closed or open.
    const toggle = document.querySelector('[data-testid="chat-toggle"]');
    expect(toggle, "the chat toggle is rendered").not.toBeNull();
    fireEvent.click(toggle as Element);
    const targets = [".match__pad button", ".match__skip"];
    targets.push(".match__phrases button");
    for (const selector of targets) {
      const { width, height } = size(selector);
      expect(width, `${selector} width`).toBeGreaterThanOrEqual(60);
      expect(height, `${selector} height`).toBeGreaterThanOrEqual(60);
    }
    document.head.removeChild(style);
  });
});
