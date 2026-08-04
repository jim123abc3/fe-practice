# Senior FE Patterns — React · TypeScript · JavaScript

A broad reference of the syntax, patterns, and concepts that come up in senior
frontend interviews and daily work. Skim to refresh; each snippet has a one-line
"why / when."

---

## Part 1 — TypeScript

### Utility types (know these cold)

```ts
type User = { id: string; name: string; email: string; age: number };

Partial<User>            // all props optional
Required<User>           // all props required
Readonly<User>           // all props readonly
Pick<User, "id" | "name">        // subset
Omit<User, "email">              // everything except
Record<string, User>             // dictionary { [k: string]: User }
Exclude<"a" | "b" | "c", "a">    // "b" | "c"
Extract<"a" | "b", "a" | "z">    // "a"
NonNullable<string | null>       // string
ReturnType<typeof fn>            // the return type of fn
Parameters<typeof fn>            // [argTypes] as a tuple
Awaited<Promise<User>>           // User (unwraps promises)
```

### Generics

```ts
// Constrain a generic with extends; infer the return via keyof + indexed access
function prop<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}
prop({ a: 1, b: "x" }, "b");   // typed as string

// Default type params
type ApiResponse<T = unknown> = { data: T; status: number };
```

### Discriminated unions + exhaustive `never` check

```ts
type RequestState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error };

function render(state: RequestState<string>) {
  switch (state.status) {
    case "idle": return "…";
    case "loading": return "Loading";
    case "success": return state.data;      // TS narrows: data exists here
    case "error": return state.error.message;
    default: return assertNever(state);      // compile error if a case is missing
  }
}
function assertNever(x: never): never { throw new Error(`Unhandled: ${JSON.stringify(x)}`); }
```

The `never` default is the trick: add a new variant, forget a case, and the
compiler *fails the build* because the new type isn't assignable to `never`.

### Type guards & narrowing

```ts
typeof x === "string"                 // primitives
x instanceof Date                     // class instances
"role" in obj                         // property presence
Array.isArray(x)

// custom type guard — the `x is T` return type
function isUser(x: unknown): x is User {
  return typeof x === "object" && x !== null && "email" in x;
}

// assertion function — narrows AND throws
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
```

### `as const`, `satisfies`, `unknown` vs `any`

```ts
const ROUTES = ["home", "about"] as const;   // readonly ["home","about"], literal types
type Route = (typeof ROUTES)[number];        // "home" | "about"

// satisfies: check a value matches a type WITHOUT widening it
const config = { port: 3000, host: "localhost" } satisfies Record<string, string | number>;
config.port; // still number, not string | number

// unknown = "typed any" — must narrow before use (safe). any = escape hatch (unsafe).
```

### Mapped, conditional, template-literal types

```ts
// mapped: transform every key
type Nullable<T> = { [K in keyof T]: T[K] | null };
type Getters<T> = { [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K] };

// conditional: type-level if/else with infer
type ElementType<T> = T extends (infer U)[] ? U : never;
type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

// template literal types
type Event = `on${Capitalize<"click" | "hover">}`;   // "onClick" | "onHover"
```

### Function overloads

```ts
function parse(x: string): object;
function parse(x: number): string;
function parse(x: string | number): object | string {
  return typeof x === "string" ? JSON.parse(x) : String(x);
}
```

---

## Part 2 — React

### Effects: `useEffect` vs `useLayoutEffect`, and cleanup

```ts
useEffect(() => { /* after paint — data fetching, subscriptions */ }, [dep]);
useLayoutEffect(() => { /* before paint — measure/mutate DOM to avoid flicker */ }, [dep]);

// Cleanup runs before the next effect AND on unmount
useEffect(() => {
  const sub = source.subscribe();
  return () => sub.unsubscribe();     // ALWAYS clean up subscriptions/timers/listeners
}, []);
```

