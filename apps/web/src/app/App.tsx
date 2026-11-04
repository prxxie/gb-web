import { Suspense, lazy } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { ErrorBoundary } from "./ErrorBoundary";
import { LocaleProvider, SessionProvider } from "./providers";
import { LeaderboardPage } from "../routes/LeaderboardPage";
import { LobbyPage } from "../routes/LobbyPage";
import { MainPage } from "../routes/MainPage";
import { ProfilePage } from "../routes/ProfilePage";
import { ResultsPage } from "../routes/ResultsPage";

/**
 * Two routes are deliberately split out of the first load (`TC-PWA-139`, `NFR-03`):
 * `/match/:code` because Phaser is the largest dependency in the bundle, and `/sign-in` because the
 * Clerk client must not sit in the chunk a player downloads to press "play". Everything reachable
 * from the menu by one tap stays in the initial chunk so a match never waits on a second download.
 */
const MatchPage = lazy(() => import("../routes/MatchPage").then((module) => ({ default: module.MatchPage })));
const SignInPage = lazy(() => import("../routes/SignInPage").then((module) => ({ default: module.SignInPage })));

function Pending({ label }: { label: string }) {
  return (
    <div className="screen" role="status" aria-live="polite">
      <p>{label}</p>
    </div>
  );
}

const router = createBrowserRouter([
  { path: "/", element: <MainPage /> },
  {
    path: "/sign-in",
    element: (
      <Suspense fallback={<Pending label="Đang tải…" />}>
        <SignInPage />
      </Suspense>
    ),
  },
  { path: "/profile", element: <ProfilePage /> },
  { path: "/leaderboard", element: <LeaderboardPage /> },
  { path: "/lobby/:code", element: <LobbyPage /> },
  {
    path: "/match/:code",
    element: (
      <Suspense fallback={<Pending label="Đang tải trận đấu…" />}>
        <MatchPage />
      </Suspense>
    ),
  },
  { path: "/results/:code", element: <ResultsPage /> },
  { path: "*", element: <Navigate to="/" replace /> },
]);

export function App() {
  return (
    <ErrorBoundary>
      <LocaleProvider>
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </LocaleProvider>
    </ErrorBoundary>
  );
}
