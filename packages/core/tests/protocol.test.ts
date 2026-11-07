/**
 * TC-ROOM-163 — the room-socket protocol parses exactly what `docs/02-reference/api/signaling.md` documents.
 *
 * These cases exist because the frame types used to be a TypeScript union with no runtime check: the web
 * client sent `{ t: "team_assign", playerId, team }` while the Durable Object read `assignments`, and every
 * assignment silently did nothing. Each rejection below is a bug that shipped.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_LOADOUT_QUANTITY,
  MAX_SIGNAL_BYTES,
  PING_MISSES_BEFORE_GRACE,
  PROTOCOL_VERSION,
  parseClientFrame,
  parseServerFrame,
  type ClientFrame,
} from "../src/protocol.js";

const auth = { t: "auth", token: "jwt.token.value", displayName: "An", mobileId: "mbl-01" };

/** A minimal but complete snapshot: every field a peer dereferences is present. */
const SNAPSHOT = {
  seq: 1,
  hostGeneration: 1,
  turn: { number: 1, activeSlot: 0, deadlineAt: 1_700_000_000_000, round: 1, actedSlots: [] },
  weather: { wind: { magnitude: 5, directionDeg: 30, sector: 1 }, rolledAtRound: 1 },
  players: [
    { slot: 0, hp: 1_000, shield: 200, energy: 100, x: 300, y: 800, facing: 1, delay: 0, eliminated: false, weaponSlot: 0 },
    { slot: 1, hp: 1_000, shield: 200, energy: 100, x: 1_300, y: 800, facing: -1, delay: 0, eliminated: false, weaponSlot: 0 },
  ],
  projectiles: [],
  scores: { score: { A: 0, B: 0 }, activeTeam: "A", jewels: [] },
  status: "playing",
  winnerTeam: null,
};

function accepted(raw: unknown): ClientFrame {
  const parsed = parseClientFrame(JSON.stringify(raw));
  expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
  if (!parsed.ok) throw new Error("unreachable");
  return parsed.frame;
}

function rejected(raw: unknown): { code: string; detail: string } {
  const parsed = parseClientFrame(JSON.stringify(raw));
  expect(parsed.ok, "expected the frame to be refused").toBe(false);
  if (parsed.ok) throw new Error("unreachable");
  return { code: parsed.code, detail: parsed.detail };
}

