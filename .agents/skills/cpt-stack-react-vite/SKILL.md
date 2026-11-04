---
name: cpt-stack-react-vite
description: Coding and testing guide for React single-page apps built with Vite, TypeScript, Vitest, React Testing Library, MSW, and Playwright — component and hook discipline, state placement, data fetching, forms, accessibility, and the layout, config, env, and build rules of a Vite app. Use when implementing, testing, or reviewing any story that touches a React component, hook, route, form, client-side data fetch, Vite config, or browser test.
status: unverified            # unverified | verified — see packs/README.md
recommends: [browser-verify]  # a rendered surface is proved in a browser, not only in jsdom
---

# cpt-stack-react-vite

Stack pack for React + Vite apps. Project decisions in `docs/01-overview/conventions.md` override this pack.

## Scope and versions

Covers: a client-side React app built by Vite, written in TypeScript, tested with Vitest + React Testing Library and
MSW, with Playwright for browser-level journeys. Component composition, hooks discipline, state placement, data
fetching and caching, forms and validation display, accessibility, and the Vite/TypeScript configuration around them.

**Written for:** React 19, Vite 7–8, TypeScript 5.x, Vitest 3.x, React Testing Library 16.x, MSW 2.x, Playwright 1.4x
(2026-10). **Not exercised end to end by CPT** — version-sensitive items name the version inline. Before relying on a
Vite config key, confirm which bundler options object your Vite major uses (`rollupOptions` on Rollup-based versions,
`rolldownOptions` from the Rolldown switch); before using a React 19 API (`useActionState`, `use`, `ref` as a prop),
confirm it in the installed version's docs.

**Out of scope:** this pack assumes a **client-side SPA**. Server Components, `"use server"`, and Next.js App Router
guidance do not apply — if the project is Next.js, it needs its own pack and this one is not installed. No router
library is prescribed: the project's choice (React Router, TanStack Router) goes in `conventions.md`.

## PROJECT values

What `cpt-docs` writes into `AGENTS.md` § PROJECT (adjust if the project uses pnpm/yarn — record that in conventions.md):

| Field | Value |
|-------|-------|
| Build | `npm run build` (`tsc -b && vite build` — the build script must type-check, Vite alone does not) |
| Test | `npx vitest run --coverage` (single test: `npx vitest run src/features/orders/OrderForm.test.tsx`) |
| E2E | `npx playwright test` (single: `npx playwright test tests/e2e/orders.spec.ts`) — after the app is built or dev-runnable |
| Lint / typecheck | `npm run lint && npm run typecheck` (`tsc -p tsconfig.app.json --noEmit`) |
| Run locally | `npm run dev` (Vite dev server, port per `vite.config.ts`) |
| Layout | See [references/project-layout.md](references/project-layout.md) |

## How this plugs into cpt-ship

1. **Plan** — map the story's § 4 contract to: route (if any), components (presentational vs container), the hook or
   query that owns data, the form and its validation source, and the states the user must see (loading, empty, error,
   success). State where each piece of state lives ([references/coding.md](references/coding.md) § 2).
2. **Test first** — per acceptance criterion, a component test through accessible queries with MSW handling the
   network ([references/testing.md](references/testing.md) § 3). A hook with branching logic gets a `renderHook` test
   (§ 4). Only a criterion about a full journey across pages becomes a Playwright test.
3. **Implement** — types and props first, then the presentational component, then the data/state layer, then the route
   wiring. Match the neighbouring feature folder before inventing a new structure.
4. **Verify** — the PROJECT build, test, and lint commands. `vite build && vite preview` once when the story changes
   the build config, env handling, or routing (dev and build do not behave identically). Then walk the acceptance
   criteria in a real browser against `vite dev` (cpt-ship § 5): in Claude Code, `install.sh --browser-mcp` adds the
   Playwright MCP server for this. For console, network, or performance investigation, the Chrome DevTools MCP server
   (`chrome-devtools-mcp`) is an optional extra the user adds themselves.
5. **Docs** — update `docs/02-reference/api/` for any request the UI makes, and `docs/01-overview/conventions.md` for a
   decision this pack leaves open (router, styling system, state library).

## Review checklist (added to cpt-review)

- [ ] No derived state in `useState` + `useEffect`; value computed during render
      ([references/coding.md](references/coding.md) § 1).
- [ ] Every `useEffect` has a named reason to exist (subscription, DOM integration, analytics); data fetching is not
      one — it goes through the project's query layer (§ 3).
- [ ] Each piece of state lives at the lowest common owner; no new global store or context without a
      `conventions.md`/ADR entry and 2+ distant consumers.
- [ ] `useMemo`/`useCallback`/`memo` only where a measured render cost or a dependency-stability bug justifies it —
      not by default.
- [ ] Every list item has a stable `key` (an id from the data, never the array index for a mutable list).
- [ ] All four UI states handled where data is read: loading, empty, error, success; the error state offers a retry.
- [ ] Forms: labels bound with `htmlFor`/`id`, server validation errors shown next to the field and in a summary with
      `role="alert"`, submit disabled while pending, focus moved to the first invalid field.
- [ ] Interactive elements are real elements (`<button>`, `<a href>`, `<label>`), not clickable `<div>`; keyboard
      operable, visible focus, no `onClick` without a key handler at all.
- [ ] No secret in a `VITE_`-prefixed variable: the prefix is inlined into the client bundle, so only public values
      (API base URL, public keys) use it ([references/project-layout.md](references/project-layout.md) § 5).
- [ ] Requests go through one typed API client; URLs come from the env base URL, not hardcoded hosts; no `fetch` with a
      hand-built query string.
- [ ] Loading a route or a below-the-fold panel is lazy (`React.lazy` / dynamic `import()`) where the story adds a
      heavy dependency; the Suspense fallback matches the final layout's size.
- [ ] `ErrorBoundary` wraps each route-level subtree so a render error does not blank the whole app.
- [ ] No new dependency without approval (rule 06); no barrel `index.ts` re-export added to a directory
      ([references/project-layout.md](references/project-layout.md) § 2).
- [ ] `npm run typecheck` clean — a green `vite build` is not evidence, because Vite only transpiles. With project
      references, a bare `tsc --noEmit` on the solution `tsconfig.json` checks nothing: use `tsc -b` or
      `-p tsconfig.app.json --noEmit`.

## References

| File | Read when |
|------|-----------|
| [references/project-layout.md](references/project-layout.md) | Setting up the project (US-FND-001), adding a feature folder, touching `vite.config.ts`, `tsconfig.json`, env vars, or the build |
| [references/coding.md](references/coding.md) | Writing any component, hook, form, data fetch, route, or error/empty state |
| [references/testing.md](references/testing.md) | Writing or fixing a component test, hook test, MSW handler, or Playwright journey |
