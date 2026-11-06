/**
 * Whether the device currently has a network at all (`docs/02-reference/screens/main.md` § The offline
 * hint). A bot match runs entirely on the device (`NFR-21`), so the hint exists to say what still works —
 * it must disappear again the moment the browser reports a connection, which is what `online`/`offline`
 * events are for; polling `navigator.onLine` would leave a stale hint on screen until the next render.
 */
import { useEffect, useState } from "react";

export function useOnline(): boolean {
  // `navigator.onLine` is the only signal the platform gives; it starts optimistic, which is why the
  // browser fires `offline` when a real request fails and the hint follows that event.
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    const up = (): void => setOnline(true);
    const down = (): void => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  return online;
}
