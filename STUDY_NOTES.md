# Arena Practice — Senior FE Study & Reference

A build-along reference for a marketplace tech test: a virtualized, infinite-scrolling,
realtime, optimistically-mutating 5,000-item grid built on **Next.js 14 (pages router) +
TypeScript + MUI v9 + Emotion SSR + TanStack Query v5 + TanStack Virtual**.

This doc is organised so you can (a) re-read the whole arc before an interview, and
(b) jump to a single topic when a question lands on it. Each phase cites the commit that
implemented it so you can `git show <hash>` the real code.

---

## Commit map (the whole build, in order)

| Commit | Phase | What landed |
|--------|-------|-------------|
| `ceef680` | 0 | Scaffold: Next 14 pages router, TS, MUI, React Query |
| `7ede2be` | 0 | Vitest + RTL config |
| `8281060` | 1 | MUI theme with **module augmentation** (custom variants) + Emotion SSR cache |
| `2aac9f5` | 2 | Mock dataset (seeded PRNG), cursor-paginated API, offers, SSE stream |
| `7072123` | 3 | React Query provider, typed fetcher, query key factory |
| `d8055a2` | 3 | **Refactor**: move client fetcher/keys out of `pages/api` (server-only dir) |
| `03361e5` | 4 | Deliberately naive 5k grid (unoptimised baseline, **measured**) |
| `179b8be` | 5 | Memoize card, stabilise props, split filter context |
| `5cac10f` | 6 | Hand-rolled `useVirtualList` windowing hook |
| `500d07e` | 6 | Swap to `@tanstack/react-virtual` |
| `ea69a01` | 7 | Infinite scroll: `useIntersectionObserver` + `useInfiniteQuery` |
| `59a66ed` | 8 | Scroll + page-depth restoration via sessionStorage |
| `6c164b3` | (aside) | Simple non-virtualized infinite scroll, for contrast |
| `b6aaf57` | 9 | Debounced search + URL-synced filters + request cancellation |
| `ff8e7c7` | 10 | Optimistic offer mutation with rollback across list+detail caches |
| `744013e` | 11 | SSE price stream patched into cache with batching |
| `7de967b` | 12 | Stale closure / zombie child / torn read demos |
| `99f48b0` | 13 | RTL + MSW tests (card, list states, debounce) |

**Narration principle used throughout:** *types first → a dumb version that renders →
measure → optimise once behaviour is right.* Phases 4→5→6 literally are this loop.

---

## Table of contents

