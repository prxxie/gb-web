# React + Vite — coding guide

TypeScript in `.tsx`. Everything here assumes a client-side SPA talking to an HTTP API; there are no Server Components
in a Vite app, so `"use server"`, `notFound()`, and RSC data-loading advice do not apply.

## 1. Render is pure; derived values are computed, not stored

```tsx
// good — derived during render
export function CartTotal({ items }: { items: CartItem[] }) {
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0)
  return <span>{formatMoney(total)}</span>
}

// bad — an effect, an extra render, and a source of desync
const [total, setTotal] = useState(0)
useEffect(() => setTotal(items.reduce((sum, item) => sum + item.price * item.qty, 0)), [items])
```

- If a value can be computed from props or state, compute it. `useState` holds what the user changed or what arrived
  from outside — nothing else.
- Never mutate props or state objects. Produce new ones (`{ ...user, name }`, `items.filter(...)`).
- Keep components under ~120 lines and one responsibility. If JSX has more than two levels of conditionals, extract
  subcomponents or an early return per UI state.

## 2. Where state lives

| Situation | Put it |
|-----------|--------|
| One component's UI state (open, tab, draft) | `useState` inside it |
| Parent and a few descendants | Lift to their nearest common ancestor, pass down |
| URL-addressable (filter, page, selected id) | The router's search params — shareable and back-button correct |
| Server data | The query layer (§ 3) — never copied into `useState` |
| Low-frequency, tree-wide (theme, auth, locale) | One context per concern, with a typed hook |
| High-frequency, tree-wide | External store — only with a `conventions.md` entry |

Default to no context and no global store. Two distant consumers is the threshold, not an anticipated one.

```tsx
// context only pays off when the provider and the consumer are far apart
const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (value === null) throw new Error('useAuth must be used inside <AuthProvider>')   // fail loudly, not `!`
  return value
}
```

## 3. Data fetching

One typed client, one cache. Components do not call `fetch` directly.

```ts
// lib/http.ts — the only place a URL is assembled
export class ApiError extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super(`Request failed with ${status}`)
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
  if (!response.ok) throw new ApiError(response.status, await response.json().catch(() => null))
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}
```

```tsx
// features/orders/useOrders.ts
export const orderKeys = {
  list: (filter: OrderFilter) => ['orders', 'list', filter] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
}

export function useOrders(filter: OrderFilter) {
  return useQuery({
    queryKey: orderKeys.list(filter),          // the key encodes every input, or the cache lies
    queryFn: () => apiFetch<Order[]>(`/orders?${new URLSearchParams(filter)}`),
  })
}

export function useCreateOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: OrderCreate) => apiFetch<Order>('/orders', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  })
}
```

- Query keys are arrays starting with the resource; every parameter that changes the response is in the key.
- The query library is the project's choice (TanStack Query, SWR, or the router's loader). What this pack requires:
  one layer, typed responses, explicit invalidation after a mutation, and no `useEffect(() => { fetch(...) })` in a
  component.
- `useEffect` + `fetch` for application data is banned: it races on prop changes, has no cache or retry, and cannot be
  awaited by a test without arbitrary waits. Legitimate effects are: a subscription (websocket, `matchMedia`, resize),
  a browser API the render tree cannot express, and analytics. Each one needs a comment naming why.
- Render the four states explicitly:

```tsx
if (query.isPending) return <OrderListSkeleton rows={5} />
if (query.isError) return <ErrorState message="Could not load orders" onRetry={() => query.refetch()} />
if (query.data.length === 0) return <EmptyState title="No orders yet" action={<Link to="/orders/new">Create one</Link>} />
return <OrderTable orders={query.data} />
```

## 4. Effects and cleanup

```tsx
useEffect(() => {
  const controller = new AbortController()
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  const onChange = () => setReducedMotion(media.matches)
  media.addEventListener('change', onChange)
  return () => {
    controller.abort()
    media.removeEventListener('change', onChange)     // every subscription is torn down
  }
}, [])
```

- Dependencies are complete; do not silence the lint rule. If adding a dependency loops, the value is derived (§ 1) or
  should be a ref.
- Functional updates when the new state depends on the old: `setCount(prev => prev + 1)`.
- A ref (`useRef`) holds a mutable value that must not trigger a render (a timer id, an element, a previous value). Do
  not read `ref.current` during render.

## 5. Lists, keys, and memoization

- `key` is a stable identity from the data (`order.id`), never the array index for a list that can reorder, insert, or
  delete.
