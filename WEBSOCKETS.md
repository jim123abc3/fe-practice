# WebSockets — syntax, patterns, and React integration

Everything you need to talk about and build realtime with WebSockets: the raw
API, the production patterns (reconnect, heartbeat, backpressure), how to wrap it
in a React hook, and how it plugs into a data-fetching cache like React Query.

---

## 1. What it is, and when to reach for it

WebSocket = a single, long-lived, **full-duplex** TCP connection between browser
and server. Once open, either side can push messages any time, with almost no
per-message overhead (no HTTP headers per message).

| Transport | Direction | Use when |
|-----------|-----------|----------|
| **Polling** (repeated GET) | client pulls | simplest; wasteful; "good enough" for low-frequency |
| **Long-polling** | client pulls, server holds | legacy realtime fallback |
| **SSE** (`EventSource`) | **server → client only** | server push, text only, auto-reconnect built in, over plain HTTP |
| **WebSocket** | **bidirectional** | chat, presence, collaborative editing, trading, games |

**SSE vs WebSocket (the interview comparison):** SSE is one-way (server→client),
text-only, runs over HTTP/1.1, and **auto-reconnects for you**. WebSocket is
two-way, supports binary, but you build reconnection/heartbeat yourself. If the
client never needs to *push* over the socket, SSE is simpler and enough (that's
what the marketplace price stream used).

---

## 2. The raw browser API

```js
const ws = new WebSocket("wss://example.com/socket", ["protocol1"]); // wss:// = TLS

// Four events:
ws.onopen    = ()  => ws.send("hello");              // connection established
ws.onmessage = (e) => console.log(e.data);           // a message arrived
ws.onclose   = (e) => console.log(e.code, e.reason); // closed (see close codes)
ws.onerror   = (e) => console.error(e);              // error (onclose usually follows)

ws.send(JSON.stringify({ type: "ping" }));           // send text
ws.send(new Uint8Array([1, 2, 3]));                  // send binary (ArrayBuffer/Blob)

ws.close(1000, "done");                              // clean close: code + reason

// readyState — check before sending
ws.readyState === WebSocket.CONNECTING; // 0
ws.readyState === WebSocket.OPEN;        // 1  — only send() when OPEN
ws.readyState === WebSocket.CLOSING;     // 2
ws.readyState === WebSocket.CLOSED;      // 3
```

**Close codes worth knowing:** `1000` normal, `1001` going away (tab closed),
`1006` abnormal (no close frame — usually a dropped connection, and the one your
reconnect logic reacts to), `1011` server error, `4000–4999` app-defined.

**Binary:** set `ws.binaryType = "arraybuffer"` (or `"blob"`) to control how
binary frames arrive.

---

## 3. The production patterns (this is where seniority shows)

A raw `new WebSocket` is never enough in production. You layer on:

### a. Reconnection with exponential backoff + jitter

```js
let attempt = 0;
function connect() {
  const ws = new WebSocket(url);
  ws.onopen = () => { attempt = 0; };            // reset backoff on success
  ws.onclose = (e) => {
    if (e.code === 1000) return;                 // clean close → don't reconnect
    const base = Math.min(1000 * 2 ** attempt, 30_000);  // cap at 30s
    const jitter = Math.random() * 1000;         // spread out reconnects (thundering herd)
    attempt++;
    setTimeout(connect, base + jitter);
  };
}
```

**Why jitter:** if a server restarts and 10k clients all reconnect at exactly 1s,
2s, 4s… you DDoS your own server ("thundering herd"). Randomising spreads them.

### b. Heartbeat / ping-pong (detect dead connections)

TCP can stay "open" while silently dead (network dropped, no FIN sent). Detect it
by sending a ping and expecting a pong within a timeout:

```js
let pongTimer;
function heartbeat(ws) {
  clearTimeout(pongTimer);
  ws.send(JSON.stringify({ type: "ping" }));
  pongTimer = setTimeout(() => ws.close(), 5000);  // no pong in 5s → assume dead, close→reconnect
}
// on receiving {type:"pong"} → clearTimeout(pongTimer); schedule next heartbeat
```

