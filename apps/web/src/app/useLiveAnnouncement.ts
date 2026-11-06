/**
 * Live-region throttling (`US-PWA-004` AC5, contract §4 "one aria-live polite node per screen, updated at
 * most once per second").
 *
 * Screen readers queue every change of a polite region, so a burst of HUD updates would read a backlog of
 * stale numbers. The first text shows immediately and later changes are coalesced to the newest one.
 */
import { useEffect, useRef, useState } from "react";

export const ANNOUNCEMENT_INTERVAL_MS = 1_000;

export function useLiveAnnouncement(text: string): string {
  const [announcement, setAnnouncement] = useState(text);
  const lastUpdate = useRef(0);

  useEffect(() => {
    if (text === announcement) return;
    const now = Date.now();
    const wait = Math.max(0, ANNOUNCEMENT_INTERVAL_MS - (now - lastUpdate.current));
    const timer = window.setTimeout(() => {
      lastUpdate.current = Date.now();
      setAnnouncement(text);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [text, announcement]);

  return announcement;
}
