/**
 * What an alarm owes the platform when a room sits with nobody in it (`US-ROOM-011`).
 *
 * A room whose sockets have gone keeps a roster and an idle window, so the sweep that is due has already passed by the
 * time it is scheduled. Scheduling that instant again is an alarm that fires immediately and re-arms itself — measured on
 * production at ~600 Durable Object requests a minute for ten minutes per room (see `docs/01-overview/runbook.md` § 7).
 * The object must always ask for a wake that is still ahead of it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TUNABLES } from "@gbw/core";
import { MIN_SWEEP_DELAY_MS } from "../src/room/protocol.js";
import { RoomHarness } from "./support/room-harness";

const BASE = 1_700_000_000_000;

describe("a sweep is never scheduled in the past", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Two players, both sockets dropped, nobody sends another frame: the quiet lobby a load test leaves behind. */
  async function abandonedLobby(): Promise<RoomHarness> {
    const harness = new RoomHarness();
    await harness.ready();
    await harness.join({ playerId: "host", accountId: "acct-host" });
    await harness.join({ playerId: "p1", accountId: "acct-p1" });
    const hostSocket = await harness.connect("host");
    const p1Socket = await harness.connect("p1");
    vi.setSystemTime(BASE + 50_000);
    await harness.close(hostSocket);
    await harness.close(p1Socket);
    return harness;
  }

  it("TC-ROOM-716 an overdue sweep asks for a wake that is still ahead", async () => {
    const harness = await abandonedLobby();

    // Two minutes past the lobby's sixty-second sweep, well inside the ten-minute idle window.
    vi.setSystemTime(BASE + 180_000);
    await harness.alarm();

    const next = harness.alarmAt();
    expect(next).not.toBeNull();
    expect(next as number).toBeGreaterThan(Date.now());
    expect(next as number).toBeGreaterThanOrEqual(Date.now() + MIN_SWEEP_DELAY_MS);
  });

  it("TC-ROOM-717 the clamp does not postpone the idle expiry that closes the room", async () => {
    const harness = await abandonedLobby();

    // The idle window runs out ten minutes after the last activity.
    vi.setSystemTime(BASE + 50_000 + TUNABLES.roomIdleMs + 1_000);
    await harness.alarm();

    expect(harness.alarmAt()).toBeNull();
  });

  it("TC-ROOM-718 a quiet room wakes a bounded number of times per idle window", async () => {
    const harness = await abandonedLobby();
    const idleUntil = BASE + 50_000 + TUNABLES.roomIdleMs;
    let wakes = 0;
    let now = BASE + 60_000;

    // Play the object's own clock: each alarm wakes it, and the next one is whatever it asked for.
    while (now < idleUntil && wakes < 10_000) {
      vi.setSystemTime(now);
      await harness.alarm();
      const next = harness.alarmAt();
      if (next === null) break;
      wakes += 1;
      now = next;
      if (next <= Date.now() - 1) {
        // A wake that is already in the past would fire again for free: that is the spin.
        expect(next, "an alarm was re-armed at or before the instant it fired").toBeGreaterThan(Date.now());
      }
    }

    // One wake per clamped delay across the window, not one per event loop turn.
    expect(wakes).toBeLessThanOrEqual(Math.ceil(TUNABLES.roomIdleMs / MIN_SWEEP_DELAY_MS) + 2);
  });
});
