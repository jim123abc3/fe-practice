# TanStack Query (React Query) v5 — comprehensive reference

Everything about React Query as used in this project and in senior FE work: the
mental model, every hook and option that matters, caching, invalidation,
mutations, infinite queries, dependent/parallel queries, and the gotchas. Code
references point at the marketplace build (`git show <hash>`).

---

## 0. The one idea

React Query manages **server state** — data you don't own, that lives on a
server, is shared, and goes stale. It is **not** a state manager for UI state
(that's `useState`/`useReducer`/context). Stop copying server data into local
state; let the cache be the single source of truth and subscribe to it.

**Server state vs UI state** (say this): "React Query owns server state — caching,
deduping, background refetch, staleness. `useState` owns ephemeral UI state —
toggles, form inputs, which tab is open. The bug people ship is duplicating
fetched data into `useState`, which then drifts."

---

## 1. Setup

```tsx
// Factory, not a module singleton — see why below
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: 2, refetchOnWindowFocus: false },
    },
  });
}

// _app.tsx — useState so it's created once per client/request, NOT module-level
const [queryClient] = useState(() => makeQueryClient());
<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
```

**Why `useState`, not `const client = new QueryClient()` at module scope:** a
module-level client is instantiated **once per server process, shared across all
requests** — one user's cached data can leak into another user's SSR response.
`useState`'s lazy initialiser runs once per component instance (once per request
on the server, once on the client). *(commit `7072123`)*

---

## 2. Query keys — the cache's primary key

A query is identified by its key (deep-compared). Same key across components =
**one** cache entry, shared and deduped.

```ts
// A key FACTORY keeps keys consistent and makes invalidation granular
export const itemKeys = {
  all: ["items"] as const,
  lists: (f: ItemFilters) => [...itemKeys.all, "list", f] as const,   // ["items","list",{...}]
  detail: (id: string) => [...itemKeys.all, "detail", id] as const,   // ["items","detail","x"]
};
```

**Prefix matching is the superpower:** React Query matches by key *prefix*, so:

```ts
invalidateQueries({ queryKey: itemKeys.all })          // every list AND detail
invalidateQueries({ queryKey: [...itemKeys.all, "list"] })  // all lists, any filter
invalidateQueries({ queryKey: itemKeys.lists(f) })     // one specific filtered list
```

Put every input the query depends on **in the key** (`q`, `limit`, `sort`…).
Change the key → it's a different query → refetch. This is how debounced search
works: debounced term goes in the key. *(commits `d8055a2`, `b6aaf57`)*

---

## 3. `useQuery` — the return shape & the options that matter

```ts
const {
  data,              // undefined until first success
  error,
  status,            // "pending" | "error" | "success"
  fetchStatus,       // "fetching" | "paused" | "idle"  (orthogonal to status!)
  isLoading,         // status==="pending" && fetchStatus==="fetching" (first load, no data)
  isFetching,        // ANY fetch in flight (incl. background refetch)
  isError, isSuccess,
  isPlaceholderData, // showing placeholder/previous data
  refetch,
} = useQuery({
  queryKey: itemKeys.detail(id),
  queryFn: ({ signal }) => fetchItem(id, signal),   // ALWAYS thread `signal` → auto-cancel
  enabled: !!id,               // gate the query (dependent queries)
  staleTime: 30_000,           // how long data is "fresh" (no auto refetch)
  gcTime: 5 * 60_000,          // how long unused data stays cached before garbage collection
  retry: 2,                    // retry failed fetches N times (or a fn)
  refetchOnWindowFocus: false, // refetch when tab regains focus (default true)
  select: (data) => data.items,// transform/subset (see §7)
  placeholderData: keepPreviousData, // keep old data on key change (see §7)
});
```

**`isLoading` vs `isFetching` (classic gotcha):** `isLoading` = first load, no
data yet → show a skeleton. `isFetching` = *any* fetch incl. background refetch →
show a subtle spinner but keep the stale data visible. Using `isFetching` for the
skeleton makes the whole UI flash on every background refetch.

**`staleTime` vs `gcTime`:** `staleTime` = freshness (while fresh, no refetch on
mount/focus). `gcTime` (was `cacheTime` in v4) = how long data survives in cache
*after no component is using it*. High `gcTime` is what makes back-navigation
instant. *(commit `59a66ed`)*

---

## 4. Caching & refetch behaviour

- **Stale-while-revalidate:** a stale query returns cached data **immediately**,
  then refetches in the background and updates. UI never blocks on refetch.
