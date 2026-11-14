/**
 * TC-ROOM-724 — the D1 directory is written by the Room DO only on lifecycle transitions.
 *
 * The room itself remains the authority. These cases inspect the projection after a real join, start, socket
 * leave and close, and prove that heartbeat or snapshot traffic leaves the row untouched.
 */
import { describe, expect, it, vi } from "vitest";
import { FakeDb } from "./support/fake-env";
import { makeSnapshot, RoomHarness } from "./support/room-harness";

interface DirectoryRow {
  readonly room_code: string;
  readonly status: "waiting" | "playing";
  readonly seated: number;
  readonly max_players: number;
  readonly is_private: number;
  readonly joinable: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly expires_at: string;
}

function directory(db: FakeDb): DirectoryRow[] {
  return db.rows<DirectoryRow>("room_directory");
}

describe("TC-ROOM-724: public directory lifecycle", () => {
  it("projects create, join, start and leave, ignores heartbeat/snapshot traffic, then deletes on close", async () => {
    // Arrange
    const db = new FakeDb();
    const harness = new RoomHarness({ db: db as unknown as D1Database });
    await harness.ready();

    // Act — create is the host's first join
    await harness.join({ playerId: "h", accountId: "acct-h" });

    // Assert
    let rows = directory(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      room_code: "ABCD23",
      status: "waiting",
      seated: 1,
      max_players: 4,
      is_private: 0,
      joinable: 1,
    });
    const createdAt = rows[0]?.created_at;
    const waitingExpiry = Date.parse(rows[0]?.expires_at ?? "");
    const waitingUpdated = Date.parse(rows[0]?.updated_at ?? "");
    expect(waitingExpiry - waitingUpdated).toBeGreaterThanOrEqual(10 * 60_000 - 1_000);
    expect(waitingExpiry - waitingUpdated).toBeLessThanOrEqual(10 * 60_000);

    // Act — a second seat
    await harness.join({ playerId: "p1", accountId: "acct-p1" });
    rows = directory(db);

    // Assert
    expect(rows[0]).toMatchObject({ status: "waiting", seated: 2, joinable: 1, created_at: createdAt });

    // Act — start the four-seat match
    const sockets = await harness.startPlaying(["h", "p1", "p2", "p3"]);
    rows = directory(db);

    // Assert
    expect(rows[0]).toMatchObject({ status: "playing", seated: 4, joinable: 0, created_at: createdAt });
    const playingDuration = Date.parse(rows[0]?.expires_at ?? "") - Date.parse(rows[0]?.updated_at ?? "");
    expect(playingDuration).toBeGreaterThanOrEqual(24 * 60 * 60_000 - 1_000);
    expect(playingDuration).toBeLessThanOrEqual(24 * 60 * 60_000);

    // Act — ordinary heartbeat and snapshot traffic
    const writtenBeforeTraffic = rows[0]?.updated_at;
    const host = sockets.get("h");
    if (!host) throw new Error("the host socket was not created");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await harness.message(host, { t: "ping", at: Date.now() });
    await harness.message(host, {
      t: "snapshot_push",
      snapshot: makeSnapshot(1, harness.state().hostGeneration),
    });
    rows = directory(db);

    // Assert — no directory write happened
    expect(rows[0]?.updated_at).toBe(writtenBeforeTraffic);

    // Act — a socket leave updates the seat count
    const p3 = sockets.get("p3");
    if (!p3) throw new Error("the p3 socket was not created");
    await harness.message(p3, { t: "leave" });
    rows = directory(db);

    // Assert
    expect(rows[0]).toMatchObject({ status: "playing", seated: 3, joinable: 0, created_at: createdAt });

    // Act — no sockets remain and the idle window has passed, so the room closes
    for (const socket of [sockets.get("h"), sockets.get("p1"), sockets.get("p2")]) {
      if (socket) await harness.close(socket);
    }
    harness.state().lastActivityAt = Date.now() - 11 * 60_000;
    await harness.alarm();

    // Assert
    expect(directory(db)).toEqual([]);
    db.close();
  });

  it("keeps a private room out of the projection while preserving its code in the Room DO", async () => {
    // Arrange
    const db = new FakeDb();
    const harness = new RoomHarness({ db: db as unknown as D1Database });
    await harness.ready();
    const response = await harness.do.fetch(
      new Request("https://room.internal/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playerId: "host",
          accountId: "acct-host",
          guestId: null,
          displayName: "Bao",
          avatarId: "av-01",
          mobileId: "mbl-01",
          roomCode: "ABCD23",
          settings: { maxPlayers: 4, mode: "solo", mapId: "map-01", isPrivate: true },
        }),
      }),
    );

    // Assert
    expect(response.status).toBe(200);
    expect(harness.state().roomCode).toBe("ABCD23");
    expect(directory(db)).toEqual([]);
    db.close();
  });

  it("does not make the authoritative room fail when D1 is unavailable, and retries on the next transition", async () => {
    // Arrange
    const db = new FakeDb();
    let failWrites = true;
    const flaky = {
      prepare(sql: string) {
        if (failWrites && sql.includes("INSERT INTO room_directory")) throw new Error("D1 unavailable");
        return db.prepare(sql);
      },
    } as unknown as D1Database;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const harness = new RoomHarness({ db: flaky });
    await harness.ready();

    // Act — the room authority commits even though the read model cannot
    await expect(harness.join({ playerId: "h", accountId: "acct-h" })).resolves.toMatchObject({ playerId: "h" });
    expect(directory(db)).toEqual([]);

    // Act — the next lifecycle transition sees that the previous key was never stored
    failWrites = false;
    await harness.join({ playerId: "p1", accountId: "acct-p1" });

    // Assert
    expect(directory(db)).toHaveLength(1);
    expect(directory(db)[0]).toMatchObject({ seated: 2, status: "waiting" });
    warning.mockRestore();
    db.close();
  });

  it("does not rewrite the directory on the first persist after a DO restart", async () => {
    // Arrange
    const db = new FakeDb();
    const first = new RoomHarness({ db: db as unknown as D1Database });
    await first.ready();
    await first.join({ playerId: "h", accountId: "acct-h" });
    const updatedAt = directory(db)[0]?.updated_at;

    // Act — a fresh object reads the same storage, then persists without a lifecycle change
    const restarted = new RoomHarness({ db: db as unknown as D1Database, context: first.ctx });
    await restarted.ready();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await (restarted.do as unknown as { persist(): Promise<void> }).persist();

    // Assert
    expect(directory(db)[0]?.updated_at).toBe(updatedAt);
    db.close();
  });
});
