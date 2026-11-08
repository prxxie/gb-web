/**
 * Room settings (`US-ROOM-007` AC1–AC3).
 *
 * Only the host may change them: every control is disabled for everyone else, and the page shows the
 * values the room broadcast so a joiner always sees the truth rather than a stale local copy.
 */
import { MAPS, MODES, type Gimmick, type MapDef, type ModeId, type RoomSettings } from "@gbw/core";
import { useLocale } from "../app/providers";
import type { JSX } from "react";

/** Capacities the lobby offers; a room created as 1v1 keeps its own value in the list. */
const CAPACITIES = [4, 6, 8] as const;

/** Filled in for every `Gimmick`, so no key is built by concatenation at runtime (`conventions.md` § i18n). */
const GIMMICK_KEYS: Record<Gimmick, string> = {
  force: "lobby.gimmick.force",
  gust: "lobby.gimmick.gust",
  electric: "lobby.gimmick.electric",
  wind: "lobby.gimmick.wind",
  return: "lobby.gimmick.return",
  heal: "lobby.gimmick.heal",
  fog: "lobby.gimmick.fog",
  tornado: "lobby.gimmick.tornado",
};

export interface SettingsPanelProps {
  readonly settings: RoomSettings;
  readonly isHost: boolean;
  readonly onChange: (patch: Partial<RoomSettings>) => void;
}

export function SettingsPanel({ settings, isHost, onChange }: SettingsPanelProps): JSX.Element {
  const { t, locale } = useLocale();
  // A room created with capacity 2 (`US-MATCH-001`) must still render its own value as the selection.
  const capacities: readonly number[] = CAPACITIES.includes(settings.maxPlayers as 4 | 6 | 8)
    ? CAPACITIES
    : [settings.maxPlayers, ...CAPACITIES];
  // No fallback: a catalogue gap must look like a gap, not like "Megalith Plain". `data-map-id` is the room's own
  // value, so a test or a QA pass can see the divergence (`US-ROOM-007` AC5).
  const map: MapDef | undefined = MAPS.find((entry) => entry.mapId === settings.mapId);

  return (
    <section className="card" data-testid="settings-panel" aria-labelledby="settings-title">
      <h2 id="settings-title">{t("lobby.settings")}</h2>
      <div className="settings__grid">
        <div className="settings__field">
          <label htmlFor="settings-mode">{t("main.mode")}</label>
          <select
            id="settings-mode"
            value={settings.mode}
            disabled={!isHost}
            onChange={(event) => onChange({ mode: event.target.value as ModeId })}
          >
            {MODES.map((entry) => (
              <option key={entry.modeId} value={entry.modeId}>
                {t(`main.mode.${entry.modeId}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="settings__field">
          <label htmlFor="settings-map">{t("lobby.map")}</label>
          <select
            id="settings-map"
            value={settings.mapId}
            disabled={!isHost}
            onChange={(event) => onChange({ mapId: event.target.value })}
          >
            {MAPS.map((map) => (
              <option key={map.mapId} value={map.mapId}>
                {map.name[locale]}
              </option>
            ))}
          </select>
        </div>
        <div className="settings__field">
          <label htmlFor="settings-capacity">{t("main.capacity")}</label>
          <select
            id="settings-capacity"
            value={settings.maxPlayers}
            disabled={!isHost}
            onChange={(event) => onChange({ maxPlayers: Number(event.target.value) as RoomSettings["maxPlayers"] })}
          >
            {capacities.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <label className="settings__field" htmlFor="settings-private">
          <span>{t("lobby.private")}</span>
          <input
            id="settings-private"
            type="checkbox"
            checked={settings.isPrivate}
            disabled={!isHost}
            onChange={(event) => onChange({ isPrivate: event.target.checked })}
          />
        </label>
      </div>
      {/* The host picks the map; everyone else only reads it, so this preview is their view of the choice (AC5). */}
      <div className="map-preview" data-testid="map-preview" data-map-id={settings.mapId}>
        <span className="map-preview__name">{map?.name[locale] ?? settings.mapId}</span>
        <span className="map-preview__gimmicks">
          {(map?.gimmicks ?? []).length === 0 ? (
            <span className="badge">{t("lobby.map.none")}</span>
          ) : (
            (map?.gimmicks ?? []).map((gimmick) => (
              <span key={gimmick} className="badge" data-testid={`map-gimmick-${gimmick}`}>
                {t(GIMMICK_KEYS[gimmick])}
              </span>
            ))
          )}
        </span>
      </div>
    </section>
  );
}