- **Automatic refetch triggers** (when stale): on mount, on window focus, on
  network reconnect. All configurable.
- **Deduping:** multiple components with the same key mounting at once fire **one**
  network request.
- **Structural sharing:** on refetch, React Query keeps the *same object
  references* for unchanged parts of the response, so `===` checks and `memo`
  don't needlessly re-render.

---

## 5. Mutations & optimistic updates

```ts
useMutation({
  mutationFn: postOffer,
  onMutate: async (vars) => {
    await queryClient.cancelQueries({ queryKey: itemKeys.detail(vars.itemId) }); // 1. stop in-flight GETs
    const previous = queryClient.getQueryData(itemKeys.detail(vars.itemId));     // 2. snapshot
    queryClient.setQueryData(itemKeys.detail(vars.itemId),                       // 3. optimistic write
      (old) => old && { ...old, priceCents: vars.amountCents });
    return { previous };                                                         // 4. context for rollback
  },
  onError: (_e, vars, ctx) => queryClient.setQueryData(itemKeys.detail(vars.itemId), ctx?.previous), // roll back
  onSettled: (_d, _e, vars) => queryClient.invalidateQueries({ queryKey: itemKeys.detail(vars.itemId) }), // reconcile
});
```

- **`cancelQueries` in `onMutate` is the line people forget** — without it an
  in-flight GET can resolve *after* your optimistic write and clobber it.
- **Snapshot → return as `context` → restore in `onError`** = rollback.
- **`onSettled` fires on success AND error** → invalidate to reconcile the guess
  against server truth.
- `useMutation` returns `mutate` (fire-and-forget) and `mutateAsync` (returns a
  promise you can await). *(commit `ff8e7c7`)*

**Callback order:** `onMutate` → (network) → `onSuccess`/`onError` → `onSettled`.

---

## 6. `useInfiniteQuery` — paginated/infinite lists

```ts
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
  queryKey: itemKeys.lists({ q, limit }),
  queryFn: ({ pageParam, signal }) => fetchItems({ q, limit, cursor: pageParam }, signal),
  initialPageParam: 0,
  getNextPageParam: (last) => last.nextCursor,       // return undefined/null → hasNextPage=false
  getPreviousPageParam: (first) => first.prevCursor,
  maxPages: 5,                                        // optional: cap pages (drops from far end)
});

// data is { pages: Page[], pageParams: [] } — flatten it:
const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
```

- `data` is **not** `{ items }` — it's `{ pages, pageParams }`. Flatten with
  `flatMap`, memoized for a stable reference.
- `maxPages` (v5) enables windowed infinite lists for truly unbounded feeds —
  drops pages from the opposite end, needs `getPreviousPageParam` to refetch on
  reverse scroll.
