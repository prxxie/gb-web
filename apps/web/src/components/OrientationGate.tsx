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

  // The gate itself stays visible in both orientations: only the battlefield is hidden in portrait,
  // so the overlay is a sibling of the children rather than a child of the hidden element.
  return (
    <div className="orientation-gate" data-testid="orientation-gate">
      <div hidden={portrait}>{children}</div>
      {portrait ? (
        <div className="overlay overlay--screen" data-testid="orientation-hint" role="alert">
          {message}
        </div>
      ) : null}
    </div>
  );
}