### c. Outbound queue (send before OPEN)

`send()` throws if the socket isn't OPEN. Queue messages while connecting and
flush on `onopen`:

```js
const queue = [];
function send(msg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  else queue.push(msg);                          // buffer until open
}
ws.onopen = () => { queue.splice(0).forEach((m) => ws.send(JSON.stringify(m))); };
```

### d. Message protocol / dispatch

Give every message a `type` and dispatch on it — never `if/else` on raw strings:

```js
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  switch (msg.type) {
    case "price": applyPrice(msg); break;
    case "pong": onPong(); break;
    default: console.warn("unknown", msg.type);
  }
};
```

### e. Ordering & idempotency

Messages can arrive out of order or be re-delivered after reconnect. Carry a
sequence number or timestamp and drop stale ones:

```js
if (msg.seq <= lastSeq) return;   // ignore out-of-order / duplicate
lastSeq = msg.seq;
```

### f. Backpressure / batching

At high volume (50+ msg/s) you can't re-render per message. Buffer in a ref,
flush on a timer or `requestAnimationFrame` → one render per frame:

```js
const buffer = [];
ws.onmessage = (e) => buffer.push(JSON.parse(e.data));
setInterval(() => { if (buffer.length) { applyBatch(buffer.splice(0)); } }, 250);
```

### g. Auth

Browsers **can't set custom headers** on a WebSocket handshake. Options:
- Token in the URL query string: `wss://host/ws?token=...` (visible in logs — use short-lived tokens).
- Send an auth message as the **first frame** after `onopen`, before subscribing.
- Cookie-based (the handshake is an HTTP upgrade, so `HttpOnly` cookies ride along) — best for same-origin.

### h. Subscriptions / channels

Multiplex many logical streams over one socket; subscribe/unsubscribe based on
what's visible (e.g. only the rows in the viewport):

```js
send({ type: "subscribe", channel: `item:${id}` });
send({ type: "unsubscribe", channel: `item:${id}` });
```

---

## 4. A production-grade React hook

Ties together: latest-ref handlers (no stale closures), cleanup, reconnection,
and `readyState` exposure.

```tsx
import { useEffect, useRef, useState, useCallback } from "react";

type Status = "connecting" | "open" | "closed";

export function useWebSocket(url: string, onMessage: (data: unknown) => void) {
  const [status, setStatus] = useState<Status>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const shouldReconnect = useRef(true);

  // LATEST-REF: keep the newest onMessage without re-opening the socket each render
  const onMessageRef = useRef(onMessage);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  useEffect(() => {
    shouldReconnect.current = true;

    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      setStatus("connecting");

      ws.onopen = () => { attemptRef.current = 0; setStatus("open"); };
      ws.onmessage = (e) => {
        // call the LATEST handler via the ref — never a stale closure
        try { onMessageRef.current(JSON.parse(e.data)); }
        catch { onMessageRef.current(e.data); }
      };
      ws.onclose = () => {
        setStatus("closed");
        if (!shouldReconnect.current) return;
        const delay = Math.min(1000 * 2 ** attemptRef.current, 30_000) + Math.random() * 1000;
        attemptRef.current++;
        setTimeout(connect, delay);
      };
      ws.onerror = () => ws.close();   // let onclose drive reconnection
    }

    connect();

    // CLEANUP: stop reconnecting and close on unmount / url change
    return () => {
      shouldReconnect.current = false;
      wsRef.current?.close(1000, "unmount");
    };
  }, [url]);   // NOT onMessage — that's handled by the ref, so the socket is stable

  const send = useCallback((data: unknown) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  }, []);

  return { status, send };
}
```

**The three things that make this senior, not toy:**
1. **Latest-ref for `onMessage`** — the socket effect depends only on `url`, so a
   new handler each render doesn't tear down and re-open the connection, but the
   socket still calls the freshest handler. (Same stale-closure fix as the
   IntersectionObserver hook.)
