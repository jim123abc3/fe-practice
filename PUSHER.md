# Pusher — managed realtime for a live marketplace (Arena Club context)

How Pusher works, its channel/event model, the React integration, and concrete
ways it powers live data for a collectibles marketplace like Arena Club (live
bids, price ticks, offer status, presence, pack breaks). Ties directly to the
realtime-cache pattern you already built with SSE — a Pusher event binding is
almost a drop-in for `EventSource.onmessage`.

> Arena Club specifics below are illustrative of how you'd apply Pusher to a
> card-marketplace domain, not claims about their actual stack.

---

## 1. What Pusher is (and why you'd choose it)

Pusher **Channels** is a hosted pub/sub realtime service over WebSockets. You
don't run WebSocket servers, don't build reconnection/heartbeat/scaling — Pusher
does. Your backend **triggers** events; browsers **subscribe** to channels and
**bind** to events.

**Why a managed service over raw WebSocket:** the raw-WS production checklist
(reconnect + backoff + jitter, heartbeat, presence, horizontal scaling across
many server instances, auth) is a lot to build and operate. Pusher gives you all
of it — reconnection, connection-state events, presence, private-channel auth —
so the frontend just subscribes and reacts. Trade-off: a third-party dependency
and cost per connection/message.

Interview line: *"For realtime I'd lean on a managed service like Pusher/Ably
rather than operate WebSocket infrastructure — reconnection, presence, and
scaling are solved, and the FE work collapses to 'subscribe to a channel, patch
the cache on events, resync on reconnect.'"*

---

## 2. The mental model: channels + events

- **Channel** = a named stream you subscribe to (e.g. `item-00123`, `auction-42`,
  `presence-item-00123`).
- **Event** = a named message on a channel (e.g. `price:update`, `bid:new`,
  `offer:accepted`).
- **Bind** = attach a handler to an event on a channel.

Three channel types:

| Type | Prefix | Auth? | Use for |
|------|--------|-------|---------|
| **Public** | (none) | no | non-sensitive broadcast (public price ticks) |
| **Private** | `private-` | yes (server auth) | user-scoped data (your offers, your notifications) |
| **Presence** | `presence-` | yes | private + a live roster of who's subscribed ("12 watching") |

---

## 3. Client setup (`pusher-js`)

```bash
npm i pusher-js
```

```ts
import Pusher from "pusher-js";

// The KEY is public (safe in client). The SECRET stays on your server.
const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
  cluster: "eu",
  // for private/presence channels, Pusher POSTs here to authorise the user:
  channelAuthorization: { endpoint: "/api/pusher/auth", transport: "ajax" },
});

const channel = pusher.subscribe("item-00123");
channel.bind("price:update", (data: { priceCents: number; at: number }) => {
  // handle the tick
});

// cleanup
channel.unbind_all();
pusher.unsubscribe("item-00123");
pusher.disconnect();
```

**Connection state** (Pusher manages reconnection; you just observe it):

```ts
pusher.connection.bind("state_change", ({ current }) => {
  // "connecting" | "connected" | "unavailable" | "failed" | "disconnected"
});
pusher.connection.bind("connected", () => { /* good place to resync */ });
```

---

## 4. Private & presence channels (auth)

Private/presence channels require your **server** to sign the subscription so a
user can only subscribe to what they're allowed to. The client calls your auth
endpoint automatically; you validate the session and return a signature.

```ts
// pages/api/pusher/auth.ts (server) — pseudo
import Pusher from "pusher";
const pusher = new Pusher({ appId, key, secret, cluster }); // secret ONLY here
export default function handler(req, res) {
  const user = getSession(req);                 // your auth
  if (!user) return res.status(403).end();
  const { socket_id, channel_name } = req.body;
  // enforce: can THIS user subscribe to THIS channel?
  const auth = pusher.authorizeChannel(socket_id, channel_name, {
    user_id: user.id,                           // presence: identify the member
    user_info: { name: user.name },
  });
  res.send(auth);
}
```

**Presence roster** — a live "who's here" list, great for "N people watching":

```ts
const presence = pusher.subscribe("presence-item-00123");
presence.bind("pusher:subscription_succeeded", (members) => setCount(members.count));
presence.bind("pusher:member_added",   () => setCount((c) => c + 1));
presence.bind("pusher:member_removed", () => setCount((c) => c - 1));
```

---

## 5. Server triggers the event (the other half)

The realtime originates from your backend when something changes:

```ts
// when a bid lands, or a price recomputes, server-side:
await pusher.trigger("auction-42", "bid:new", { amountCents, bidder, at: Date.now() });
await pusher.trigger("item-00123", "price:update", { priceCents, at: Date.now() });
```

The frontend never trusts the client for these — the server is the source of
truth and the only thing that triggers events.

---

## 6. React integration — a hook

Same shape as the `useWebSocket` / `useLivePrices` hooks you built: open in an
effect, bind with a **latest-ref** handler (no stale closures), clean up on
unmount.

```tsx
import { useEffect, useRef } from "react";
import type { Channel } from "pusher-js";
import { pusher } from "@/lib/pusher";   // the singleton Pusher instance

export function usePusherEvent<T>(
  channelName: string,
  eventName: string,
  onEvent: (data: T) => void,
) {
  // latest-ref: newest handler without re-subscribing each render
  const handlerRef = useRef(onEvent);
  useEffect(() => { handlerRef.current = onEvent; }, [onEvent]);

  useEffect(() => {
    const channel: Channel = pusher.subscribe(channelName);
    const handler = (data: T) => handlerRef.current(data);
    channel.bind(eventName, handler);

    return () => {
      channel.unbind(eventName, handler);      // unbind THIS handler
      // unsubscribe only if no other component needs the channel (see note)
      pusher.unsubscribe(channelName);
    };
  }, [channelName, eventName]);                 // NOT onEvent — handled by the ref
}
```