describe("TC-ROOM-163: the protocol is versioned and total", () => {
  it("TC-ROOM-163: the protocol version is 1 and the heartbeat allows three misses", () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(PING_MISSES_BEFORE_GRACE).toBe(3);
  });

  it("TC-ROOM-163: every documented client frame parses", () => {
    const frames: ClientFrame[] = [
      accepted(auth) as ClientFrame,
      accepted({ t: "signal", to: "p2", payload: { kind: "offer", sdp: "v=0..." } }),
      accepted({ t: "signal", to: "p2", payload: { kind: "candidate", candidate: { candidate: "candidate:1 1 UDP 1 10.0.0.1 5 typ host" } } }),
      accepted({ t: "team_assign", assignments: [{ playerId: "p1", team: "A" }, { playerId: "p2", team: "B" }] }),
      accepted({ t: "team_assign", assignments: [{ playerId: "p1", team: null }] }),
      accepted({ t: "start_match" }),
      accepted({ t: "snapshot_push", snapshot: SNAPSHOT }),
      accepted({ t: "match_end", winnerTeam: "A", stats: [{ slot: 0, damageDealt: 120, shotsFired: 4, hits: 3 }] }),
      accepted({ t: "room_settings", mode: "score", mapId: "map-01" }),
      accepted({ t: "loadout", items: [{ id: "item-01", qty: 2 }] }),
      accepted({ t: "move", direction: 1, run: true }),
      accepted({ t: "item", id: "item-02" }),
      accepted({ t: "leave" }),
      accepted({ t: "ping", at: 1_700_000_000_000 }),
    ];
    // Fourteen frames covering twelve distinct types: `signal` and `team_assign` are exercised twice.
    expect(frames).toHaveLength(14);
    expect(new Set(frames.map((frame) => frame.t)).size).toBe(12);
  });

  it("TC-ROOM-163: an unknown t is unsupported-message, not a crash", () => {
    expect(rejected({ t: "teleport" }).code).toBe("unsupported-message");
    expect(rejected({}).code).toBe("bad-request");
    const notJson = parseClientFrame("not json");
    expect(notJson.ok).toBe(false);
  });

  it("TC-ROOM-163: a field the frame does not document is refused, so a rename cannot silently no-op", () => {
    // The exact shape the lobby used to send: team_assign with playerId/team instead of assignments[].
    const drift = rejected({ t: "team_assign", playerId: "p1", team: "A" });
    expect(drift.code).toBe("bad-request");
    expect(drift.detail).toContain("playerId");
    expect(rejected({ t: "start_match", seed: 42 }).code).toBe("bad-request");
  });

  it("TC-ROOM-163: auth needs a token and nothing else is invented", () => {
    expect(rejected({ t: "auth" }).code).toBe("bad-request");
    expect(rejected({ t: "auth", token: "" }).code).toBe("bad-request");
    const frame = accepted({ t: "auth", token: "abc", displayName: "An" });
    expect(frame).toEqual({ t: "auth", token: "abc", displayName: "An" });
  });

  it("TC-ROOM-163: an sdp over the 8 KB budget is payload-too-large", () => {
    const sdp = "a".repeat(MAX_SIGNAL_BYTES + 1);
    expect(rejected({ t: "signal", to: "p2", payload: { kind: "offer", sdp } }).code).toBe("payload-too-large");
    const ok = accepted({ t: "signal", to: "p2", payload: { kind: "offer", sdp: "a".repeat(MAX_SIGNAL_BYTES) } });
    expect(ok.t).toBe("signal");
  });

  it("TC-ROOM-163: a signal without kind or without its artifact is refused", () => {
    expect(rejected({ t: "signal", to: "p2", payload: { sdp: "v=0" } }).code).toBe("bad-request");
    expect(rejected({ t: "signal", to: "p2", payload: { kind: "answer" } }).code).toBe("bad-request");
    expect(rejected({ t: "signal", to: "p2", payload: { kind: "candidate", candidate: null } }).code).toBe("bad-request");
  });

  it("TC-ROOM-163: a loadout above eleven items is refused, and so is a fractional quantity", () => {
    const tooMany = Array.from({ length: MAX_LOADOUT_QUANTITY + 1 }, (_, index) => ({ id: `item-${index}`, qty: 1 }));
    const refusal = rejected({ t: "loadout", items: tooMany });
    expect(refusal.code).toBe("bad-request");
    expect(refusal.detail).toContain(String(MAX_LOADOUT_QUANTITY));
    expect(rejected({ t: "loadout", items: [{ id: "item-01", qty: 1.5 }] }).code).toBe("bad-request");
    expect(rejected({ t: "loadout", items: [{ id: "item-01", qty: -1 }] }).code).toBe("bad-request");
    expect(accepted({ t: "loadout", items: [{ id: "item-01", qty: MAX_LOADOUT_QUANTITY }] }).t).toBe("loadout");
  });

  it("TC-ROOM-163: a snapshot over 8 KB is snapshot-too-large and a missing seq is bad-request", () => {
    const bloated = { ...SNAPSHOT, filler: "x".repeat(9_000) };
    expect(rejected({ t: "snapshot_push", snapshot: bloated }).code).toBe("snapshot-too-large");
    expect(rejected({ t: "snapshot_push", snapshot: { ...SNAPSHOT, hostGeneration: undefined } }).code).toBe("bad-request");
    expect(rejected({ t: "snapshot_push", snapshot: { ...SNAPSHOT, seq: undefined } }).code).toBe("bad-request");
    // An empty roster used to be accepted and then threw inside every peer's React tree.
    expect(rejected({ t: "snapshot_push", snapshot: { seq: 1, hostGeneration: 1, players: [] } }).code).toBe("bad-request");
    expect(rejected({ t: "snapshot_push", snapshot: { ...SNAPSHOT, turn: undefined } }).code).toBe("bad-request");
  });

  it("TC-ROOM-163: match_end needs whole-number stats for slots 0–7", () => {
    expect(rejected({ t: "match_end", winnerTeam: "C", stats: [] }).code).toBe("bad-request");
    expect(rejected({ t: "match_end", winnerTeam: "A" }).code).toBe("bad-request");
    expect(rejected({ t: "match_end", winnerTeam: "A", stats: [{ slot: 9, damageDealt: 0, shotsFired: 0, hits: 0 }] }).code).toBe("bad-request");
    const draw = accepted({ t: "match_end", winnerTeam: null, stats: [] });
    expect(draw).toEqual({ t: "match_end", winnerTeam: null, stats: [] });
  });

  it("TC-ROOM-163: move takes a direction of 0 or 1 and a run flag", () => {
    expect(rejected({ t: "move", direction: 2, run: false }).code).toBe("bad-request");
    expect(accepted({ t: "move", direction: 0, run: false })).toEqual({ t: "move", direction: 0, run: false });
  });

  it("TC-ROOM-163: ping keeps the client clock so the pong can measure the round trip", () => {
    expect(accepted({ t: "ping", at: 1_700_000_000_000 })).toEqual({ t: "ping", at: 1_700_000_000_000 });
    // A ping with no readable clock is refused rather than coerced to 0: a 0 would measure a 56-year round trip.
    expect(rejected({ t: "ping" }).code).toBe("bad-request");
    expect(rejected({ t: "ping", at: 1.5 }).code).toBe("bad-request");
  });

  it("TC-ROOM-163: the client drops a server frame it does not know", () => {
    const known = parseServerFrame(JSON.stringify({ t: "pong", at: 1, now: 2 }));
    expect(known.ok).toBe(true);
    const unknown = parseServerFrame(JSON.stringify({ t: "level_up" }));
    expect(unknown.ok).toBe(false);
    expect(parseServerFrame("<html>").ok).toBe(false);
  });

  it("TC-CORE-016: room_settings refuses an unknown mode or map", () => {
  const fine = parseClientFrame(
    JSON.stringify({ t: "room_settings", mode: "jewel", mapId: "map-03", maxPlayers: 6, isPrivate: true }),
  );
  expect(fine.ok).toBe(true);

  // The room must not accept a mode the rules engine has never heard of (`US-CORE-010` AC7)…
  const badMode = parseClientFrame(JSON.stringify({ t: "room_settings", mode: "royale", mapId: "map-03" }));
  expect(badMode.ok).toBe(false);
  if (!badMode.ok) expect(badMode.detail).toContain("mode");

  // …nor a map id that no map carries, which would fail later inside `createMatch`.
  const badMap = parseClientFrame(JSON.stringify({ t: "room_settings", mode: "solo", mapId: "map-99" }));
  expect(badMap.ok).toBe(false);
  if (!badMap.ok) expect(badMap.detail).toContain("map-99");
});

it("TC-ROOM-025: a preset phrase parses and a free text is refused", () => {
  // Arrange / Act
  const preset = parseClientFrame(JSON.stringify({ t: "chat", kind: "quick_phrase", id: "phrase-01" }));
  const free = parseClientFrame(JSON.stringify({ t: "chat", text: "tốt lắm" }));

  // Assert — `OQ-17`: preset only, so prose is refused at the socket and never reaches a peer
  expect(preset.ok && preset.frame).toEqual({ t: "chat", kind: "quick_phrase", id: "phrase-01" });
  expect(free.ok).toBe(false);
});

it("TC-ROOM-025: a chat frame with no kind, an unknown kind, or an id outside the catalogue is refused", () => {
  // Arrange / Act
  const empty = parseClientFrame(JSON.stringify({ t: "chat" }));
  const unknown = parseClientFrame(JSON.stringify({ t: "chat", kind: "shout", id: "phrase-01" }));
  const outside = parseClientFrame(JSON.stringify({ t: "chat", kind: "quick_phrase", id: "phrase-99" }));
  const extra = parseClientFrame(JSON.stringify({ t: "chat", kind: "emote", id: "emote-01", text: "hi" }));

  // Assert — every refusal names the field, so the client can point at it
  expect(empty.ok).toBe(false);
  expect(unknown.ok).toBe(false);
  expect(outside.ok).toBe(false);
  expect(!extra.ok && extra.detail).toContain("text");
});
});

