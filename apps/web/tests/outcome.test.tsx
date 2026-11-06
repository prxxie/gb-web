// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { translator } from "../src/i18n";
import { outcomeText, winConditionOf, type OutcomeInput } from "../src/lib/outcome";

const vi = translator("vi");
const en = translator("en");

function state(mode: string, killed: readonly ("A" | "B")[] = [], perTeam = 2): OutcomeInput {
  const players = [];
  for (const team of ["A", "B"] as const) {
    for (let slot = 0; slot < perTeam; slot += 1) {
      players.push({ team, eliminated: killed.includes(team) });
    }
  }
  return { mode, players };
}

describe("TC-CORE-962: the result screen names the mode and the win condition (US-CORE-010 AC6)", () => {
  it("calls a solo match won by wiping the other team out", () => {
    expect(winConditionOf(state("solo", ["B"]))).toBe("elimination");
  });

  it("distinguishes a score match won by a wipe from one won at the turn cap", () => {
    expect(winConditionOf(state("score", ["A"]))).toBe("elimination");
    expect(winConditionOf(state("score"))).toBe("score-cap");
  });

  it("calls a jewel match won by holding every jewel", () => {
    expect(winConditionOf(state("jewel"))).toBe("all-jewels");
  });

  it("prints the mode and the condition, not the key names", () => {
    expect(outcomeText(vi, "score", "score-cap")).toBe(
      "Chế độ Điểm số — thắng bằng: nhiều sát thương hơn khi hết số lượt",
    );
    expect(outcomeText(en, "jewel", "all-jewels")).toBe("Jewel match — won by: holding every jewel");
    expect(outcomeText(vi, "solo", null)).toContain("bỏ trận");
  });

  it("never throws on a mode the client does not know", () => {
    expect(outcomeText(vi, "deathmatch", "elimination")).toContain("không rõ");
  });
});