1. [Scaffold & tooling](#1-scaffold--tooling)
2. [MUI theme + TypeScript module augmentation](#2-mui-theme--typescript-module-augmentation)
3. [Emotion SSR](#3-emotion-ssr)
4. [Mock data & the API contract](#4-mock-data--the-api-contract)
5. [React Query: provider, fetcher, key factory](#5-react-query-provider-fetcher-key-factory)
6. [The naive baseline & measuring performance](#6-the-naive-baseline--measuring-performance)
7. [Memoization & where it fails](#7-memoization--where-it-fails)
8. [Virtualization (hand-rolled → TanStack)](#8-virtualization-hand-rolled--tanstack)
9. [Infinite scroll](#9-infinite-scroll)
10. [Scroll restoration](#10-scroll-restoration)
11. [Debounced search, races, URL sync](#11-debounced-search-races-url-sync)
12. [Optimistic mutations & rollback](#12-optimistic-mutations--rollback)
13. [Realtime (SSE) into the cache](#13-realtime-sse-into-the-cache)
14. [React footguns: stale closure, zombie child, torn reads](#14-react-footguns)
15. [Testing (RTL + MSW)](#15-testing-rtl--msw)
16. [Core Web Vitals](#16-core-web-vitals)
17. [Anti-patterns avoided (cheat sheet)](#17-anti-patterns-avoided-cheat-sheet)
18. [Interview meta-skills](#18-interview-meta-skills)
19. [Typing drills](#19-typing-drills)

---

## 1. Scaffold & tooling

```bash
npx create-next-app@14.2.35 arena-practice \
  --typescript --eslint --src-dir --no-tailwind --no-app --import-alias "@/*"
```

Note `--no-app`: **pages router**, not app router. This matters everywhere (SSR data,
`_document`, `router.events`, shallow routing). Their real codebase is pages router.

`vitest.config.mts` — jsdom env, `globals: true`, `@` alias mirroring tsconfig:

```ts
export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", setupFiles: ["./vitest.setup.ts"], globals: true },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

**Why a separate vitest alias?** Vite/Vitest doesn't read `tsconfig.json` paths by default;
you re-declare `@` here or imports break in tests only.

---

## 2. MUI theme + TypeScript module augmentation

**Commit `8281060` — `src/theme/index.ts`.** The single highest-signal bit of the whole
test, because their DOM shows custom typography variants (`MuiTypography-interMd`,
`MuiTypography-drukMd`), which are impossible to type without **declaration merging**.

```ts
declare module "@mui/material/styles" {
  interface TypographyVariants { interMd: React.CSSProperties; drukMd: React.CSSProperties }
  interface TypographyVariantsOptions { interMd?: React.CSSProperties; drukMd?: React.CSSProperties }
  interface Palette { brand: Palette["primary"] }
  interface PaletteOptions { brand?: PaletteOptions["primary"] }
}
declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides { interMd: true; drukMd: true; h3: false } // h3:false REMOVES a variant
}
```

**Key concept — module augmentation / declaration merging:** `declare module "x" { interface Y {...} }`
*merges* your fields into the library's existing `interface Y` (interfaces are open;
types are not — this only works because MUI uses `interface`). `variantName: true` adds a
prop-level variant; `h3: false` removes one. `variantMapping` in `components.MuiTypography.defaultProps`
controls which HTML element each variant renders as.

Talking point: *"custom variants need declaration merging because MUI's variant union is
built from an interface it exposes precisely so consumers can extend it."*

---

## 3. Emotion SSR

**Commit `8281060` — `src/lib/emotion.ts`, `_app.tsx`, `_document.tsx`.** Boilerplate you
copy, but you must know *why it exists*: Emotion generates class names **at runtime**. Without
SSR extraction, the server sends unstyled HTML, then Emotion re-styles on hydration → a
**flash of unstyled content (FOUC)**. `_document.tsx` uses `createEmotionServer` +
`extractCriticalToChunks` to inline the critical CSS into the server response so styles are
present on first paint.

The `prepend: true` on the cache puts MUI's styles first in `<head>` so your `sx`/`styled`
overrides win specificity.

The pages-router `_app` uses one client-side cache module-level, and accepts an
`emotionCache` prop so `_document` can inject the server cache per request.

---

## 4. Mock data & the API contract

**Commit `2aac9f5`.**

**`src/mocks/data.ts` — seeded, deterministic 5,000 items** via `mulberry32(42)` PRNG.
Deterministic matters: same data every reload → stable to test/measure against.

```ts
export interface Item {
  id: string; name: string; player: string; year: number; setName: string;
  grade: number; priceCents: number; category: "card" | "watch";
  imageUrl: string; updatedAt: string;
}
```

Note `priceCents` (integer cents, never floats for money) and `updatedAt` as an ISO string.

**`src/pages/api/items.ts` — the contract everything downstream depends on:**

```ts
export interface ItemsPage {
  items: Item[];
  nextCursor: number | null;   // offset of next page, or null at the end
  prevCursor: number | null;
  total: number;
}
```

Cursor-based pagination via `slice(start, start + size)`. `nextCursor = start + size < len ? start + size : null`.
Query params: `cursor`, `limit` (capped at 100), `q`, `sort`, `category`, plus **fault-injection**
knobs `flaky` (probability of a 500) and `delay`. `Cache-Control: no-store`.

Building the `{ items, nextCursor, prevCursor }` shape here in Phase 2 is what makes
`useInfiniteQuery` a drop-in later — `getNextPageParam: (last) => last.nextCursor` just reads it.

- **`api/items/[id].ts`** — single-item lookup, 404 on miss.
- **`api/offers.ts`** — POST, ~600ms delay, **30% chance of 409** (`Offer rejected`). The
  failures are deliberate so rollback (Phase 10) is actually exercised.
- **`api/stream.ts`** — SSE, emits `{ id, priceCents, at }` for a random item every ~600–900ms.

---

## 5. React Query: provider, fetcher, key factory

**Commits `7072123`, `d8055a2`.**

**`src/lib/queryClient.ts` — factory, not a module singleton:**

```ts
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: 2, refetchOnWindowFocus: false },
    },
  });
}
```

**`_app.tsx` wires it with `useState`, NOT a module-level singleton:**

```tsx
const [queryClient] = useState(() => makeQueryClient());
```

**Why (say this verbatim):** a module-level `const client = makeQueryClient()` is instantiated
**once per server process, shared across all requests** — so one user's cached data can leak
into another user's SSR response. `useState`'s lazy initialiser runs once per component
instance (once per request on the server, once on the client), so it's safe in both.

**`src/api/queryKeys.ts` — key factory** (reads as senior):

```ts
export const itemKeys = {
  all: ["items"] as const,
  lists: (f: ItemFilters) => [...itemKeys.all, "list", f] as const,
  detail: (id: string) => [...itemKeys.all, "detail", id] as const,
};
```

**Invalidation granularity** is the payoff: `invalidateQueries({ queryKey: itemKeys.all })`
nukes every list *and* detail; `itemKeys.lists(filters)` is surgical. React Query matches by
**key prefix**, so `["items","list"]` matches all lists regardless of the filter object.

**`src/api/items.ts` — typed fetcher passing `signal`:**

```ts
export async function fetchItems(params: ItemFilters, signal?: AbortSignal): Promise<ItemsPage> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  // ...
  const res = await fetch(`/api/items?${search}`, { signal });
  if (!res.ok) throw new Error(`fetchItems failed: ${res.status}`);
  return res.json();
}
```

**The `refactor` (`d8055a2`) is a real lesson:** `fetchItems`/`itemKeys` first lived under
`src/pages/api/`. Anything there is a **server route module** — importing it into a client
component bundles server-only code (the mock generator, Next request/response types) into the
browser, and a file in `pages/api` with no default export is an invalid route. Client
data-fetching code lives in `src/api/`; only `import type { ItemsPage }` crosses back (erased
at compile time, nothing bundled).

---

## 6. The naive baseline & measuring performance

**Commit `03361e5`.** Fetch `limit=5000` in one shot, `.map` every item into a MUI `<Card>`.
No memo, no virtualization. **On purpose.** You need the baseline to prove the optimisation.

**Measured, not guessed** (say *"I'd measure before optimising"* — and mean it):

| Tool | What it showed |
|------|----------------|
| React `<Profiler>` `onRender` | keystroke commits **~900ms–1,490ms** under 6× CPU throttle |
| Chrome Performance, 6× throttle | ~4s **Long Task** on mount (page frozen, no input) |
| Core Web Vitals overlay | **INP 3,640ms** ("poor" is >500ms — 7× over) |
| No throttle | ~5–100ms/commit (dev machines lie; always throttle) |

Key insight from the Performance panel: ~50% of main-thread time was **"System"** (image
decode / layout), not "Scripting". So `React.memo` alone can't fix half the cost — that's
what virtualization (capping DOM nodes) addresses.

**Gotcha:** the React DevTools Profiler *extension* itself crashes/hangs on a 5k unmemoized
tree ("Cannot remove node…"). Use React's `<Profiler>` API (`onRender` → console) instead —
no fragile extension bridge.

---

## 7. Memoization & where it fails

**Commit `179b8be`.** Done in sub-steps so each lesson lands:

**7a — `React.memo` alone barely helps.** Because the parent passed `onSelect={() => ...}`
and `sx={{ ... }}` **inline** — new references every render — so memo's shallow prop compare
sees "changed" on every card, every keystroke. *This is the single most common wrong answer
to "make it fast."*

**7b — stabilise the props:**
- `useCallback` the handler.
- **Hoist `sx` to module scope**: `const cardSx = { ... } as const;` (same reference forever).
- Prefer primitives over objects where you can (primitives compare by value).

```tsx
const cardSx = { cursor: "pointer", height: "100%", display: "flex", flexDirection: "column" } as const;
export const ItemCard = memo(function ItemCard({ item, onSelect }: ItemCardProps) { /* ... */ });
```

**7c — custom `memo` comparator = usually a smell.** Hardcoding `(prev, next) => prev.item.id === next.item.id`
silently swallows other field changes (stale UI, no error). It's re-implementing by hand what
stable props give you free. Reach for it only when you've proven you can't stabilise props.

**7d — context re-render fan-out.** Put filters in context, subscribe `ItemCard` to it, and
**every card re-renders on each keystroke — even memoized ones**, because context propagation
**bypasses `memo` entirely** (`memo` guards props, not context). The value `{ q, setQ }` is a
new object literal each provider render, so all consumers re-render.

Fixes, in order of correctness for *this* case:
1. **Best here:** `ItemCard` shouldn't consume filters at all — narrow what it subscribes to.
2. **Split State/Dispatch contexts** — components that only *dispatch* (`setQ` is referentially
   stable from `useState`) never re-render on value change.
3. The Zustand line: *"Zustand lets components subscribe to a slice via a selector, so only
   the components whose slice changed re-render; context has no selector, so any value change
   re-renders every consumer. That selector mechanism is `useSyncExternalStore` under the hood."*

---

## 8. Virtualization (hand-rolled → TanStack)

**Commit `5cac10f` — `src/hooks/useVirtualList.ts` (write this from memory; ~40 lines).**

```ts
function useVirtualList<T>({ items, rowHeight, overscan = 5, containerRef }): {
  virtualItems: { index: number; item: T; offsetTop: number }[];
  totalHeight: number;
}
```

Core maths:
```
startIndex = max(0, floor(scrollTop / rowHeight) - overscan)
endIndex   = min(len - 1, ceil((scrollTop + viewportHeight) / rowHeight) + overscan)
offsetTop  = index * rowHeight
totalHeight = len * rowHeight
```
Render: an outer spacer `Box` of `totalHeight`, rows `position:absolute; transform: translateY(offsetTop)`.

**The rAF-throttled scroll listener — with the bug to avoid:**
```ts
const tickingRef = useRef(false);            // MUST be a ref (persists across events, no re-render)
const handleScroll = () => {
  if (tickingRef.current) return;            // a frame is already scheduled — coalesce
  tickingRef.current = true;
  requestAnimationFrame(() => {
    if (containerRef.current) setScrollTop(containerRef.current.scrollTop);
    tickingRef.current = false;
  });
};
```
- **`ticking` in a `ref`, not `let` inside the handler** — a local `let` resets every call and
  can never remember "a frame is pending" (the original bug).
- **rAF, not `setTimeout`** — one update per *paint*, synced to the browser, no matter how many
  scroll events fire between frames.

**`overscan`** = extra rows rendered just outside the viewport (both edges), so a fast scroll
doesn't flash blank before React paints. Clamped by `max`/`min`, so it's **asymmetric at the
ends** (0 above at the top, 0 below at the bottom).

**The mount-order bug (worth knowing):** the ref-attach effect runs once. If you conditionally
render the scroll container (`if (isLoading) return <Spinner/>`), the container isn't in the
DOM on that first run, so the listener never attaches and it silently never scrolls. **Mount
the container unconditionally; put loading/error UI *inside* it.**

Virtualization gotchas (name them, don't all build them):
- **Ctrl+F / browser find breaks** — off-screen rows aren't in the DOM. Mitigation: a
  "load all for print/search" escape hatch.
- **Anchor links / `scrollIntoView`** need index→offset maths, not DOM queries.
- **Variable heights** need a measurement cache (`ResizeObserver` + prefix-sum offsets).
- **a11y:** `role="grid"` / `aria-rowcount` so screen readers know the true size.

**Commit `500d07e` — swap to `@tanstack/react-virtual` (`useVirtualizer`).** Differences worth
explaining:
- `transform: translateY(...)` **not** `top` — transform is GPU-composited, skips layout.
- `ref={rowVirtualizer.measureElement}` + `data-index` — `ResizeObserver`-based auto-correction
  for variable heights (the cache you didn't hand-build).
- `getScrollElement` + internal rAF-throttled scroll tracking replaces your manual listener.
- **Bug hit:** `transform: translate(x)` (single arg = X-axis only) instead of `translateY`
  turned the list into a horizontal strip. One-char class of bug.

Interview line: *"I'd ship TanStack Virtual, but here's the windowing maths underneath."*

---

## 9. Infinite scroll

**Commit `ea69a01`.**

**`src/hooks/useIntersectionObserver.tsx` — with the latest-ref fix:**
```tsx
export function useIntersectionObserver(ref, cb, opts = {}) {
  const { enabled = true, ...observerOptions } = opts;
  const cbRef = useRef(cb);
  useEffect(() => { cbRef.current = cb; }, [cb]);           // cheap: keeps cb fresh, no observer churn
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current; if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) cbRef.current();             // call latest cb, never a stale closure
    }, observerOptions);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, enabled]);                                        // observer lifecycle decoupled from cb identity
}
```
**The trap & fix (same class as the stale-closure interview Q):** if `cb` isn't in deps, the
observer captures the first-render `cb` forever (stale). If `cb` *is* in deps, the observer is
torn down/rebuilt every render (churn). The **latest-ref pattern** gives both: fresh `cb`
(cheap effect updates the ref) *and* a stable observer (only re-created on `ref`/`enabled`).

**`useInfiniteQuery`:**
```ts
useInfiniteQuery({
  queryKey: itemKeys.lists({ q: debouncedQuery, limit: PAGE_SIZE }),
  queryFn: ({ pageParam, signal }) => fetchItems({ q: debouncedQuery, limit: PAGE_SIZE, cursor: pageParam }, signal),
  initialPageParam: 0,
  getNextPageParam: (last) => last.nextCursor,
  getPreviousPageParam: (first) => first.prevCursor,
});
```
- `data` is now `{ pages: ItemsPage[], pageParams }`, **not** `{ items }`.
- Flatten: `const items = useMemo(() => data?.pages.flatMap(p => p.items) ?? [], [data]);`
  — memoized so `items` keeps a stable reference when `data` hasn't changed (it feeds the
  virtualizer `count` and every row lookup).

**Virtualization × infinite scroll interfere — the key detail:** a sentinel `<div>` after the
last row only works in a *non-virtualized* list (it's mounted). When windowed, that element is
unmounted almost always, so the observer never fires. Trigger off the **virtualizer's own last
index** instead:
```ts
useEffect(() => {
  const lastRow = virtualRows[virtualRows.length - 1];
  if (lastRow && lastRow.index >= items.length - 1 - PREFETCH_THRESHOLD && hasNextPage && !isFetchingNextPage) {
    fetchNextPage();
  }
}, [virtualRows, items.length, hasNextPage, isFetchingNextPage, fetchNextPage]);
```
`virtualRows` is a new array reference each scroll → the effect re-runs on scroll. The
`hasNextPage && !isFetchingNextPage` guard prevents double-fetching. `useIntersectionObserver`
was still built (generically useful) but isn't the tool for *this* page — say that out loud.

**Search moved server-side** (`q` into `fetchItems`, not a client `.filter`): filtering an
already-paginated partial dataset client-side hides matches on unfetched pages.

**Aside (`6c164b3`) `/simple-infinite`:** the textbook `useInfiniteQuery` + sentinel + observer
(via `react-intersection-observer`'s `useInView`) — works precisely because it's *not*
virtualized. The contrast table:

| | Simple | Marketplace |
|---|---|---|
| DOM nodes | grows unbounded | capped ~15-20 |
| Trigger | sentinel + IntersectionObserver | virtualizer last-index |
| Good for | short lists | large lists |
| At 5000 items | dies (Phase 4 problem) | fine |

---

## 10. Scroll restoration

**Commit `59a66ed`.** The phase to nail — separate the **two problems** out loud:

**Problem A — the data.** On back-nav, are the loaded pages still there?
- **Warm cache:** yes, if `gcTime` outlives the detour. Component remounts, reads cache,
  renders all pages synchronously, no network. Set `gcTime: 10 * 60_000` + high `staleTime`
  so it doesn't refetch-and-flicker.
- **Cold cache (hard refresh / deep link):** rehydrate to depth. Persist `pageCount` in
  `sessionStorage`; refetch **one** `limit = PAGE_SIZE * pageCount` request (not N sequential
  calls) and seed the cache. `pageCount` must be derived from `Math.ceil(items.length / PAGE_SIZE)`,
  **not** `data.pages.length` (after a combined rehydration that's `1`).

**Problem B — the scroll position.** Separate; you can have the right data and still land at 0.
- `next.config` `experimental.scrollRestoration` fires *before* async data lands → lands at 0.
- Persist `{ pageCount, index, offset }` keyed by `router.asPath` on `routeChangeStart`.
  `offset = container.scrollTop - virtualRows[0].start`.
- Because rows are **fixed-height** here, restore is exact and simple:
  `scrollTop = index * ROW_HEIGHT + offset`. (Variable heights would need item-id anchoring +
  `getBoundingClientRect`, re-scrolling after measurement settles.)
- `history.scrollRestoration = "manual"` (in `_app`) so the browser doesn't fight you.

**The deep bug — and the biggest single lesson of the project.** Writing `container.scrollTop`
from an effect kept getting **reset to 0** ~a beat later. Reading `@tanstack/virtual-core`
source revealed why: the virtualizer keeps its **own** `scrollOffset` (default `initialOffset:
0`) and, when its scroll element attaches on mount (`_willUpdate`), it force-writes
`element.scrollTop = getScrollOffset()` — i.e. `0` — clobbering any imperative write, as part
of *its* update cycle which runs after your effect.

**The fix — feed the library, don't fight it:** compute the saved offset **synchronously before
the virtualizer mounts** and pass it as `initialOffset`, so react-virtual's own restore targets
the saved position:
```tsx
const initialOffsetRef = useRef<number | null>(null);
if (initialOffsetRef.current === null) {
  // read sessionStorage synchronously, compute index*ROW_HEIGHT + offset
}
const rowVirtualizer = useVirtualizer({ /* ... */, initialOffset: initialOffsetRef.current });
```

> **Generalisable lesson:** when your write is silently undone shortly after, *something else
> owns that state* (a controlled component, a virtualizer, a form lib, a router). The fix is
> never a bigger hammer (`setTimeout`, retry loops); it's finding the owner's input
> (`initialOffset`, `value`/`onChange`, `defaultValue`). And: **read `node_modules` when
> behaviour contradicts your model** — theorising about internals produced plausible-but-wrong
> fixes; the source gave the answer in minutes.

**The eviction question (know the better answer):** don't evict *data*, evict *DOM nodes*.
60 items of JSON is trivial; the cost is 60 mounted components with images — virtualization
caps that at ~20 regardless of depth, so back-nav is free and you keep all data. Evict-and-
refetch is only right for genuinely unbounded feeds (a social timeline scrolled for an hour) —
and **TanStack Query v5 `maxPages`** is built for exactly that: drops pages from the opposite
end, requires `getPreviousPageParam` to fetch them back on reverse scroll. Naming `maxPages`
lands.

---

## 11. Debounced search, races, URL sync

**Commit `b6aaf57`.**

**`useDebounceValue` (write from scratch — appears constantly in interviews):**
```tsx
export function useDebounceValue<T>(value: T, delay = 500): T {
  const [val, setVal] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setVal(value), delay);
    return () => clearTimeout(t);           // the cleanup IS the debounce: each change cancels the pending update
  }, [value, delay]);
  return val;
}
```

**The input/query split (the subtle part people get wrong):** bind the `TextField` to the
**instant** `q` (typing feels responsive), but put the **debounced** value in the query key.
Bind the input to the debounced value → laggy typing. Query the instant value → no debounce.

**Race conditions are already handled by the key + `signal`:** debounced term → new query key
→ React Query **aborts the superseded request** via the `signal` you pass to `fetch`. That
kills the classic "slow response for 'a' lands after fast 'abc'" bug for free. *This is why you
pass `signal`.*

**`placeholderData: keepPreviousData`** — keeps old results visible (marked stale) instead of
flashing a spinner on every keystroke. Pair with `isPlaceholderData` to dim the grid
(`opacity: isPlaceholderData ? 0.5 : 1`) — honest staleness.

**Manual race fix (know it for a fundamentals probe):**
```ts
useEffect(() => {
  let ignore = false;
  fetchSomething(term).then((res) => { if (!ignore) setState(res); });
  return () => { ignore = true; };          // doesn't cancel the request, makes the stale response harmless
}, [term]);
```
*"React Query's `signal` actually aborts; this `ignore` flag just discards the stale result.
Same bug class as the observer stale-closure."*

**URL-synced filters** — `router.replace({ query: { q } }, undefined, { shallow: true })`:
- **`replace` not `push`** — otherwise every debounced keystroke is a history entry (Back walks
  char-by-char). `replace` keeps it shareable without polluting history.
- **`shallow: true`** — updates the URL without re-running `getServerSideProps` (no server
  round-trip just to reflect a param). Pages-router-specific.
- Two effects with **ordering guards**: hydrate-from-URL once (`router.isReady` gate +
  `didHydrateFromUrl` ref), then mirror-to-URL (skips until hydration ran, so it can't clobber
  the URL before reading it; skips if unchanged to avoid loops).

Design axis to name: **URL as source of truth (#1)** vs **context source, URL mirror (#2)**.
#1 buys in-page Back-button filter restore, at the cost of re-seeding the input on every URL
change (+ a typing guard). #2 (what we shipped) is simpler and covers shareable links. *Say
both and the tradeoff.*

---

## 12. Optimistic mutations & rollback

**Commit `ff8e7c7` — `src/hooks/useMakeOffer.ts`.** The four-callback lifecycle:

```ts
useMutation({
  mutationFn: postOffer,
  onMutate: async ({ itemId, amountCents }) => {
    await queryClient.cancelQueries({ queryKey: itemKeys.detail(itemId) });   // 1
    await queryClient.cancelQueries({ queryKey: LIST_KEY });
    const previousDetail = queryClient.getQueryData(itemKeys.detail(itemId)); // 2 snapshot
    const previousLists  = queryClient.getQueriesData({ queryKey: LIST_KEY });
    queryClient.setQueryData(itemKeys.detail(itemId), (old) => old && { ...old, priceCents: amountCents }); // 3a
    queryClient.setQueriesData({ queryKey: LIST_KEY }, (old) => old && {     // 3b walk the pages
      ...old,
      pages: old.pages.map((p) => ({ ...p, items: p.items.map((i) => i.id === itemId ? { ...i, priceCents: amountCents } : i) })),
    });
    return { previousDetail, previousLists };                                 // 4 context for rollback
  },
  onError: (_e, { itemId }, ctx) => {
    if (ctx?.previousDetail) queryClient.setQueryData(itemKeys.detail(itemId), ctx.previousDetail);
    ctx?.previousLists?.forEach(([key, data]) => queryClient.setQueryData(key, data));
  },
  onSettled: (_d, _e, { itemId }) => {
    queryClient.invalidateQueries({ queryKey: itemKeys.detail(itemId) });     // reconcile against server truth
    queryClient.invalidateQueries({ queryKey: LIST_KEY });
  },
});
```

- **`cancelQueries` is the line everyone forgets** — without it, a GET already in flight can
  land *after* your optimistic write and clobber it. Know why it's there.
- **Snapshot → return as `context` → restore in `onError`** is the rollback mechanism.
- **`onSettled` invalidates on success *and* failure** — reconciles the optimistic guess against
  real server state.
- **Walking the infinite-list cache** (`setQueriesData` + `pages.map` + `items.map`) is the
  fiddly, realistic bit — immutable spread at every level you touch; new object only for the
  matching item (so memoized cards elsewhere don't re-render).

**Observed behaviour worth understanding:** an *accepted* offer updated the price then reverted
after ~1s. That's `onSettled`'s invalidation refetching and reconciling against a **stateless
mock** that never persisted the offer — the revert is the safety net working correctly. Fixed
by persisting to the in-memory `ALL_ITEMS` in the offers endpoint (dev-only; real apps have a
DB). *"In production the server persists, the refetch returns the new value, it sticks."*

---

## 13. Realtime (SSE) into the cache

**Commit `744013e` — `src/hooks/useLivePrices.tsx`.** Five design decisions, each a
"real-time data integrity" talking point:

1. **Patch, don't invalidate** (steady state). Writing prices straight into the cache = zero
   network per tick. Invalidating per event would trigger a refetch storm — *DDoS your own API*.
2. **Batch.** Buffer events in a `useRef` `Map` (keyed by id → collapses bursts to latest),
   flush every **250ms** in one `setQueriesData` pass → **one render per frame**, not per message.
3. **Drop out-of-order events.** A `lastAtRef` per-id timestamp; `if (tick.at < lastAt) return`.
   A newer price must never be overwritten by a straggler.
4. **Invalidate only on reconnect.** `onopen`-after-a-prior-connect means you missed events in
   the gap → resync (`invalidateQueries`). The *only* place invalidation appears.
5. **Reference-stable updates.** The list updater returns the **same reference** for unchanged
   items and unchanged lists (via `changed`/`pageChanged` flags), so React Query skips notifying
   and `React.memo` skips re-rendering — only cards whose price actually ticked re-render.

```ts
const flush = setInterval(() => {
  if (bufferRef.current.size === 0) return;
  const batch = bufferRef.current; bufferRef.current = new Map();
  queryClient.setQueriesData({ queryKey: LIST_KEY }, (old) => {
    if (!old) return old;
    let changed = false;
    const pages = old.pages.map((page) => {
      let pageChanged = false;
      const items = page.items.map((i) => {
        const tick = batch.get(i.id);
        if (!tick) return i;                     // SAME reference — no re-render
        pageChanged = true; changed = true;
        return { ...i, priceCents: tick.priceCents };
      });
      return pageChanged ? { ...page, items } : page;
    });
    return changed ? { ...old, pages } : old;    // SAME reference if this list untouched
  });
  // + setQueryData for open detail caches
}, FLUSH_MS);
```

- **SSE ≠ WebSocket.** `EventSource` shows under **Fetch/XHR / EventStream** in devtools, never
  "Socket" (that's Next's HMR websocket). EventSource auto-reconnects; you react in `onopen`.
- `ItemCard` flashes green/red on price change (compare-to-prev via a ref + a 700ms timeout) —
  visible proof that *only* changed cards re-render.
- Not built (single global mock stream), but say it: *"with real Pusher/WS I'd subscribe only to
  the item IDs in the current virtual window and unsubscribe as they scroll off."*

---

## 14. React footguns

**Commit `7de967b` — `src/pages/demos.tsx`.** Three isolated bugs + fixes:

**Stale closure** — `setInterval(() => setCount(count + 1), 1000)` with `[]` deps freezes at 1
(the interval closed over `count = 0` forever). **Three fixes, know when each is right:**
- **functional updater** `setCount(c => c + 1)` — when you only *write*. Keeps ONE stable
  interval. Correct here.
- **add to deps** — when the effect must genuinely re-run with fresh values. Here it needlessly
  tears down + recreates the interval every tick.
- **latest-ref** — read fresh values inside a long-lived subscription (the observer pattern).

> Gotcha caught in review: doing functional-updater **and** `[count]` deps *both* works but
> recreates the interval every second — redundant. For a timer, functional updater + `[]`.

**Zombie child** — select a user, delete it; `selected` is `undefined`, child reads `user.name`
→ crash (the `user={selected!}` `!` is the lie). Fix: guard (`{selected && <Detail/>}` or
`if (!user) return null`). Structural fix: child looks up by id from a source that tolerates
absence, rather than being handed a maybe-dead object/positional index.

**Torn reads / `useSyncExternalStore`** — subscribing to an external store with
`useState + useEffect` can **miss updates in the gap between render and the effect subscribing**,
and reads stale under concurrent rendering. Fix:
```tsx
const value = useSyncExternalStore(store.subscribe, store.getSnapshot);
```
No gap (subscribes as part of the same commit), concurrent-safe, less code. **This is the
primitive Zustand/Nanostores are built on** (plus a selector layer). Gotcha: `getSnapshot` must
return a **stable reference** for unchanged state (returning a fresh object each call → infinite
loop; use a selector/memo).

---

## 15. Testing (RTL + MSW)

**Commit `99f48b0`.** *Don't over-invest, but have the setup as muscle memory.*

**`renderWithProviders`** — fresh `QueryClient` **per render** (shared client leaks cache →
flaky, order-dependent) with **`retry: false`** (otherwise a mocked 500 takes seconds through
3 retries) + `ThemeProvider`.

**MSW** — `setupServer(...handlers)`, lifecycle in `vitest.setup.ts`: `listen({ onUnhandledRequest: "error" })`
/ `resetHandlers()` after each / `close()`. Per-test overrides via `server.use(http.get(...))`.

> **The one real gotcha:** `fetchItems` calls `fetch("/api/items")` — a *relative* URL. Node's
> fetch (undici, under jsdom) throws on relative URLs. A shim in setup prepends
> `http://localhost`, installed **after** `server.listen()` so it wraps MSW's fetch rather than
> being bypassed.

**Query priority (they *will* notice):**
`getByRole` > `getByLabelText` > `getByPlaceholderText` > `getByText` > `getByDisplayValue` >
… `getByTestId` (last resort). Use **`findBy*`** for async — never `waitFor(() => getBy...)`
when `findBy` will do. Use **`queryBy*`** to assert *absence* (`getBy*` throws on missing).

Covered: `ItemCard` (renders name, formats `41614`→`$416.14`, fires `onSelect` with the id via
`userEvent`), `useDebounceValue` (`vi.useFakeTimers()` + `act`, asserts intermediate values are
skipped), list states (spinner → items → error on a 500). List test uses a small harness (jsdom
has no layout → the real virtualizer renders 0 rows; in a real app you'd extract a presentational
list and test that).

---

## 16. Core Web Vitals

| Metric | Measures | Good | Poor | Note |
|--------|----------|------|------|------|
| **LCP** (Largest Contentful Paint) | time to largest element painted | ≤2.5s | >4s | finalises on first interaction; can read "—" on an idle page |
| **CLS** (Cumulative Layout Shift) | unexpected layout jank | ≤0.1 | >0.25 | ours was **0** — fixed `CardMedia height={220}` reserves space, no reflow when images load |
| **INP** (Interaction to Next Paint) | worst interaction→paint | ≤200ms | >500ms | replaced **FID** (Mar 2024); measures the *full* round trip incl. re-render, so heavy renders tank it. Our naive baseline: **3,640ms** |

Why it matters for senior FE: it's the **lab-vs-field** bridge (your throttled Profiler numbers
= lab; CrUX p75 on real hardware = field — they can disagree), an SEO/ranking signal (loops back
to *"is this behind auth or public?"*), and knowing INP replaced FID signals current knowledge.

---

## 17. Anti-patterns avoided (cheat sheet)

| Anti-pattern | Why it's wrong | What we did |
|---|---|---|
| Module-level `QueryClient` | leaks one user's cache into another's SSR | `useState(() => makeQueryClient())` |
| Client fetcher in `pages/api/*` | bundles server-only code into the browser | moved to `src/api/` |
| Inline `onSelect`/`sx` with `React.memo` | new refs every render → memo useless | `useCallback` + module-scope `cardSx` |
| Custom `memo` comparator | silently swallows field changes → stale UI | stabilise props instead |
| Component reads context it doesn't need | context bypasses `memo`, re-renders all consumers | narrow the subscription |
| `let ticking` inside a scroll handler | resets each call, can't throttle | `useRef` |
| `setTimeout` scroll throttle | not synced to paint | `requestAnimationFrame` |
| Conditionally unmounting the scroll container | ref-attach effect never runs, listener never attaches | mount unconditionally, spinner inside |
| Sentinel + observer on a virtualized list | sentinel unmounted → never fires | trigger off virtualizer last index |
| Client-side filtering a paginated list | hides matches on unfetched pages | search server-side via query key |
| Imperative `scrollTop` vs a library that owns scroll | library resyncs to its own offset, clobbers you | feed it `initialOffset` |
| `pageCount = data.pages.length` after rehydration | combined page → always 1 → under-fetch | `ceil(items.length / PAGE_SIZE)` |
| Binding input to the debounced value | laggy typing | input = instant `q`, query = debounced |
| `router.push` for search sync | every keystroke = a history entry | `router.replace` + `shallow` |
| Omitting `cancelQueries` in `onMutate` | in-flight GET clobbers the optimistic write | cancel first |
| `invalidateQueries` per SSE event | refetch storm / self-DDoS | patch cache, invalidate only on reconnect |
| Stale closure in `setInterval`/observer | captures first-render value | functional updater / latest-ref |
| Reading a maybe-deleted item unguarded | `undefined.x` crash (zombie child) | guard / lookup-by-id |
| `useState`+`useEffect` for external store | torn reads in the render→effect gap | `useSyncExternalStore` |
| Shared `QueryClient` / retries on in tests | flaky, slow error tests | fresh client, `retry: false` |
| `waitFor(() => getBy...)` | worse errors than the built-in wait | `findBy*` |

---

## 18. Interview meta-skills

- **Say your plan before typing:** *"types first, a dumb version that renders, then optimise
  once we can see it working."* (Phases 4→5→6 literally.)
- **Ask the three scoping questions** (signal marketplace experience):
  1. Is this list bounded or could it be 100k?  → virtualization / `maxPages`
  2. Do items mutate while on screen?  → optimistic updates + realtime cache patching
  3. Is SEO relevant or is it behind auth?  → LCP/CLS ranking vs. INP-only concern
- **Ship ugly, then refine:** *"this re-renders everything on keystroke; I'll fix it once
  behaviour is right."*
- **When you don't know:** say what you'd check. *"I'd verify whether MUI v9's `sx` memoises on
  the serialised object before relying on it."*
- **Have a question for them:** their **React 19 / app-router migration** — route-by-route with
  pages/app interop? blockers (MUI's RSC story, Emotion needing `'use client'`)? You touched
  Emotion SSR + pages router here, so it's a real conversation.
- **The strongest single story:** the Phase 8 scroll bug — read `virtual-core` source, found
  the virtualizer clobbers imperative `scrollTop` with its own `scrollOffset`, fixed via
  `initialOffset` instead of fighting it. *"When a library owns state, find its API instead of
  hammering it."* That instinct separates senior from mid.

---

## 19. Typing drills

From a blank file, 5 min each, no autocomplete. You've written most of these here — rewrite
cold until fast:

1. `useDebouncedValue`
2. `usePrevious`
3. `useIntersectionObserver` (latest-ref)
4. `useEventListener` (cleanup + latest-ref)
5. `useFetch` with `AbortController` + a loading/error/data reducer
6. `groupBy<T, K extends string>(items: T[], keyFn: (t: T) => K): Record<K, T[]>`
7. `React.memo` + `useCallback` + `useMemo` on a small list — full file
8. A discriminated union for request state + an exhaustive `switch` with a `never` check:
   ```ts
   type State<T> = { status: "idle" } | { status: "loading" } | { status: "success"; data: T } | { status: "error"; error: Error };
   function assertNever(x: never): never { throw new Error(`unexpected: ${x}`); }
   ```

---

*Every code reference above corresponds to a real commit on `main` — `git show <hash>` for the
full diff.*
