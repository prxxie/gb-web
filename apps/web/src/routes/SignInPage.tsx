/**
 * Sign-in (`US-AUTH-002`).
 *
 * Clerk is loaded only when a publishable key is configured, and only on this route: the match
 * bundle must not contain the identity SDK (`TC-AUTH-139`).
 */
import { Suspense, lazy, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLocale, useSession } from "../app/providers";
import { upgradeToAccount } from "../lib/session";
import { useOnline } from "../lib/online.js";
import type { JSX } from "react";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

const ClerkSignIn = lazy(async () => {
  const clerk = await import("@clerk/clerk-react");
  const { ClerkProvider, SignIn, useAuth } = clerk;

  /**
   * Clerk proves who the player is; the game still needs its own session token (`US-AUTH-002` AC1).
   * Without this bridge the sign-in succeeds and the app keeps talking to the API as a guest, which is
   * exactly the bug a signed-in user used to hit. It lives inside the lazy chunk so the Clerk SDK never
   * reaches the match bundle (`TC-AUTH-139`).
   */
  function SessionBridge() {
    const { isSignedIn, getToken } = useAuth();
    const { adopt } = useSession();
    const { t } = useLocale();
    const [failed, setFailed] = useState(false);
    useEffect(() => {
      if (!isSignedIn) return;
      let cancelled = false;
      void (async () => {
        try {
          const jwt = await getToken();
          if (!jwt || cancelled) return;
          const session = await upgradeToAccount(jwt);
          if (!cancelled) adopt(session);
        } catch {
          if (!cancelled) setFailed(true);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [adopt, getToken, isSignedIn]);
    return failed ? <p className="muted">{t("errors.internal")}</p> : null;
  }

  return {
    default: function SignInScreen() {
      return (
        <ClerkProvider publishableKey={publishableKey ?? ""}>
          <SignIn routing="hash" />
          <SessionBridge />
        </ClerkProvider>
      );
    },
  };
});

export function SignInPage(): JSX.Element {
  const { t } = useLocale();
  const online = useOnline();
  const { refresh } = useSession();
  const [params] = useSearchParams();
  const [returnTo, setReturnTo] = useState("/");

  useEffect(() => {
    const requested = params.get("returnTo");
    // Only same-origin paths are honoured, so a crafted link cannot bounce a player off-site.
    if (requested && requested.startsWith("/") && !requested.startsWith("//")) setReturnTo(requested);
  }, [params]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="screen screen--center">
      <h1>{t("signIn.title")}</h1>
      {online ? (
        publishableKey ? (
          <Suspense fallback={<p className="muted">{t("common.loading")}</p>}>
            <ClerkSignIn />
          </Suspense>
        ) : (
          <div className="card">
            <p>{t("signIn.note")}</p>
            <p className="muted">VITE_CLERK_PUBLISHABLE_KEY</p>
          </div>
        )
      ) : (
        // Signing in is a network action; offline the route says so rather than mounting the Clerk chunk.
        <p className="muted" data-testid="signin-offline">
          {t("signIn.offline")}
        </p>
      )}
      <div className="row">
        <Link to={returnTo}>
          <button type="button" className="ghost">
            {t("signIn.guest")}
          </button>
        </Link>
        <Link to="/">
          <button type="button" className="ghost">
            {t("common.home")}
          </button>
        </Link>
      </div>
    </div>
  );
}
