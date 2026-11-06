import { describe, expect, it } from "vitest";

describe("US-FND-001 AC6: a deliberately failing check", () => {
  it("fails on purpose so the required check can be observed red", () => {
    expect("CI must be red here").toBe("and it is");
  });
});