Rule: `[]` = mount only; `[a]` = when `a` changes; no array = every render.
Missing deps → stale closures (see below).

### The essential ref patterns

```ts
// 1. Latest ref — read fresh values inside a long-lived callback (kills stale closures)
const cbRef = useRef(cb);
useEffect(() => { cbRef.current = cb; }, [cb]);   // cheap update, no re-subscribe
// inside a subscription: cbRef.current()

// 2. Previous value
function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => { ref.current = value; }, [value]);
  return ref.current;   // returns the value from the PREVIOUS render
}

// 3. Instance variable that shouldn't trigger re-renders
const renderCount = useRef(0);
renderCount.current++;
```

### `useMemo` / `useCallback` — when (not always)

```ts
// useMemo: cache an expensive computation OR a stable object/array reference
const sorted = useMemo(() => items.slice().sort(cmp), [items]);

// useCallback: stable function identity — matters when passed to a memoized child
const handleSelect = useCallback((id: string) => { /* … */ }, []);
```

Don't wrap everything — memoization has its own cost. Reach for it when: (a) the
value feeds a `React.memo` child's props, (b) it's a dependency of another hook,
or (c) the computation is genuinely expensive.

### `useReducer` — complex/related state

```ts
type Action = { type: "increment" } | { type: "set"; value: number };
function reducer(state: number, action: Action): number {
  switch (action.type) {
    case "increment": return state + 1;
    case "set": return action.value;
  }
}
const [count, dispatch] = useReducer(reducer, 0);
```

Prefer over multiple `useState` when updates are interdependent or the next
state depends on the previous in non-trivial ways.

### `useSyncExternalStore` — subscribe to external state safely

```ts
const value = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
```

The correct way to read a mutable external store (avoids "torn reads" in the
gap between render and effect). What Zustand/Nanostores use internally.
`getSnapshot` must return a **stable reference** for unchanged state.

### `useTransition` / `useDeferredValue` — keep the UI responsive

```ts
const [isPending, startTransition] = useTransition();
startTransition(() => setSearch(input));   // marks the update as low-priority/interruptible

const deferredQuery = useDeferredValue(query);  // lets urgent updates (typing) render first
```

### `useImperativeHandle` + `forwardRef` — expose an imperative API

```ts
const Input = forwardRef<{ focus: () => void }, Props>((props, ref) => {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));
  return <input ref={inputRef} />;
});
```

### Component patterns

```tsx
// Custom hook — extract stateful logic
function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  const toggle = useCallback(() => setOn((o) => !o), []);
  return [on, toggle] as const;
}

// Compound components — share implicit state via context
<Tabs><Tabs.List><Tabs.Tab/></Tabs.List><Tabs.Panel/></Tabs>

// Render props / children-as-function
<DataLoader>{(data) => <List items={data} />}</DataLoader>

// Provider pattern (+ split state/dispatch to limit re-renders)
const StateCtx = createContext(null);
const DispatchCtx = createContext(null);
```

### Error boundaries (must be a class)

```tsx
class ErrorBoundary extends React.Component<Props, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) { logError(error, info); }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}
```

Don't catch: event handlers, async code, SSR. Production: `react-error-boundary`.

### Keys, controlled vs uncontrolled, StrictMode

```tsx
{items.map((i) => <Row key={i.id} />)}   // stable unique key — NEVER the array index for dynamic lists

<input value={v} onChange={e => setV(e.target.value)} />  // controlled
<input defaultValue={v} ref={ref} />                       // uncontrolled

// StrictMode double-invokes effects/renders in dev to surface missing cleanup — not a bug.
```

---

## Part 3 — JavaScript

### `this` binding (the four rules)

```js
fn();              // default — undefined (strict) / global
obj.fn();          // implicit — `this` = obj
fn.call(ctx);      // explicit — `this` = ctx (also .apply, .bind)
new Fn();          // construction — `this` = the new instance
// Arrow functions: NO own `this` — lexically inherit from enclosing scope
```

