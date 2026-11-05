/**
 * Grace, forfeit and the recorded result (`US-ROOM-002` AC4, `US-ROOM-004` AC5/AC6).
 * `docs/02-reference/api/signaling.md` § Budgets: three missed pings turn a seat `grace` — the roster must
 * say so before the 20 s window retires the seat, and a team that loses every member forfeits the match.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PING_INTERVAL_MS, PING_MISSES_BEFORE_GRACE, type RoomMember, type Snapshot } from "@gbw/core";
import { makeSnapshot, RoomHarness, type FakeSocket } from "./support/room-harness";

const BASE = 1_700_000_000_000;
const IDS = ["host", "p1", "p2", "p3"] as const;
const ORIGIN = "https://api.test";

async function playingRoom(origin?: string): Promise<{ harness: RoomHarness; sockets: Map<string, FakeSocket> }> {
  const harness = new RoomHarness(origin === undefined ? {} : { origin });
  await harness.ready();
  for (const [index, id] of IDS.entries()) {
    vi.setSystemTime(BASE + index * 1_000);
    await harness.join({ playerId: id, accountId: `acct-${id}` });
  }
  vi.setSystemTime(BASE + 10_000);
  const sockets = new Map<string, FakeSocket>();
  for (const id of IDS) sockets.set(id, await harness.connect(id));
  const host = sockets.get("host");
  if (!host) throw new Error("no host socket");
  await harness.message(host, {
    t: "team_assign",
    assignments: IDS.map((id, index) => ({ playerId: id, team: index % 2 === 0 ? "A" : "B" })),
  });
  await harness.message(host, { t: "start_match" });
  harness.clearAll(sockets.values());
  return { harness, sockets };
}

const roster = (frame: Record<string, unknown>): string[] =>
  ((frame["room"] as { members: readonly RoomMember[] }).members ?? []).map(
    (member) => `${member.playerId}:${member.connectionState}`,
  );

describe("grace and forfeit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("TC-ROOM-127: a silent socket is announced as grace before the window retires it", async () => {
    // Arrange — `p2` stops answering; the others keep pinging
    const { harness, sockets } = await playingRoom();
    const host = sockets.get("host")!;
    const silent = sockets.get("p2")!;
    harness.clearAll(sockets.values());

    // The three live sockets keep answering; `p2` alone goes quiet for three intervals (45 s).
    vi.setSystemTime(BASE + 10_000 + PING_INTERVAL_MS * PING_MISSES_BEFORE_GRACE);
    for (const id of ["host", "p1", "p3"]) await harness.message(sockets.get(id)!, { t: "ping", at: Date.now() });

    // Act — the alarm that follows the heartbeat deadline
    vi.setSystemTime(BASE + 10_000 + PING_INTERVAL_MS * PING_MISSES_BEFORE_GRACE + 2_000);
    await harness.alarm();

    // Assert — the seat is `grace`, not gone: a peer that comes back inside the window keeps its slot
    // (`US-ROOM-004` AC2), so the roster must say `grace` at least once.
    expect(harness.state().members.find((member) => member.playerId === "p2")?.connectionState).toBe("grace");
    expect(host.framesOf("peer_left")).toEqual([{ t: "peer_left", playerId: "p2", reason: "grace" }]);
    expect(roster(host.framesOf("room_state").at(-1) ?? {})).toEqual([
      "host:connected",
      "p1:connected",
      "p2:grace",
      "p3:connected",
    ]);
    expect(silent.readyState).toBe(3);

    // Act — the 20 s window runs out on a later alarm
    for (const id of ["host", "p1", "p3"]) await harness.message(sockets.get(id)!, { t: "ping", at: Date.now() });
    vi.setSystemTime(BASE + 10_000 + PING_INTERVAL_MS * PING_MISSES_BEFORE_GRACE + 22_000);
    await harness.alarm();

    // Assert
    expect(harness.state().members.find((member) => member.playerId === "p2")?.connectionState).toBe("disconnected");
    expect(host.framesOf("peer_left").at(-1)).toEqual({ t: "peer_left", playerId: "p2", reason: "disconnected" });
  });

  it("TC-ROOM-186: a team with nobody left forfeits and the match is recorded as abandoned", async () => {
    // Arrange — `p1` and `p3` are team B; both sockets die
    const posted: unknown[] = [];
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      posted.push({ url: input, body: JSON.parse(String(init?.body ?? "{}")) });
      return Response.json({ matchId: "ABC234-1", ranked: true, ratings: [] }, { status: 201 });
    });
    const { harness, sockets } = await playingRoom(ORIGIN);
    const host = sockets.get("host")!;
    const survivor = sockets.get("p2")!;
    await harness.message(host, { t: "snapshot_push", snapshot: makeSnapshot(1, 1) });
    await harness.close(sockets.get("p1")!);
    await harness.close(sockets.get("p3")!);

    // Act — the grace window expires for both B seats while the A seats keep pinging
    vi.setSystemTime(BASE + 59_000);
    for (const id of ["host", "p2"]) await harness.message(sockets.get(id)!, { t: "ping", at: Date.now() });
    vi.setSystemTime(BASE + 60_000);
    await harness.alarm();

    // Assert — the room ends as `abandoned`, the survivors hear the new status, and the record says so.
    expect(harness.state().status).toBe("abandoned");
    expect(roster(survivor.framesOf("room_state").at(-1) ?? {})).toEqual([
      "host:connected",
      "p1:disconnected",
      "p2:connected",
      "p3:disconnected",
    ]);
    expect(posted).toHaveLength(1);
    const body = posted[0] as { url: string; body: Record<string, unknown> };
    expect(body.url).toBe(`${ORIGIN}/api/v1/matches`);
    expect(body.body["abandoned"]).toBe(true);
    expect(body.body["winnerTeam"]).toBe("A");
    const players = body.body["players"] as readonly { slot: number; team: string; result?: string }[];
    expect(players.map((player) => player.team)).toEqual(["A", "B", "A", "B"]);
    // The B seats abandoned; the A seats that stayed are the winners (`data/matches.md` result enum).
    expect((survivor.framesOf("match_recorded").at(-1)?.["players"] as readonly { slot: number; result: string }[])?.map(
      (player) => player.result,
    )).toEqual(["win", "abandon", "win", "abandon"]);
    expect((await harness.state()).status).toBe("abandoned");
    void (null as Snapshot | null);
  });
});
