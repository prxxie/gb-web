# React + Vite — project layout and tooling

## 1. Directory tree

Feature folders, not technical layers at the top. A feature owns its components, hooks, api calls, and tests.

```
<repo>/
├─ index.html                 Vite entry; only the root div and the module script
├─ vite.config.ts             plugins, alias, server, build, test config
├─ tsconfig.json              solution file referencing the two below
├─ tsconfig.app.json          src/ — strict, DOM libs
├─ tsconfig.node.json         vite.config.ts and build scripts — Node libs
├─ eslint.config.js           flat config
├─ .env.example               every VITE_ name with a dummy value
├─ .env.local                 git-ignored local overrides (never committed)
├─ public/                    files served at the root path, copied verbatim
├─ playwright.config.ts       e2e
└─ src/
   ├─ main.tsx                createRoot + providers + <App />
   ├─ app/
   │  ├─ App.tsx              router or top-level layout
   │  ├─ routes.tsx           the route table (if the router keeps one)
   │  └─ providers.tsx        query client, theme, auth — composed once
   ├─ lib/
   │  ├─ http.ts              the typed fetch wrapper: base URL, auth header, error shape
   │  ├─ format.ts            pure formatters (money, dates) — unit tested
   │  └─ queryClient.ts
   ├─ components/             shared, feature-agnostic UI (Button, Dialog, EmptyState)
   ├─ features/
   │  └─ orders/
   │     ├─ OrderList.tsx           container: reads data, composes presentational parts
   │     ├─ OrderRow.tsx
   │     ├─ OrderForm.tsx
   │     ├─ useOrders.ts            query/mutation hooks for this feature
   │     ├─ api.ts                  request functions + response types for this feature
   │     ├─ types.ts
   │     └─ OrderForm.test.tsx      tests live beside the file they test
   └─ test/
      ├─ setup.ts             jest-dom matchers, MSW server lifecycle, cleanup
      └─ utils.tsx            renderWithProviders + re-exports
tests/
└─ e2e/
   ├─ orders.spec.ts
   ├─ fixtures.ts             auth storage state, seeded data helpers
   └─ pages/                  page objects (references/testing.md § 5)
```

## 2. Module boundaries

Import direction: `app → features → components/lib`. A feature never imports from another feature's internals; if two
features need the same thing, it moves to `lib/` or `components/`.

- **No barrel files.** An `index.ts` that re-exports a directory forces the dev server to load every re-exported
  module for a single import, and it hides circular dependencies. Import the file directly.
- Deep imports into another feature (`features/orders/api`) are a boundary violation; expose the minimum from the
  feature's own entry or move the code.
- `lib/` and `components/` must not import from `features/`.
- A `.tsx` file exports one component as a named export (default exports complicate renames and lazy loading; a route
  module that `React.lazy` needs may use default — say so where it happens).

Naming: `PascalCase.tsx` for components, `useThing.ts` for hooks, `camelCase.ts` for everything else, `*.test.tsx`
beside the unit under test.

## 3. package.json scripts

The names are the contract — PROJECT values and CI both call them.

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "typecheck": "tsc -p tsconfig.app.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "e2e": "playwright test"
  }
}
```

`build` runs `tsc -b` **before** `vite build` on purpose: `vite build` transpiles TypeScript and does not type-check, so
without the first step type errors ship to production silently. `vite-plugin-checker` covers the same gap during
`npm run dev`; keep the `typecheck` script in CI as well. With project references (`tsconfig.json` holding only
`references` and no files of its own), a bare `tsc --noEmit` checks nothing — `tsc -b` builds every referenced project,
and `-p tsconfig.app.json --noEmit` type-checks `src/` without emitting.

## 4. vite.config.ts

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import checker from 'vite-plugin-checker'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),                       // honours tsconfig paths; do not hand-roll resolve.alias as well
    checker({ typescript: true, eslint: { lintCommand: 'eslint .' } }),
  ],
  server: {
    host: true,                            // reachable from a container or a remote dev box
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,                      // true only if uploaded to an error tracker
  },
})
```