**One shared `Pusher` instance** (a module singleton in `src/lib/pusher.ts`),
not one per component — you want a single connection multiplexing all channels.
If multiple components subscribe to the same channel, ref-count subscriptions so
one unmounting doesn't `unsubscribe` out from under the others (or subscribe once
higher up and fan out via context).

---

## 7. Plugging into React Query (reuse your marketplace cache walkers)

A Pusher `price:update` event maps 1:1 onto the SSE handler you already wrote —
**patch the cache, don't refetch; resync on reconnect.**

```tsx
function useLiveItem(itemId: string) {
  const queryClient = useQueryClient();

  // steady state: patch the detail cache + every cached list in place
  usePusherEvent<{ priceCents: number; at: number }>(
    `item-${itemId}`, "price:update",
    ({ priceCents }) => {
      queryClient.setQueryData(itemKeys.detail(itemId), (old) =>
        old ? { ...old, priceCents } : old);
      queryClient.setQueriesData({ queryKey: [...itemKeys.all, "list"] }, (old) =>
        old && { ...old, pages: old.pages.map((p) => ({
          ...p, items: p.items.map((i) => i.id === itemId ? { ...i, priceCents } : i),
        })) });
    },
  );

  // reconnect: you missed events during the gap → resync
  useEffect(() => {
    const onConnected = () => queryClient.invalidateQueries({ queryKey: itemKeys.all });
    pusher.connection.bind("connected", onConnected);
    return () => pusher.connection.unbind("connected", onConnected);
  }, [queryClient]);
}
```

Same three rules as before: **patch** in steady state (never invalidate per
event — self-DDoS), **invalidate once on reconnect** (data integrity), **batch**
high-frequency events (ref buffer + rAF/250ms flush → one render per frame), and
return **reference-stable** patches so memoized cards don't all re-render.

---

## 8. Arena Club use cases (concrete)

| Feature | Channel | Event(s) | FE reaction |
|---------|---------|----------|-------------|
| **Live price ticks** | `item-{id}` (public) | `price:update` | patch item price in detail + list caches; flash the card |
| **Live auction bids** | `auction-{id}` (public) | `bid:new`, `auction:ending` | append bid to history, bump current price, show countdown |
| **Your offer status** | `private-user-{id}` | `offer:accepted` / `offer:rejected` | toast + reconcile the optimistic mutation cache |
| **Inventory / stock** | `item-{id}` | `stock:changed`, `sold` | mark sold out, disable buy button live |
| **"N people watching"** | `presence-item-{id}` | member add/remove | live viewer count (social proof / urgency) |
| **Live pack breaks / rips** | `break-{id}` (presence) | `card:revealed` | stream each pulled card to everyone watching |
| **Marketplace ticker** | `market` (public) | `sale:new` | "just sold: 1998 Kobe PSA 9 for $412" feed |

For a card marketplace specifically, the high-value realtime is **auctions**
(bids must be live and ordered), **offer notifications** (your bid was
accepted/outbid), and **presence-driven urgency** ("12 people watching this
lot"). All three are exactly what presence + private + public channels are for.

**Optimistic + realtime together** (the sharp bit): when *you* place a bid you
optimistically update locally (your Phase 10 pattern); when the server confirms
and broadcasts `bid:new` to everyone, your own client also receives it — so
guard with a sequence number / your own bid id to avoid double-applying, and let
the broadcast be the source of truth that reconciles your optimistic guess.

---

## 9. Gotchas

- **Never expose the Pusher secret** — only the `key` is public. Triggers and
  auth signing happen server-side with the secret.
- **Client-only** — instantiate `pusher-js` in an effect / guard `typeof window`;
  it doesn't belong in SSR/render.
- **StrictMode double-subscribe (dev)** — mount→unmount→remount means a brief
  double subscribe; your `unbind`/`unsubscribe` cleanup keeps it correct.
- **Batching** — a hot auction can fire many events/second; buffer + flush per
  frame or you'll thrash renders.
- **Presence member limits & message rate** — presence channels cap members;
  high-fan-out events cost — batch server-side where possible.
- **Auth latency** — private/presence subscribe waits on your auth endpoint; keep
  it fast, and handle `pusher:subscription_error`.

---

## 10. Pusher vs the alternatives

| Option | Pick when |
|--------|-----------|
| **Pusher Channels** | want managed realtime fast; presence + private channels; don't want to run WS infra |
| **Ably** | similar, with stronger guarantees (message ordering, history/replay, global edge) |
| **Supabase Realtime** | already on Supabase/Postgres; want DB-change streams |
| **Socket.IO (self-hosted)** | want full control + rooms/acks and can operate the servers |
| **Raw WebSocket** | simplest one-off, you control both ends, minimal needs |

---

## 11. The one-paragraph answer ("how would Arena Club do live prices/bids?")

*"A managed realtime layer like Pusher Channels. The backend is the source of
truth: on a price recompute or a new bid it triggers an event on the item/auction
channel. The frontend keeps one shared Pusher connection, subscribes per visible
item (public channels for prices, presence channels for 'who's watching', private
channels for a user's own offer notifications), and binds events through a
latest-ref hook so handlers stay fresh without re-subscribing. On each event I
patch the React Query cache in place rather than refetch — at bid volume,
invalidating per message would DDoS our own API — and I only invalidate to resync
on reconnect, since a dropped connection means missed messages. High-frequency
events get buffered and flushed once per frame, and patches are reference-stable
so only the cards that actually changed re-render. Placing a bid is optimistic
locally and reconciled by the server's broadcast, guarded by a sequence id so my
own echo doesn't double-apply."*