describe("TC-CORE-937: match_end carries the delay table that produced the order (US-CORE-002 AC7)", () => {
  const stats = [{ slot: 0, damageDealt: 120, shotsFired: 4, hits: 3 }];

  it("TC-CORE-937: a delay table rides along on match_end unchanged", () => {
    // Arrange / Act
    const frame = accepted({ t: "match_end", winnerTeam: "A", stats, delayTable: [0, 120, 40] });

    // Assert — the table is the record of *why* the turn order came out that way
    expect(frame).toEqual({ t: "match_end", winnerTeam: "A", stats, delayTable: [0, 120, 40] });
  });

  it("TC-CORE-937: a match_end without the table still parses, so a peer that lost the queue can report", () => {
    // Arrange / Act
    const frame = accepted({ t: "match_end", winnerTeam: null, stats: [] });

    // Assert — absent, not an empty array: the difference is "unknown" vs "everyone on zero"
    expect(frame).toEqual({ t: "match_end", winnerTeam: null, stats: [] });
    expect("delayTable" in frame).toBe(false);
  });

  it("TC-CORE-937: a fractional, negative or over-long table is bad-request", () => {
    // Arrange / Act
    const fractional = rejected({ t: "match_end", winnerTeam: "A", stats, delayTable: [0, 1.5] });
    const negative = rejected({ t: "match_end", winnerTeam: "A", stats, delayTable: [0, -1] });
    const overlong = rejected({ t: "match_end", winnerTeam: "A", stats, delayTable: [0, 0, 0, 0, 0, 0, 0, 0, 0] });
    const wrongType = rejected({ t: "match_end", winnerTeam: "A", stats, delayTable: 12 });

    // Assert — each refusal names delayTable so the client can point at the frame field
    for (const refusal of [fractional, negative, overlong, wrongType]) {
      expect(refusal.code).toBe("bad-request");
      expect(refusal.detail).toContain("delayTable");
    }
  });
});