- `server.proxy` exists so the browser calls a same-origin `/api/...` in development; in production the reverse proxy or
  the CDN does that job. Do not hardcode the API host in the client.
- Aliases live in `tsconfig.json` once, honoured by `vite-tsconfig-paths`. Two sources of truth drift.
- Vite version sensitivity: the bundler options object is `build.rollupOptions` on Rollup-based versions and
  `build.rolldownOptions` from the Rolldown switch. Check which one the installed Vite major documents before adding
  `manualChunks` or `external`.
- Manual chunking: group by vendor intent (`react-vendor`, `ui-vendor`) with the object form. Never one chunk per
  package — that produces hundreds of tiny files and worse loading.
- `vite preview` serves the built bundle to smoke-test it. It is not a production server; `dist/` goes to a static host
  or a real web server.

## 5. TypeScript and environment

`tsconfig.app.json` starts from `strict: true` and adds:

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,   // array access yields T | undefined
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,
    "paths": { "@/*": ["./src/*"] }
  }
}
```

Environment variables:

- Only `VITE_`-prefixed variables reach client code, and they are **statically inlined into the shipped bundle**.
  Minification, base64, and disabled source maps do not hide them: treat every `VITE_*` value as public.
  Secrets (tokens, private keys, database URLs) never enter a Vite env var — they live behind the API.
- Never set `envPrefix: ''` and never call `loadEnv(mode, cwd, '')` in the config: both expose server-side secrets to
  client code that inlines them via `define`.
- Load order (later wins): `.env`, `.env.local`, `.env.[mode]`, `.env.[mode].local`. Commit only `.env.example`, with
  dummy values.
- A new variable is added to `.env.example`, to the `Env` type in `src/vite-env.d.ts` (or `src/env.ts`), and to
  `docs/01-overview/environment-setup.md`. A variable the app cannot start without fails loudly at boot.

```ts
// src/env.ts — one place, validated, typed
export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  appName: import.meta.env.VITE_APP_NAME ?? 'App',
} as const
```

No `import.meta.env.VITE_*` reads scattered through components: they are untestable and impossible to enumerate.

## 6. Build and deploy pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| Users see a blank page right after a deploy | An open tab requests an old chunk hash that no longer exists | Keep the previous `dist/` live for a deployment window, and catch the dynamic-import error in the router to reload once |
| Dev works, production breaks | CJS dependency behaves differently under the build | `vite build && vite preview` before deploying; `optimizeDeps.include` the offending package |
| Types fail in CI but `vite build` passed locally | `vite build` alone does not type-check | Run `npm run typecheck` (`tsc -p tsconfig.app.json --noEmit`) or the `build` script in the same job |
| Phantom module errors after switching branches | Stale pre-bundle cache | Delete `node_modules/.vite` |
| Container cannot reach the dev server | Vite binds `localhost` | `server.host: true` |

`.gitignore`: `dist/`, `node_modules/.vite`, `.env.local`, `.env.*.local`, `playwright-report/`, `test-results/`,
`coverage/`.

## 7. Docs coupling

| Doc | Content this pack implies |
|-----|---------------------------|
| `docs/02-reference/api/` | Every endpoint the client calls, with request/response types that match `features/*/api.ts` |
| `docs/01-overview/conventions.md` | Router, styling system (CSS modules / Tailwind / component library), state library, form library, test-data policy |
| `docs/01-overview/environment-setup.md` | Every `VITE_*` name, its meaning, and its value per environment |
| `AGENTS.md` § PROJECT | The script names above, once `package.json` exists |

## 8. Ownership boundary

| Owns | Pack |
|------|------|
| Component, hook, state, form, and testing patterns; Vite/TypeScript config | This pack |
| SQL-level schema and migration policy | `cpt-stack-data` |
| Server contract behaviour, status codes, error body shape | The backend stack pack (the client consumes it) |
| Router, styling, state and form libraries, browser support | `docs/01-overview/conventions.md` |
