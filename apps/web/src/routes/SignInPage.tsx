/**
 * Sign-in (`US-AUTH-002`).
 *
 * Clerk is loaded only when a publishable key is configured, and only on this route: the match
 * bundle must not contain the identity SDK (`TC-AUTH-139`).
 */
import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLocale, useSession } from "../app/providers";
import type { JSX } from "react";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

const ClerkSignIn = lazy(async () => {
  const [{ ClerkProvider }, { SignIn }] = await Promise.all([import("@clerk/clerk-react"), import("@clerk/clerk-react")]);
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ClerkProvider publishableKey={publishableKey ?? ""}>
        {children}
      </ClerkProvider>
    );
  }
  return {
    default: function SignInScreen() {
      return (
        <Wrapper>
          <SignIn routing="hash" />
        </Wrapper>
      );
    },
  };
});

export function SignInPage(): JSX.Element {
  const { t } = useLocale();
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
      {publishableKey ? (
        <Suspense fallback={<p className="muted">{t("common.loading")}</p>}>
          <ClerkSignIn />
        </Suspense>
      ) : (
        <div className="card">
          <p>{t("signIn.note")}</p>
          <p className="muted">VITE_CLERK_PUBLISHABLE_KEY</p>
        </div>
      )}
      <div className="row">
        <Link to={returnTo}>
          <button type="button" className="ghost">
            {t("signIn.guest")}
          </button>
        </Link>
        <Link to="/">
          <button type="button" className="ghost">
            {t("results.home")}
          </button>
        </Link>
      </div>
    </div>
  );
}
