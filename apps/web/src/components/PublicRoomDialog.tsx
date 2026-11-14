import { useEffect, useRef, useState, type JSX } from "react";
import { MAPS } from "@gbw/core";
import { useLocale } from "../app/providers";
import {
  ApiError,
  api,
  errorMessage,
  type PublicRoomPage,
  type PublicRoomSummary,
  type RoomDirectoryFilter,
} from "../lib/api";
import type { Session } from "../lib/session";

const FILTERS: readonly RoomDirectoryFilter[] = [undefined, "waiting", "playing"];

function filterKey(filter: RoomDirectoryFilter): string {
  return filter ?? "all";
}

export interface PublicRoomDialogProps {
  readonly session: Session | null;
  readonly onClose: () => void;
  readonly onJoined: (roomCode: string, playerId: string) => void;
}

/**
 * Snapshot browser for the main menu (`US-ROOM-013`).
 *
 * It is mounted only while open, so the first request is the open itself. The only other reads are a filter change,
 * an explicit refresh or the next cursor; no timer, subscription or room socket lives here.
 */
export function PublicRoomDialog({ session, onClose, onJoined }: PublicRoomDialogProps): JSX.Element {
  const { locale, t } = useLocale();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const pendingLoads = useRef(new Map<string, Promise<PublicRoomPage>>());
  const generation = useRef(0);
  const loadedFilter = useRef<string | null>(null);
  const [filter, setFilter] = useState<RoomDirectoryFilter>(undefined);
  const [reload, setReload] = useState(0);
  const [rooms, setRooms] = useState<readonly PublicRoomSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let live = true;
    const requestGeneration = ++generation.current;
    const key = `${filterKey(filter)}|${reload}`;
    const filterChanged = loadedFilter.current !== filterKey(filter);
    loadedFilter.current = filterKey(filter);
    setLoading(true);
    setLoadError(false);
    if (filterChanged) setRooms([]);
    if (filterChanged) setNextCursor(null);
    if (filterChanged) setLoaded(false);
    let pending = pendingLoads.current.get(key);
    if (!pending) {
      pending = api.listRooms({ status: filter });
      pendingLoads.current.set(key, pending);
      void pending.then(
        () => pendingLoads.current.delete(key),
        () => pendingLoads.current.delete(key),
      );
    }
    pending
      .then((page: PublicRoomPage) => {
        if (!live || requestGeneration !== generation.current) return;
        setRooms(page.rooms);
        setNextCursor(page.nextCursor);
        setLoaded(true);
      })
      .catch(() => {
        if (!live || requestGeneration !== generation.current) return;
        setLoadError(true);
      })
      .finally(() => {
        if (live && requestGeneration === generation.current) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [filter, reload]);

  const chooseFilter = (next: RoomDirectoryFilter): void => {
    setJoinError(null);
    if (filterKey(next) === filterKey(filter)) {
      setReload((value) => value + 1);
      return;
    }
    setFilter(next);
  };

  const retry = (): void => {
    setReload((value) => value + 1);
  };

  const loadMore = async (): Promise<void> => {
    if (!nextCursor || loadingMore) return;
    const requestGeneration = generation.current;
    setLoadingMore(true);
    try {
      const page = await api.listRooms({ status: filter, cursor: nextCursor });
      if (requestGeneration !== generation.current) return;
      setRooms((current) => {
        const seen = new Set(current.map((room) => room.roomCode));
        return [...current, ...page.rooms.filter((room) => !seen.has(room.roomCode))];
      });
      setNextCursor(page.nextCursor);
      setLoadError(false);
    } catch {
      if (requestGeneration !== generation.current) return;
      setLoadError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const join = async (room: PublicRoomSummary): Promise<void> => {
    if (!session || !room.joinable || joining) return;
    setJoining(room.roomCode);
    setJoinError(null);
    try {
      const joined = await api.joinRoom(session.token, room.roomCode, {
        displayName: session.subject.displayName,
        mobileId: "mbl-01",
        avatarId: session.subject.avatarId ?? "default",
      });
      onJoined(room.roomCode, joined.playerId);
    } catch (caught) {
      setJoinError(errorMessage(caught, t));
      if (
        caught instanceof ApiError &&
        (caught.type === "room-full" || caught.type === "room-closed" || caught.type === "room-not-found")
      ) {
        setReload((value) => value + 1);
      }
    } finally {
      setJoining(null);
    }
  };

  const label = (value: RoomDirectoryFilter): string =>
    value === "waiting"
      ? t("main.rooms.waiting")
      : value === "playing"
        ? t("main.rooms.playing")
        : t("main.rooms.all");

  return (
    <div className="public-rooms__backdrop">
      <section
        ref={dialogRef}
        className="public-rooms"
        role="dialog"
        aria-modal="true"
        aria-labelledby="public-rooms-title"
      >
        <header className="public-rooms__head">
          <h2 id="public-rooms-title">{t("main.rooms.title")}</h2>
          <button ref={closeRef} type="button" className="ghost" onClick={onClose}>
            {t("common.close")}
          </button>
        </header>

        <div
          className="public-rooms__filters"
          role="group"
          aria-label={t("main.rooms.title")}
          aria-busy={loading}
        >
          {FILTERS.map((value) => (
            <button
              key={filterKey(value)}
              type="button"
              aria-pressed={filterKey(value) === filterKey(filter)}
              onClick={() => chooseFilter(value)}
            >
              {label(value)}
            </button>
          ))}
          <button type="button" onClick={retry} disabled={loading}>
            {t("main.rooms.refresh")}
          </button>
        </div>

        {loading ? <p className="muted">{t("common.loading")}</p> : null}
        {joinError ? (
          <p className="field-error" role="alert" data-testid="public-rooms-error">
            {joinError}
          </p>
        ) : loadError ? (
          <div role="alert" data-testid="public-rooms-error">
            <p className="field-error">{t("main.rooms.error")}</p>
            <button type="button" onClick={retry}>
              {t("main.rooms.retry")}
            </button>
          </div>
        ) : null}

        {loaded && !loadError && rooms.length === 0 ? (
          <p className="muted" data-testid="public-rooms-empty">
            {t("main.rooms.empty")}
          </p>
        ) : null}

        {rooms.length > 0 ? (
          <ul className="public-rooms__list">
            {rooms.map((room) => {
              const mapName = MAPS.find((map) => map.mapId === room.mapId)?.name[locale] ?? room.mapId;
              return (
                <li key={room.roomCode} data-testid={`public-room-${room.roomCode}`}>
                  <div className="public-rooms__row">
                    <strong>{room.roomCode}</strong>
                    <span>{t(`main.mode.${room.mode}`)}</span>
                    <span>{mapName}</span>
                    <span>
                      {room.seated}/{room.maxPlayers}
                    </span>
                    <span>{t(`main.rooms.${room.status}`)}</span>
                    {room.joinable ? (
                      <button
                        type="button"
                        data-testid={`public-room-join-${room.roomCode}`}
                        aria-label={`${t("main.joinRoom")} ${room.roomCode}`}
                        onClick={() => void join(room)}
                        disabled={!session || joining !== null}
                      >
                        {joining === room.roomCode ? t("common.loading") : t("main.joinRoom")}
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        {nextCursor ? (
          <button type="button" onClick={() => void loadMore()} disabled={loadingMore}>
            {t("main.rooms.more")}
          </button>
        ) : null}
      </section>
    </div>
  );
}
