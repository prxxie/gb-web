/**
 * The right end of the match bar: the weather still to come, the teams' remaining health, and the gold earned
 * (owner's layout, 2026-11-08).
 *
 * The forecast is not a new wire field — `rollWeather(seed, round)` is already a pure function of the match seed and the
 * round number (`packages/core/src/weather.ts`), so the next rounds are computable on every client and identical
 * everywhere. Gold is **derived**, not stored: the genre pays out on damage dealt, and `PlayerState.damageDealt` is
 * already on the wire, so `GOLD_PER_DAMAGE` turns it into a number without widening the snapshot.
 */
import { rollWeather, type Team } from "@gbw/core";
import type { JSX } from "react";

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
  };
}

export function MatchStats({ seed, round, rounds, teams, gold, labels }: MatchStatsProps): JSX.Element {
  return (
    <div className="match__stats">
      <div className="match__forecast" role="group" aria-label={labels.weather} data-testid="weather-forecast">
        {Array.from({ length: rounds }, (_, index) => {
          const weather = rollWeather(seed, round + index + 1);
          // A thin chevron, not the pad's solid arrow: the two must not read as the same kind of control.
          const arrow = weather.wind.sector === 0 ? "›" : "‹";
          return (
            <span
              key={index}
              className="match__forecast-cell"
              data-testid={`forecast-${index}`}
              title={`R${round + index + 1}`}
            >
              <span aria-hidden="true">{arrow}</span>
              {weather.wind.magnitude}
            </span>
          );
        })}
      </div>
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