### Closures & the stale-closure bug

```js
// Each iteration's callback closes over the SAME `var i` → logs 3,3,3
for (var i = 0; i < 3; i++) setTimeout(() => console.log(i));
// Fix: `let` (block-scoped, fresh binding per iteration) → 0,1,2
```

### Event loop — micro vs macro tasks

```js
console.log("A");
setTimeout(() => console.log("B"), 0);        // macrotask
Promise.resolve().then(() => console.log("C")); // microtask
console.log("D");
// Output: A, D, C, B
// Microtasks (promises) drain COMPLETELY before the next macrotask (timers).
```

### Immutability patterns

```js
const next = { ...obj, key: value };                 // shallow object update
const arr2 = [...arr, item];                         // append
const arr3 = arr.map((x) => (x.id === id ? { ...x, done: true } : x)); // update one
const arr4 = arr.filter((x) => x.id !== id);         // remove
const { removed, ...rest } = obj;                    // omit a key
```

### Destructuring, optional chaining, nullish

```js
const { a = 1, b: renamed, ...others } = obj;        // default, rename, rest
const [first, , third] = arr;                        // skip elements
obj?.a?.b?.();                                        // safe deep access + call
const val = input ?? "default";                      // ?? only for null/undefined (0 and "" pass)
```

### Map / Set / WeakMap

```js
const m = new Map();  m.set(objKey, 1);    // any key type, insertion order, .size
const s = new Set([1, 1, 2]);              // unique values; [...s] to array
const wm = new WeakMap();                   // keys weakly held → GC-friendly caches, no leaks
```

### Async patterns

```js
// Parallel (start together) vs sequential (await each)
const [a, b] = await Promise.all([fetchA(), fetchB()]);   // parallel — faster
const a2 = await fetchA(); const b2 = await fetchB();      // sequential — b waits on a

// Error handling
try { await risky(); } catch (e) { /* handle */ } finally { /* cleanup */ }

// AbortController — cancel fetch
const ctrl = new AbortController();
fetch(url, { signal: ctrl.signal });
ctrl.abort();
```

### Prototypes (the model behind classes)

```js
class Animal { speak() {} }        // Animal.prototype.speak
class Dog extends Animal {}        // Dog.prototype.__proto__ === Animal.prototype
// Property lookup walks the prototype chain: instance → proto → proto's proto → null
```

### Generators & iterators

```js
function* range(n) { for (let i = 0; i < n; i++) yield i; }
[...range(3)];                     // [0, 1, 2]
// Any object with [Symbol.iterator] is iterable (works with for…of, spread)
```

---

## Part 4 — cross-cutting concepts

- **Reconciliation & keys:** React diffs by type + key. Bad keys (index) cause
  state to attach to the wrong row when the list reorders.
- **Batching:** React 18 batches state updates (even in promises/timeouts) → one
  re-render per event.
- **Referential equality** drives almost everything: `memo`, effect deps,
  context value stability. New object/array literal each render = "changed."
- **Controlled data flow:** lift state up; pass data down via props, events up via
  callbacks. Context for cross-cutting state, but it re-renders all consumers.
- **Code splitting:** `const X = lazy(() => import("./X"))` + `<Suspense>` to defer
  loading non-critical chunks.
- **Accessibility:** prefer semantic elements + roles; interactive things must be
  focusable and keyboard-operable (`<button>`, not a clickable `<div>`).

---

## The senior tells (say these when relevant)

- "New reference every render" — the root cause behind most memo/effect issues.
- "Stale closure" — a callback captured an old value; fix with functional
  updater, correct deps, or the latest-ref pattern.
- "Lift state up / colocate state" — put state at the lowest common ancestor.
- "Server state vs UI state" — React Query owns server state; `useState`/reducer
  owns UI state. Don't duplicate server data into local state.
- "Measure before optimising" — profile, don't guess.
