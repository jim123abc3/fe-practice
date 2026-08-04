# Vanilla Implementations — classic FE interview functions

Implement-from-scratch questions that come up constantly. Each has the tricky
part called out. The three worth being able to **derive live**: `debounce`,
`Promise.all`, and `useState` (the last one explains the Rules of Hooks).

---

## 1. debounce — run fn only after `wait` ms of silence

```js
function debounce(fn, wait) {
  let timeout;
  // NOT an arrow — we want `this` to bind to whoever calls debounced()
  return function (...args) {
    clearTimeout(timeout);                     // cancel the pending run
    // arrow keeps the `this`/`args` from THIS invocation
    timeout = setTimeout(() => fn.apply(this, args), wait);
  };
}
```

The whole trick: `clearTimeout` on every call means only the **last** call in a
burst survives to fire. Preserving `this` + `args` is what separates a real
answer from a toy. Search inputs → debounce.

**Add a cancel + leading option (senior version):**

```js
function debounce(fn, wait, { leading = false } = {}) {
  let timeout;
  const debounced = function (...args) {
    const callNow = leading && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      timeout = null;
      if (!leading) fn.apply(this, args);
    }, wait);
    if (callNow) fn.apply(this, args);
  };
  debounced.cancel = () => { clearTimeout(timeout); timeout = null; };
  return debounced;
}
```

---

## 2. throttle — run fn at most once per `wait` ms

```js
function throttle(fn, wait) {
  let lastTime = 0;
  let timer = null;
  return function (...args) {
    const now = Date.now();
    const remaining = wait - (now - lastTime);
    const context = this;
    if (remaining <= 0) {
      // enough time passed → run now (leading edge)
      if (timer) { clearTimeout(timer); timer = null; }
      lastTime = now;
      fn.apply(context, args);
    } else if (!timer) {
      // schedule a trailing call so the LAST event in a burst isn't lost
      timer = setTimeout(() => {
        lastTime = Date.now();
        timer = null;
        fn.apply(context, args);
      }, remaining);
    }
  };
}
```

**debounce vs throttle:** debounce waits for quiet; throttle guarantees a steady
cadence. Scroll/resize/mousemove → throttle.

---

## 3. Promise.all — array of results in order; reject on first failure

```js
function promiseAll(items) {
  return new Promise((resolve, reject) => {
    const results = [];
    let remaining = items.length;
    if (remaining === 0) return resolve(results);   // empty → resolve immediately
    items.forEach((item, index) => {
      // Promise.resolve() so non-promise values ("just 5") work too
      Promise.resolve(item).then((value) => {
        results[index] = value;      // index, NOT push — preserves input order
        remaining--;                 // even though they finish out of order
        if (remaining === 0) resolve(results);
      }, reject);                    // first rejection rejects the whole thing
    });
  });
}
```

