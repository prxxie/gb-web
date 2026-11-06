// @vitest-environment jsdom
/**
 * The roster strip (`US-MATCH-001` AC6).
 *
 * A mobile at HP 0 stays in the strip — a player needs to see who they knocked out and who is left, and a
 * strip that reflows when someone dies hides exactly that.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createMatch, getMobile, type MatchState, type PlayerState } from "@gbw/core";
import { Roster } from "../src/components/Roster";

const NOW = 1_700_000_000_000;

afterEach(cleanup);

function state(): MatchState {
  return createMatch({
    matchId: "m-1",
    roomCode: "ABC234",
    seed: 42,
    mode: "solo",
    mapId: "map-01",
    seats: [
      { slot: 0, team: "A", accountId: "acc-a", displayName: "An", mobileId: "mbl-01" },
      { slot: 1, team: "B", accountId: "acc-b", displayName: "Bình", mobileId: "mbl-02" },
      { slot: 2, team: "B", accountId: "acc-c", displayName: "Cường", mobileId: "mbl-03" },
    ],
    now: NOW,
  });
}

function players(): readonly PlayerState[] {
  const match = state();
  return match.players.map((player) => (player.slot === 2 ? { ...player, hp: 0, eliminated: true } : player));
}

describe("TC-MATCH-925: the roster keeps an eliminated mobile in place (US-MATCH-001 AC6)", () => {
  it("keeps every slot in the strip after one of them dies", () => {
    render(<Roster players={players()} activeSlot={0} eliminatedLabel="Đã bị hạ" />);
    expect(screen.getByTestId("roster-0")).toBeTruthy();
    expect(screen.getByTestId("roster-1")).toBeTruthy();
    expect(screen.getByTestId("roster-2")).toBeTruthy();
  });

  it("labels the dead one instead of printing its hp", () => {
    render(<Roster players={players()} activeSlot={0} eliminatedLabel="Đã bị hạ" />);
    const dead = screen.getByTestId("roster-2");
    expect(dead.textContent).toContain("Đã bị hạ");
    expect(dead.textContent).not.toContain("0/");
    expect(screen.getByTestId("roster-0").textContent).toContain(`/${getMobile("mbl-01").maxHp}`);
  });

  it("marks only the slot whose turn it is", () => {
    render(<Roster players={players()} activeSlot={1} eliminatedLabel="Đã bị hạ" />);
    expect(screen.getByTestId("roster-1").className).toContain("match__player--active");
    expect(screen.getByTestId("roster-0").className).not.toContain("match__player--active");
    expect(screen.getByTestId("roster-2").className).not.toContain("match__player--active");
  });

  it("keeps the order the engine gave the seats", () => {
    render(<Roster players={players()} activeSlot={0} eliminatedLabel="Đã bị hạ" />);
    const order = ["roster-0", "roster-1", "roster-2"].map((id) => screen.getByTestId(id).textContent);
    const rendered = Array.from(document.querySelectorAll("[data-testid^='roster-']")).map((node) => node.textContent);
    expect(rendered).toEqual(order);
  });
});
