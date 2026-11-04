# React + Vite — testing guide

Framework: **Vitest** + **React Testing Library** + **MSW** for component and hook tests, **Playwright** for browser
journeys. General rules are in `.agents/rules/05-testing.md`; this file is how to apply them in this stack.

## 1. Levels

| Level | Location | Tool | Use for |
|-------|----------|------|---------|
| Pure function | beside the module, `*.test.ts` | Vitest | Formatters, reducers, validators, query-key builders |
| Component | beside the component, `*.test.tsx` | RTL + MSW | Every acceptance criterion that is visible to the user: rendering, interaction, validation display, states |
| Hook | beside the hook | `renderHook` + MSW | A hook with branching logic (pagination, optimistic update, derived state) |
| Journey | `tests/e2e/` | Playwright | A criterion that crosses pages or needs a real browser: login → create → see it in a list |

Default to the component test — it is the contract the story states, and it runs in milliseconds. Reaching for
Playwright for something JSDOM can do is slower feedback and more flakiness. Reaching for a component test when the
criterion is "layout on mobile" or "drag to reorder" is a test that cannot fail for the right reason.

## 2. Query priority

Test what the user sees and does. Use the accessibility tree, top-down:

| Priority | Query | Use for |
|----------|-------|---------|
| 1 | `getByRole(role, { name })` | Buttons, links, headings, inputs, dialogs, tables |
| 2 | `getByLabelText` | Form fields with a label |
| 3 | `getByText` / `getByPlaceholderText` / `getByDisplayValue` | Static copy, placeholder-only inputs (a smell), filled inputs |
| 4 | `getByAltText` / `getByTitle` | Images, rare titles |
| 5 | `getByTestId` | Escape hatch when nothing above is stable — and then the a11y gap is the real finding |

Variants: `getBy*` throws, `queryBy*` returns `null` (use for "is absent"), `findBy*` returns a promise (use for
anything that appears after async work).

`container.querySelector(...)` and `document.getElementById(...)` are review findings: a test that passes that way
proves nothing about whether a user can reach the element.

## 3. Component tests

`src/test/setup.ts`, registered through `vite.config.ts` → `test.setupFiles`:

```ts
import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { cleanup } from '@testing-library/react'
import { server } from './server'                 // MSW handlers for the whole suite

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())
```

`onUnhandledRequest: 'error'` is deliberate: an unmocked request fails loudly. A test that silently reaches the network
is worse than red.

```tsx
// src/test/utils.tsx — one render helper, all providers in the order production uses
export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}
export * from '@testing-library/react'          // so tests import everything from one place
```

```tsx
test('shows a validation error when the customer is missing', async () => {
  const user = userEvent.setup()
  renderWithProviders(<OrderForm onCreated={() => {}} />)

  await user.click(screen.getByRole('button', { name: /save/i }))

  expect(screen.getByRole('alert')).toHaveTextContent(/fix the highlighted fields/i)
  expect(screen.getByLabelText(/customer/i)).toHaveAttribute('aria-invalid', 'true')
  expect(screen.queryByText(/saved/i)).not.toBeInTheDocument()
})
```

- `userEvent.setup()` once per test, `await` every call. Prefer `userEvent` over `fireEvent`: it simulates the real
  sequence (focus, key events, pointer events) that reveals real bugs.
- Never mock React, the query library, or the router. Mock at the network edge with MSW; override per test with
  `server.use(...)`.
- Assert observable outcomes: visible text, ARIA state, a callback argument, the request that was sent. Not component
  state, not prop drilling, not render counts.
- Never `setTimeout` + assert. Use `findBy*`, `waitFor`, or `waitForElementToBeRemoved`.
- Snapshot tests of rendered markup are not used: they break on styling, get rubber-stamped, and assert DOM structure.
  A snapshot of a pure serializer's output is fine.

## 4. Hook tests

```tsx
test('useOrders requests the filtered list and exposes the error', async () => {
  server.use(http.get('/api/v1/orders', () => new HttpResponse(null, { status: 500 })))

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useOrders({ status: 'paid' }), { wrapper })

  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error).toBeInstanceOf(ApiError)
})
```

