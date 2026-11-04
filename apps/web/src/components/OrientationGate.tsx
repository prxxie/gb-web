/**
 * Landscape gate (`US-PWA-003`).
 *
 * Portrait does not unmount the battlefield — it hides it — so a rotation never resets the match
 * (`TC-PWA-162`).
 */
import { useEffect, useState, type ReactNode } from "react";
import type { JSX } from "react";

export interface OrientationGateProps {
  readonly children: ReactNode;
  readonly message: string;
}

export function OrientationGate({ children, message }: OrientationGateProps): JSX.Element {
  const [portrait, setPortrait] = useState<boolean>(() => window.matchMedia("(orientation: portrait)").matches);

  useEffect(() => {
    const query = window.matchMedia("(orientation: portrait)");
    const listener = (event: MediaQueryListEvent): void => setPortrait(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  return (
    <div hidden={portrait} data-testid="orientation-gate">
      {portrait ? (
        <div className="overlay" data-testid="orientation-hint">
          {message}
        </div>
      ) : null}
      <div hidden={portrait}>{children}</div>
    </div>
  );
}