Two gotchas checked: `results[index]` preserves order regardless of finish
order; the empty-array case resolves (doesn't hang).

**Related — `Promise.race` / `any` / `allSettled`:**

```js
const race = (items) =>            // first to SETTLE (resolve OR reject) wins
  new Promise((res, rej) => items.forEach((p) => Promise.resolve(p).then(res, rej)));

const allSettled = (items) =>      // never rejects; reports each outcome
  Promise.all(items.map((p) =>
    Promise.resolve(p).then(
      (value) => ({ status: "fulfilled", value }),
      (reason) => ({ status: "rejected", reason }),
    )));
```

---

## 4. flatten — collapse a nested array

```js
function flatten(arr, depth = Infinity) {
  return depth > 0
    ? arr.reduce(
        (acc, val) =>
          acc.concat(Array.isArray(val) ? flatten(val, depth - 1) : val),
        [],
      )
    : arr.slice();   // depth exhausted → stop
}
```

**Iterative (stack) version — no recursion, avoids stack overflow on deep input:**

```js
function flattenIterative(arr) {
  const stack = [...arr];
  const result = [];
  while (stack.length) {
    const next = stack.pop();
    if (Array.isArray(next)) stack.push(...next);   // push items back
    else result.push(next);
  }
  return result.reverse();   // pop reverses order, so flip back
}
```

---

## 5. curry — f(a,b,c) → f(a)(b)(c) or f(a,b)(c) …

```js
function curry(fn) {
  return function curried(...args) {
    // fn.length = declared arity (number of params)
    if (args.length >= fn.length) return fn.apply(this, args);
    return (...next) => curried.apply(this, [...args, ...next]);
  };
}
// const add = curry((a, b, c) => a + b + c);
// add(1)(2)(3) === add(1, 2)(3) === add(1)(2, 3) === 6
```

The engine is `fn.length` (arity) driving "do I have enough args yet?".

---

## 6. useState from scratch — how React stores hook state

**This is the one that explains the Rules of Hooks.**

```js
let hooks = [];    // one slot per hook call, persisted across renders
let cursor = 0;    // which slot the NEXT useState() call reads

function useState(initial) {
  const index = cursor;                                   // capture MY slot
  if (hooks[index] === undefined) hooks[index] = initial; // seed on first render
  const setState = (next) => {
    hooks[index] =
      typeof next === "function" ? next(hooks[index]) : next;  // fn updater support
    render();                                             // re-run the component
  };
  cursor++;                                               // advance for next useState
  return [hooks[index], setState];
}

function render() {
  cursor = 0;        // reset before each render — hooks matched by ORDER
  Component();       // (real React commits to the DOM after this)
}
```

**Why hooks can't be conditional, from first principles:** state is keyed by
**call order** (the cursor), not by variable name. Skip a `useState` in one
render and every slot after it shifts by one — your `count` becomes your `name`.
That's the entire reason for "always call hooks at the top level."

---

## Bonus classics

```js
// memoize — cache results by argument key
function memoize(fn) {
  const cache = new Map();
  return function (...args) {
    const key = JSON.stringify(args);            // naive; fine for primitives
    if (cache.has(key)) return cache.get(key);
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
}

// once — run exactly one time, cache the result
function once(fn) {
  let called = false, result;
  return function (...args) {
    if (!called) { called = true; result = fn.apply(this, args); }
    return result;
  };
}

// EventEmitter — pub/sub
class EventEmitter {
  constructor() { this.listeners = new Map(); }  // event → Set<cb>
  on(event, cb) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(cb);
    return () => this.off(event, cb);            // return unsubscribe
  }
  off(event, cb) { this.listeners.get(event)?.delete(cb); }
  emit(event, ...args) { this.listeners.get(event)?.forEach((cb) => cb(...args)); }
}

// deepClone — structuredClone is built-in now; hand-rolled for the interview
function deepClone(obj, seen = new WeakMap()) {
  if (obj === null || typeof obj !== "object") return obj;   // primitives
  if (seen.has(obj)) return seen.get(obj);                   // handle cycles
  const copy = Array.isArray(obj) ? [] : {};
  seen.set(obj, copy);
  for (const key of Reflect.ownKeys(obj)) copy[key] = deepClone(obj[key], seen);
  return copy;
}

// pipe / compose — combine unary functions
const pipe = (...fns) => (x) => fns.reduce((acc, fn) => fn(acc), x);       // left→right
const compose = (...fns) => (x) => fns.reduceRight((acc, fn) => fn(acc), x); // right→left

// retry with backoff — wrap a promise-returning fn
async function retry(fn, times = 3, delay = 300) {
  let lastErr;
  for (let i = 0; i < times; i++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, delay * 2 ** i)); // exponential
    }
  }
  throw lastErr;
}
```

---

## The "explain it" cheat lines

- **debounce:** "clearTimeout on every call, so only the last one in a burst fires."
- **throttle:** "leading call, then a timer gates the rest; trailing call so the last event isn't dropped."
- **Promise.all:** "assign by index to preserve order, count down, resolve at zero, reject on first failure, resolve empty immediately."
- **curry:** "collect args until `.length >= fn.length`, then invoke."
- **useState:** "state lives in an array keyed by call order — which is why hooks must be unconditional and top-level."