- Do not memoize by default. Add `useMemo`/`useCallback`/`memo` when a React DevTools profiler run shows the render cost,
  or when an unstable function identity breaks a `useEffect` dependency of a child. A file with memo everywhere is a
  review finding, not a quality signal.
- Lazy-load routes and heavy panels: `const Reports = lazy(() => import('./Reports'))` inside `<Suspense fallback={…}>`
  whose fallback reserves the final height, so the layout does not jump.

## 6. Forms

Uncontrolled where possible: the DOM holds the value, `FormData` carries it on submit, and the schema validates it once
at the boundary.

```tsx
export function OrderForm({ onCreated }: { onCreated: (order: Order) => void }) {
  const create = useCreateOrder()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const errorRef = useRef<HTMLDivElement>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = Object.fromEntries(new FormData(event.currentTarget))
    const parsed = OrderCreateSchema.safeParse(data)          // the project's approved validation library
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error))
      errorRef.current?.focus()                              // move focus to the summary, not to a random input
      return
    }
    setFieldErrors({})
    try {
      onCreated(await create.mutateAsync(parsed.data))
    } catch (error) {
      setFieldErrors(serverFieldErrors(error))                // the API is the final authority (see the API doc)
      errorRef.current?.focus()
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div ref={errorRef} tabIndex={-1} role="alert" aria-live="polite">
        {Object.keys(fieldErrors).length > 0 && <p>Please fix the highlighted fields.</p>}
      </div>
      <label htmlFor="customer">Customer</label>
      <input id="customer" name="customer" aria-invalid={Boolean(fieldErrors.customer)} aria-describedby="customer-error" />
      {fieldErrors.customer && <p id="customer-error">{fieldErrors.customer}</p>}
      <button type="submit" disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Save'}</button>
    </form>
  )
}
```

- Client validation is for feedback, not authority: the server's validation is the rule (see `docs/02-reference/api/`).
  Display its field errors; never invent a rule the API does not have.
- Use a controlled input only when the value drives other UI, formats on every keystroke, or validates live.
- Multi-step, dynamic field arrays, or cross-field rules: use the form library recorded in `conventions.md` instead of
  growing this pattern.

## 7. Accessibility is part of the criterion

- Real elements: `<button type="button">`, `<a href>`, `<label htmlFor>`, `<table>` for tabular data. A clickable
  `<div>` is a review finding.
- Every input has a label; placeholder is not a label. Errors are text next to the field and in a focusable summary with
  `role="alert"`.
- Keyboard path works for every interactive component: focus visible, `Esc` closes overlays, focus returns to the
  trigger, focus is trapped in a modal while open.
- Dynamic status (`Saved`, `3 results`) goes into an `aria-live="polite"` region; a pending state sets `aria-busy`.
- One `<h1>` per page and no skipped heading levels; images carry `alt` (empty `alt=""` when decorative).
- Colour contrast ≥ 4.5:1 for text. Automated tooling cannot check this in JSDOM — it is a design review item.

## 8. Error handling

- A route-level `ErrorBoundary` per subtree, with a fallback that offers a reload and a way back. An error in one panel
  must not blank the app.
- Expected failures (404, 403, validation, network) are data, not thrown surprises: map `ApiError.status` to the state
  the user sees, using the status codes in the API doc.
- Never render a raw error object, stack trace, or response body to the user; log it, show a generic message with a
  correlation id if the project has one.

## 9. Anti-patterns

| Anti-pattern | Why it fails | Do instead |
|--------------|--------------|------------|
| State copied from props ("props to state") | Goes stale when the prop changes | Derive during render; reset with a `key` if genuinely needed |
| `useEffect` data fetching | Races, no cache, untestable without arbitrary waits | The query layer (§ 3) |
| `any` in a component's props | Erases the contract the API doc states | A typed prop, or `unknown` narrowed at the boundary |
| Index as `key` in a mutable list | Wrong rows reused after insert/delete, stale input values | The row's id |
| `useMemo`/`useCallback` everywhere | Costs more than it saves and hides real dependencies | Profile first (§ 5) |
| Business rule duplicated in the UI | Drifts from the API's rule | Read the rule from the API doc; display its errors |
| `VITE_` variable holding a secret | Inlined into the public bundle | Server-side secret behind the API |
| `dangerouslySetInnerHTML` with API or user text | XSS | Render text; sanitize with a vetted library if HTML is a real requirement, and flag it ⚠️ |
| Tests asserting on `data-testid` first | Users do not see test ids | Accessible queries (references/testing.md § 2) |
