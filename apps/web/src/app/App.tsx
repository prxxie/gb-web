import { Suspense, lazy } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { ErrorBoundary } from "./ErrorBoundary";
import { RouteFrame } from "./RouteFrame";
import { LocaleProvider, SessionProvider, useLocale } from "./providers";
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

function Pending({ messageKey }: { messageKey: string }) {
  const { t } = useLocale();
  return (
    <div className="screen" role="status">
      <p>{t(messageKey)}</p>
    </div>
  );
}

/**
 * Every route renders inside `RouteFrame`, which owns the two things that need the current path: the
 * update prompt (suspended on `/match/:code`) and moving focus to the new screen's heading.
 */
const router = createBrowserRouter([
  {
    element: <RouteFrame />,
    children: [
      { path: "/", element: <MainPage /> },
      {
        path: "/sign-in",
        element: (
          <Suspense fallback={<Pending messageKey="common.loading" />}>
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
          <Suspense fallback={<Pending messageKey="match.loading" />}>
            <MatchPage />
          </Suspense>
        ),
      },
      { path: "/results/:code", element: <ResultsPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
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
