/**
 * Practice solver (`US-BAL-007`, `screens/practice.md`, `CR-2026-11-14-practice-solver-screen`).
 *
 * The reference engine's closed form, on the device: a distance in phần and an angle give the bar, a bar gives the
 * distance and the flight time. Flat ground by construction — the solver never sees terrain — and the sentences under
 * the answer say so, because a number from this screen is not what a shot in a match will do.
 *
 * The page imports `solver.ts` and nothing from `../game` (`TC-BAL-152`), makes no request (`TC-BAL-155`), and every
 * string comes from the copy tables (`TC-BAL-154`). Machine names are data, not copy: they are the roster's own.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  MOBILES,
  TUNABLES,
  barForDistance,
  distanceForBar,
  getMobile,
  gravityFor,
  timeForShot,
  windAcceleration,
  windKFor,
  type SolveReason,
  type SolveResult,
  type Wind,
} from "@gbw/core";
import { useLocale } from "../app/providers";
import type { Locale } from "../i18n";
import type { JSX } from "react";

type Mode = "bar" | "distance" | "time";

const MODES: readonly Mode[] = ["bar", "distance", "time"];

/** `screens/practice.md` § Fields: the reference hull, 45°, no height difference, no wind — the calibration shot. */
const DEFAULTS = { mobileId: "mbl-03", angle: "45", height: "0", wind: "0", distance: "22.14", bar: "3" };

/** The sentence a refusal earns (`SolveReason` — `@gbw/core` carries no user-facing string). */
function reasonKey(reason: SolveReason): string {
  switch (reason) {
    case "angle":
      return "practice.invalidAngle";
    case "height":
      return "practice.invalidHeight";
    case "wind":
      return "practice.invalidWind";
    case "distance":
    case "bar":
    case "unreachable":
      return "practice.invalidUnreachable";
  }
}

function decimal(locale: Locale, value: number): string {
  // Two decimals in both locales, so `4,00` and `4.00` are the same bar (`screens/practice.md` § Notes).
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function PracticePage(): JSX.Element {
  const { t, locale } = useLocale();
  const [mode, setMode] = useState<Mode>("bar");
  const [mobileId, setMobileId] = useState<string>(DEFAULTS.mobileId);
  const [angle, setAngle] = useState<string>(DEFAULTS.angle);
  const [height, setHeight] = useState<string>(DEFAULTS.height);
  const [windMagnitude, setWindMagnitude] = useState<string>(DEFAULTS.wind);
  const [west, setWest] = useState(false);
  const [distance, setDistance] = useState<string>(DEFAULTS.distance);
  const [bar, setBar] = useState<string>(DEFAULTS.bar);

  const answer = useMemo<SolveResult>(() => {
    const machine = getMobile(mobileId);
    const magnitude = Number.parseFloat(windMagnitude);
    const wind: Wind = { magnitude, directionDeg: west ? 180 : 0, sector: west ? 180 : 0 };
    const context = {
      angle: Number.parseFloat(angle),
      // A cleared field is `NaN`, which the solver refuses as `height` — never a `NaN` answer (`screens/practice.md`).
      deltaY: Number.parseFloat(height) * TUNABLES.partWidth,
      gravity: gravityFor(machine),
      wind: windAcceleration(wind, windKFor(machine)),
    };
    if (!Number.isFinite(magnitude)) return { ok: false, reason: "wind" };
    if (mode === "bar") return barForDistance(Number.parseFloat(distance), context);
    const flown = Number.parseFloat(bar);
    return mode === "distance" ? distanceForBar(flown, context) : timeForShot(flown, context);
  }, [mode, mobileId, angle, height, windMagnitude, west, distance, bar]);

  const number = (value: number): string => decimal(locale, value);

  return (
    <div className="screen practice">
      <header className="practice__head">
        <Link to="/">{t("common.home")}</Link>
        <h1>{t("practice.title")}</h1>
      </header>

      <div className="practice__modes" role="group" aria-label={t("practice.title")}>
        {MODES.map((each) => (
          <button key={each} type="button" aria-pressed={mode === each} onClick={() => setMode(each)}>
            {t(`practice.mode.${each}`)}
          </button>
        ))}
      </div>

      <div className="practice__fields">
        <p>
          <label htmlFor="practice-machine">{t("practice.machine")}</label>
          <select id="practice-machine" value={mobileId} onChange={(event) => setMobileId(event.target.value)}>
            {MOBILES.map((machine) => (
              <option key={machine.mobileId} value={machine.mobileId}>
                {machine.name}
              </option>
            ))}
          </select>
        </p>
        <p>
          <label htmlFor="practice-angle">{t("practice.angle")}</label>
          <input
            id="practice-angle"
            type="number"
            min={0}
            max={180}
            step={1}
            value={angle}
            onChange={(event) => setAngle(event.target.value)}
          />
        </p>
        <p>
          <label htmlFor="practice-height">{t("practice.height")}</label>
          <input
            id="practice-height"
            type="number"
            step={0.01}
            value={height}
            onChange={(event) => setHeight(event.target.value)}
          />
        </p>
        <p>
          <label htmlFor="practice-wind">{t("practice.wind")}</label>
          <input
            id="practice-wind"
            type="number"
            min={0}
            max={26}
            step={1}
            value={windMagnitude}
            onChange={(event) => {
              const typed = Number.parseFloat(event.target.value);
              // `max` is a hint to the spinner, not a rule: the engine's ceiling is `TUNABLES.windMax`.
              setWindMagnitude(typed > TUNABLES.windMax ? String(TUNABLES.windMax) : event.target.value);
            }}
          />
          <span className="practice__direction" role="radiogroup" aria-label={t("practice.direction")}>
            <label>
              <input type="radio" name="practice-wind-direction" checked={!west} onChange={() => setWest(false)} />
              {t("practice.windEast")}
            </label>
            <label>
              <input type="radio" name="practice-wind-direction" checked={west} onChange={() => setWest(true)} />
              {t("practice.windWest")}
            </label>
          </span>
        </p>
        {mode === "bar" ? (
          <p>
            <label htmlFor="practice-distance">{t("practice.distance")}</label>
            <input
              id="practice-distance"
              type="number"
              step={0.01}
              value={distance}
              onChange={(event) => setDistance(event.target.value)}
            />
          </p>
        ) : (
          <p>
            <label htmlFor="practice-bar">{t("practice.bar")}</label>
            <input
              id="practice-bar"
              type="number"
              min={0}
              max={4}
              step={0.01}
              value={bar}
              onChange={(event) => setBar(event.target.value)}
            />
          </p>
        )}
      </div>

      <output className="practice__answer" aria-live="polite" aria-atomic="true">
        {answer.ok ? (
          <span className="practice__value">
            {mode === "bar" ? t("practice.answerBar", { value: number(answer.bar) }) : null}
            {mode === "distance" ? t("practice.answerDistance", { value: number(answer.parts) }) : null}
            {mode === "time" ? t("practice.answerTime", { value: number(answer.flightSec) }) : null}
            {mode === "time" ? null : ` · ${t("practice.flight", { value: number(answer.flightSec) })}`}
          </span>
        ) : (
          <span className="practice__value">
            {t("practice.invalid")} {t(reasonKey(answer.reason))}
          </span>
        )}
      </output>

      <p className="practice__notice">{t("practice.flatOnly")}</p>
      <p className="practice__notice">{t("practice.notInMatch")}</p>
      <p className="practice__notice">{t("practice.offlineNote")}</p>
    </div>
  );
}