2. **`shouldReconnect` ref** — distinguishes an intentional unmount close from a
   dropped connection, so unmounting doesn't trigger a reconnect loop.
3. **Cleanup closes the socket** — no leaked connections when the component
   unmounts or `url` changes.

---

## 5. Plugging into React Query (the realtime-cache pattern)

Same approach as the SSE price stream: **don't refetch on every message — patch
the cache directly**, and only invalidate on reconnect.

```tsx
function useLivePrices() {
  const queryClient = useQueryClient();
  useWebSocket("wss://host/prices", (msg) => {
    // patch the cached entity in place — no network
    queryClient.setQueryData(["item", msg.id], (old) =>
      old ? { ...old, price: msg.price } : old);
  });
  // on reconnect you've missed messages → invalidateQueries to resync (do this in onopen)
}
```

Rules of thumb:
- **Steady state:** `setQueryData` (patch). Invalidating per message = a refetch
  storm / self-DDoS.
- **Reconnect:** `invalidateQueries` once, because you missed messages in the gap
  and can't trust local state ("data integrity").
- **Batch** high-frequency updates (ref buffer + rAF/250ms flush) → one render
  per frame.
- **Reference-stable patches:** return the same object for unchanged entities so
  memoized components don't re-render.

---

## 6. React / Next.js gotchas

- **Client-only.** `WebSocket` doesn't exist on the server. In Next, open it in a
  `useEffect` (never during render/SSR), or guard `typeof window !== "undefined"`.
- **StrictMode double-connect (dev).** React 18 mounts→unmounts→remounts in dev,
  so you'll see two connections briefly. Your cleanup (closing on unmount) is what
  keeps this correct — it's a feature surfacing missing cleanup, not a bug.
- **Don't put the socket in state.** Store it in a `useRef` — it's a mutable
  instance, not render data. Putting it in `useState` causes needless re-renders.
- **One socket, shared.** Prefer a single connection at the app root (context or a
  store) that many components subscribe to, over each component opening its own.

---

## 7. Libraries (and when to skip them)

| Option | Use when |
|--------|----------|
| **native `WebSocket`** | you control both ends, simple needs, want zero deps |
| **`react-use-websocket`** | want the hook, reconnect, and shared connections done for you |
| **Socket.IO** | need rooms, auto-fallback to polling, ack callbacks, auto-reconnect (note: NOT raw WS — its own protocol; needs a Socket.IO server) |
| **Pusher / Ably / Supabase Realtime** | managed realtime — presence, channels, auth, scaling handled; you just subscribe |

Interview line: *"For a simple feed I'd use the native API with a reconnect/
heartbeat wrapper. For channels, presence, and fallback I'd reach for Socket.IO
or a managed service like Pusher/Ably rather than rebuild that."*

---

## 8. Testing WebSockets

- **`mock-socket`** — a drop-in fake `WebSocket` + mock server for unit tests; you
  script server messages and assert the component reacts.
- **Playwright / Cypress** — can intercept or run against a real test WS server for
  E2E.
- In a hook test, inject a fake socket (or use `mock-socket`), emit a message, and
  assert your `onMessage`/cache patch ran.

---

## 9. The mental checklist (say these under "how would you build realtime?")

1. **Transport choice** — one-way? SSE. Two-way? WebSocket.
2. **Reconnect** — exponential backoff + jitter; reset on open; don't reconnect on
   clean close.
3. **Heartbeat** — ping/pong to detect dead-but-open connections.
4. **Ordering** — sequence numbers / timestamps; drop stale.
5. **Backpressure** — buffer + batch-flush per frame at high volume.
6. **State integrity** — patch the cache live; resync (refetch) on reconnect.
7. **Auth** — token in query/first-message/cookie (no custom headers in browsers).
8. **Lifecycle** — open in effect, close in cleanup, one shared connection,
   client-only.