Create the `QueryClient` once per test, outside the wrapper closure — inside it, the cache resets on every render and
the test flakes. State-changing calls go inside `act`.

## 5. Browser journeys (Playwright)

Structure: page objects in `tests/e2e/pages/`, one spec per journey, fixtures for auth and seeded data. Locators use the
same priority as RTL — role and label first, `data-testid` last.

```ts
// tests/e2e/pages/orders.ts
export class OrdersPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/orders')
    await expect(this.page.getByRole('heading', { name: 'Orders' })).toBeVisible()
  }

  async create(customer: string) {
    await this.page.getByRole('link', { name: /new order/i }).click()
    await this.page.getByLabel('Customer').fill(customer)
    await this.page.getByRole('button', { name: /save/i }).click()
    await expect(this.page.getByRole('status')).toHaveText(/created/i)
  }

  row(customer: string) {
    return this.page.getByRole('row', { name: new RegExp(customer) })
  }
}
```

```ts
// playwright.config.ts
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),          // a stray test.only fails CI
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
```

- Web-first assertions only (`await expect(locator).toBeVisible()`); they retry until timeout. `waitForTimeout(5000)` is
  a flake with a timer on it, and `waitForLoadState('networkidle')` is unreliable on any app that polls or streams —
  assert on the element the user is waiting for instead.
- Authenticate once: a setup project writes `storageState`, and the specs reuse it (`use: { storageState }`) instead of
  driving the login form in every test.
- A failing test that is genuinely flaky is quarantined with `test.fixme(true, 'issue #123')` and fixed or deleted in
  the same iteration — never left skipped without a link.
- One browser project by default. Adding Firefox/WebKit/mobile multiplies run time; add it when a story has a
  cross-browser criterion, and then run it in CI nightly.

## 6. Coverage

```ts
// vite.config.ts → test.coverage
coverage: {
  provider: 'v8',
  reporter: ['text', 'html', 'lcov'],
  include: ['src/**/*.{ts,tsx}'],
  exclude: ['src/main.tsx', 'src/test/**', '**/*.d.ts'],
  thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
},
```

Thresholds are the project's (rule 05: 80% of changed lines if unset). Coverage of a page reached only through
Playwright is measured by the E2E suite or not at all — do not write component tests for a page purely to move the
number.

## 7. Recipes per acceptance-criterion type

| AC says… | Test |
|----------|------|
| "shows X" | Render with the query's data mocked, assert via role/text |
| "only shows X to an admin" | Render as each role, assert presence/absence — and one Playwright run against the real API for the server-side rule |
| "validates the form" | Submit invalid input, assert `role="alert"` summary, the field's `aria-invalid`, and that no request was sent |
| "saves / creates" | Interact, assert the request body MSW received, then the success state |
| "shows an error when the API fails" | `server.use` a 500, assert the error state and that a retry re-issues the request |
| "shows empty state" | Mock an empty list, assert the empty copy and the call to action |
| "paginates / filters" | Assert the request URL carries the parameter and the list re-renders; URL state survives a reload (Playwright) |
| "is keyboard accessible" | `user.tab()` through the flow, assert focus and `Enter`/`Space` activation |
| "has no a11y violations" | `expect(await axe(container)).toHaveNoViolations()` for interactive components |
| "navigates to a detail page" | Router-level test with `MemoryRouter`, or Playwright when the route needs a real URL |

`vitest-axe` (via `expect.extend`) catches missing labels, invalid ARIA, and heading order. It cannot catch contrast or
layout in JSDOM, so it is a floor, not a substitute for the review checklist in the pack. Use `vitest-axe` and do not
add a second a11y matcher library.

## 8. Commands

```bash
npx vitest run                                # the PROJECT test command (CI shape)
npx vitest run src/features/orders/OrderForm.test.tsx        # one file
npx vitest run -t "validation error"                         # one test by name
npx vitest run --coverage                                    # with thresholds
npx playwright test                                          # journeys
npx playwright test --ui                                     # local debugging
npx playwright show-trace test-results/<test>/trace.zip      # inspect a CI failure
```

A test run counts only if it was executed: a component test that passes with the assertion deleted proves nothing, and
`--coverage` numbers without a browser run do not cover the journeys.