- `fetchNextPage` **appends** a page (that's what makes it "infinite"). *(commit `ea69a01`)*

---

## 7. `select`, `placeholderData`, `initialData`

```ts
// select — transform/subset WITHOUT changing the fetcher. Runs on every render
// unless stable, so memoize expensive transforms.
useQuery({ queryKey, queryFn, select: (data) => data.results.filter(alive) });

// keepPreviousData — on key change, show the OLD data (marked isPlaceholderData)
// instead of flashing a spinner. Perfect with debounced search / pagination.
useQuery({ queryKey: [..., page], queryFn, placeholderData: keepPreviousData });
// then dim the UI: sx={{ opacity: isPlaceholderData ? 0.5 : 1 }}

// initialData — seed the cache synchronously (e.g. from SSR/props). Treated as
// real data (respects staleTime). vs placeholderData = shown but not cached.
useQuery({ queryKey, queryFn, initialData: fromServer });
```

**`initialData` vs `placeholderData`:** `initialData` is persisted to the cache
and treated as real (subject to `staleTime`); `placeholderData` is display-only,
never written to cache, replaced the moment real data arrives. *(commit `b6aaf57`)*

---

## 8. Dependent & parallel queries

```ts
// Dependent (sequential): gate query B on query A's result with `enabled`
const { data: user } = useQuery({ queryKey: ["user", id], queryFn: () => getUser(id) });
const { data: projects } = useQuery({
  queryKey: ["projects", user?.teamId],
  queryFn: () => getProjects(user!.teamId),
  enabled: !!user?.teamId,          // waits until user is loaded
});

// Parallel dynamic — a runtime-length list of queries
const results = useQueries({
  queries: episodeIds.map((eid) => ({
    queryKey: ["episode", eid],
    queryFn: () => getEpisode(eid),
  })),
});
// results is an array of query results; combine with the `combine` option if needed
```

---

## 9. Prefetching & imperative cache access

```ts
// Prefetch on hover for instant navigation
const onHover = () => queryClient.prefetchQuery({
  queryKey: itemKeys.detail(id),
  queryFn: () => fetchItem(id),
});

queryClient.getQueryData(key);          // read cache (sync, no fetch)
queryClient.setQueryData(key, updater); // write cache (optimistic / realtime patch)
queryClient.getQueriesData({ queryKey });   // read many by prefix
queryClient.setQueriesData({ queryKey }, updater); // write many by prefix
queryClient.invalidateQueries({ queryKey }); // mark stale + refetch active ones
queryClient.removeQueries({ queryKey });     // drop from cache entirely
queryClient.cancelQueries({ queryKey });     // abort in-flight (used in onMutate)
```

`setQueriesData` + walking `pages` is how realtime/optimistic patches hit every
cached list at once (the marketplace cache-walker). *(commits `ff8e7c7`, `744013e`)*

---

## 10. Suspense mode

```ts
// Throws a promise while pending (caught by <Suspense>), throws errors (caught by
// an error boundary). data is NON-nullable — no isLoading/isError branches.
const { data } = useSuspenseQuery({ queryKey, queryFn });
```

Move loading/error handling **out of the component** into `<Suspense fallback>`
and an error boundary. Pair with `QueryErrorResetBoundary` for retry.

---

## 11. Realtime → cache (the pattern used 3 ways here)

For SSE / WebSocket / Pusher, the rules are identical:

1. **Patch, don't invalidate** in steady state — `setQueryData`/`setQueriesData`.
   Invalidating per event = a refetch storm.
2. **Invalidate once on reconnect** — you missed events in the gap, resync.
3. **Batch** high-frequency events (ref buffer + rAF/250ms flush) → one render/frame.
4. **Reference-stable patches** — return the same object for unchanged entities so
   memoized components don't re-render. *(commit `744013e`)*

---

## 12. Testing

```tsx
// Fresh client per test (no cache leak) + retry:false (errors surface immediately)
function makeTestClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}
// Wrap in <QueryClientProvider>, mock the network with MSW, assert states.
```

*(commit `99f48b0`)*

---

## 13. DevTools

```tsx
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
<ReactQueryDevtools initialIsOpen={false} />
```

Shows every query, its key, status (fresh/stale/fetching/inactive), and lets you
inspect/refetch. Invaluable for debugging cache/invalidation.

---

## 14. v4 → v5 migration notes (they may ask)

- `cacheTime` → **`gcTime`**.
- `useQuery(key, fn, opts)` positional args → **single options object** only.
- `keepPreviousData: true` → **`placeholderData: keepPreviousData`** (imported fn).
- `isLoading` semantics tightened; `status: "loading"` → **`status: "pending"`**.
- Infinite queries now **require `initialPageParam`**.
- Dedicated **`useSuspenseQuery`** (instead of a `suspense: true` flag).

---

## 15. Gotchas & anti-patterns

| Anti-pattern | Fix |
|---|---|
| Module-level `QueryClient` | `useState(() => makeQueryClient())` |
| Copying `data` into `useState` | subscribe to the cache; don't duplicate server state |
| `isFetching` for the skeleton | use `isLoading` (first load); `isFetching` is for background spinners |
| Unstable `queryKey` (new object each render in the key) | keys are structurally compared — fine — but don't put unstable *functions* in |
| Not threading `signal` to fetch | pass it → automatic cancellation of superseded requests |
| Invalidating per realtime event | patch the cache; invalidate only on reconnect |
| Forgetting `cancelQueries` in `onMutate` | in-flight GET clobbers the optimistic write |
| Non-memoized `select` doing heavy work | memoize the transform |
| `staleTime: 0` everywhere (default) then surprised by refetches | set `staleTime` intentionally per query |

---

## 16. The spoken summary

*"React Query manages server state: it caches by a structured key, serves
stale-while-revalidate, dedupes concurrent requests, and refetches in the
background on mount/focus/reconnect. I model keys with a factory so invalidation
is granular via prefix matching. Mutations are optimistic — snapshot, write,
roll back on error, invalidate on settle, and cancel in-flight queries first so
they can't clobber the write. For realtime I patch the cache directly and only
invalidate on reconnect. `staleTime` controls freshness, `gcTime` controls how
long unused data survives — high `gcTime` is what makes back-navigation instant.
And I never duplicate server data into `useState` — the cache is the source of
truth."*
