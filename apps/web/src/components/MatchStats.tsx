/**
 * The right end of the match bar: the weather still to come, the teams' remaining health, and the gold earned
 * (owner's layout, 2026-11-08).
 *
 * The forecast is not a new wire field — `rollWeather(seed, round)` is already a pure function of the match seed and the
 * round number (`packages/core/src/weather.ts`), so the next rounds are computable on every client and identical
 * everywhere. Gold is **derived**, not stored: the genre pays out on damage dealt, and `PlayerState.damageDealt` is
 * already on the wire, so `GOLD_PER_DAMAGE` turns it into a number without widening the snapshot.
 */
import type { Team, WeatherKind } from "@gbw/core";
import type { JSX } from "react";
import { WeatherTray } from "./WeatherTray";

/** One gold per point of damage dealt — the genre's rate, and a display rule rather than a mechanic. */
export const GOLD_PER_DAMAGE = 1;

export interface TeamStanding {
  readonly team: Team;
  /** Remaining health across the team, wrecks counted as zero. */
  readonly hp: number;
  readonly maxHp: number;
  readonly alive: number;
  readonly members: number;
}

export interface MatchStatsProps {
  readonly seed: number;
  /** The round in play; the forecast starts at the next one. */
  readonly round: number;
  readonly rounds: number;
  readonly teams: readonly TeamStanding[];
  readonly gold: number;
  readonly labels: {
    readonly weather: string;
    readonly gold: string;
    readonly health: string;
    /** Kind name for the tray (`Nắng`, `Gió`, `Gió mạnh`, `Lốc`). */
    readonly kind: (kind: WeatherKind) => string;
  };
}

export function MatchStats({ seed, round, rounds, teams, gold, labels }: MatchStatsProps): JSX.Element {
  return (
    <div className="match__stats">
      <WeatherTray
        seed={seed}
        round={round}
        rounds={rounds}
        labels={{ weather: labels.weather, kind: labels.kind }}
      />
      <div className="match__teams" role="group" aria-label={labels.health}>
        {teams.map((standing) => (
          <span
            key={standing.team}
            className={`match__team match__team--${standing.team.toLowerCase()}`}
            data-testid={`team-${standing.team}`}
          >
            {standing.team} {standing.hp}
          </span>
        ))}
      </div>
      <div className="match__gold" data-testid="gold" title={labels.gold}>
        <span aria-hidden="true">◎</span>
        {gold * GOLD_PER_DAMAGE}
      </div>
    </div>
  );
}
