# Screen — `/sign-in`

Clerk's prebuilt component, mounted on a route of ours so the user never leaves the app shell
([ADR-0002../../04-decisions/adr/ADR-0002-auth-clerk-jwt.md)). Playing as a guest never passes through here.

## Layout

```
┌───────────────────────────────────────────────────────────┐
│ ←                              Đăng nhập        [VI|EN]   │
├───────────────────────────────────────────────────────────┤
│         ┌─────────────────────────────────────┐           │
│         │  [ Tiếp tục với Google ]            │           │
│         │  ─────────── hoặc ───────────        │           │
│         │  Email  [__________________]         │           │
│         │  [ Tiếp tục với email ]              │           │
│         └─────────────────────────────────────┘           │
│         Chơi không cần tài khoản →                        │
└───────────────────────────────────────────────────────────┘
```

## Behaviour

| Element | Detail |
|---------|--------|
| Provider | Clerk `<SignIn>` with `routing="hash"` (or its virtual routing), appearance themed to the four project colours |
| Providers enabled | Google OAuth and email (code or magic link, Clerk default). Nothing else is enabled in the Clerk dashboard |
| Success | `window.location.replace(returnTo ?? '/')` after Clerk reports a session; the next API call creates the D1 rows |
| Cancel / back | Returns to `/` with no error |
| Guest escape | `Chơi không cần tài khoản` → `/`, keeps whatever guest id exists |
| Deep link | `?returnTo=/lobby/K7M2QX` is honoured after sign-in, only for same-origin paths |

## States

| State | Behaviour |
|-------|-----------|
| Loading Clerk JS | Button skeleton; never a blank white card |
| Clerk unreachable | Banner `Không đăng nhập được` + retry; the guest link stays available (`NFR-20` risk noted in the runbook) |
| Already signed in | Immediate redirect to `returnTo`; the form is not shown |
| Error from Clerk | Clerk's inline message, translated by its locale prop (`vi-VN` / `en-US`) |

## Fields

No field of ours. Display name and avatar are chosen **after** the first sign-in on `/profile` (defaults: Clerk's first
name or `Người chơi` + the default avatar), so this screen owns no validation.

## Security notes

- No password, token or Clerk secret is handled by our code (`NFR-12`); the publishable key is public by design and
  comes from `VITE_CLERK_PUBLISHABLE_KEY`.
- The route is the only one that loads Clerk's JS; it is code-split so the match bundle stays under budget (`NFR-03`).
- Signing out (from `/profile`) clears Clerk's session and the local session token, then returns to `/`.

## Oracle

| Contract | Checked by |
|----------|-----------|
| Guest link returns to `/` without auth | `tests/e2e/signin.spec.ts` (TC-AUTH-137) |
| `returnTo` honoured for same-origin paths only | `tests/e2e/signin.spec.ts` — `returnTo=https://evil.example` is ignored (TC-AUTH-138) |
| Clerk route is code-split (no Clerk in the match chunk) | `tests/e2e/bundle.spec.ts` — chunk assertion on the build report (TC-PWA-139) |
