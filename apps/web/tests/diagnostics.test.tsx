// @vitest-environment jsdom
/**
 * TC-NET-012: a snapshot from a host that lost the election is counted, not just dropped (`US-NET-004` AC4).
 *
 * Dropping was already right — `resyncFromSnapshot` refuses a lower generation — but nothing recorded it, so a match
 * that kept rewinding had no evidence and the support report said "it flickers sometimes". This counter is what the
 * manual check reads from the console, per the story's § 5.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import { countRejectedSnapshot, rejectionCounts, resetRejections } from "../src/net/diagnostics";

describe("TC-NET-012: rejected snapshots are counted (US-NET-004 AC4)", () => {
  beforeEach(() => {
    resetRejections();
  });
  afterEach(cleanup);

  it("starts at zero and counts each drop", () => {
    expect(rejectionCounts().snapshot).toBe(0);
    countRejectedSnapshot();
    countRejectedSnapshot();
    expect(rejectionCounts().snapshot).toBe(2);
  });

  it("is readable through one object, so a support check has a single name", () => {
    countRejectedSnapshot();
    expect(rejectionCounts()).toMatchObject({ snapshot: 1 });
    expect(Object.keys(rejectionCounts())).toEqual(["snapshot"]);
  });

  it("resets, so a manual check can start from a known number", () => {
    countRejectedSnapshot();
    resetRejections();
    expect(rejectionCounts().snapshot).toBe(0);
  });
});