describe("TC-CORE-963: a chat frame carries an id, never text (US-MATCH-004 AC7)", () => {
  it("TC-CORE-963: a preset phrase parses to the id that crossed the wire", () => {
    // Arrange / Act
    const frame = accepted({ t: "chat", kind: "quick_phrase", id: "phrase-03" });

    // Assert — only the id crosses, so the receiver renders its own locale (AC5)
    expect(frame).toEqual({ t: "chat", kind: "quick_phrase", id: "phrase-03" });
  });

  it("TC-CORE-963: a free-text chat is bad-request, because no moderation surface exists", () => {
    // Arrange / Act
    const extra = rejected({ t: "chat", kind: "quick_phrase", id: "phrase-03", text: "gg ez" });

    // Assert — `OQ-17`: preset only, so the field is not merely ignored, it is refused
    expect(extra.code).toBe("bad-request");
    expect(extra.detail).toContain("text");
  });

  it("TC-CORE-963: a frame with no kind or no id is bad-request", () => {
    // Arrange / Act
    const textOnly = rejected({ t: "chat", text: "hello" });
    const noId = rejected({ t: "chat", kind: "emote" });

    // Assert
    expect(textOnly.code).toBe("bad-request");
    expect(noId.code).toBe("bad-request");
  });

  it("TC-CORE-963: an id outside the catalogue is bad-request", () => {
    // Arrange / Act
    const unknown = rejected({ t: "chat", kind: "quick_phrase", id: "phrase-99" });
    const crossed = rejected({ t: "chat", kind: "quick_phrase", id: "emote-01" });

    // Assert — the catalogue is the only truth; a crossed id would render nothing on the receiver (AC3)
    expect(unknown.code).toBe("bad-request");
    expect(crossed.code).toBe("bad-request");
  });
});
