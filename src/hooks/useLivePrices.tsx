import { useEffect, useRef } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { itemKeys } from "@/api/queryKeys";
import type { Item } from "@/mocks/data";
import type { ItemsPage } from "@/pages/api/items";

const LIST_KEY = [...itemKeys.all, "list"];
const FLUSH_MS = 250;

interface PriceTick {
  id: string;
  priceCents: number;
  at: number;
}

export function useLivePrices() {
  const queryClient = useQueryClient();

  // latest buffered price per id, flushed as one batch
  const bufferRef = useRef<Map<string, PriceTick>>(new Map());
  // last-applied timestamp per id, to drop out-of-order stragglers
  const lastAtRef = useRef<Map<string, number>>(new Map());
  // tell a reconnect apart from the first connect
  const hasConnectedRef = useRef(false);

  useEffect(() => {
    const es = new EventSource("/api/stream");

    es.onmessage = (e) => {
      const tick = JSON.parse(e.data) as PriceTick;

      // ordering guard: ignore anything older than what we've already applied
      const lastAt = lastAtRef.current.get(tick.id) ?? 0;
      if (tick.at < lastAt) return;
      lastAtRef.current.set(tick.id, tick.at);

      // buffer latest-per-id (collapses a burst into one update)
      bufferRef.current.set(tick.id, tick);
    };

    es.onopen = () => {
      if (hasConnectedRef.current) {
        // reconnect: we missed events in the gap, so resync from the server
        queryClient.invalidateQueries({ queryKey: itemKeys.all });
      }
      hasConnectedRef.current = true;
    };

    const flush = setInterval(() => {
      if (bufferRef.current.size === 0) return;
      const batch = bufferRef.current;
      bufferRef.current = new Map();

      // one pass over every cached list; return the SAME reference for
      // anything unchanged so React Query skips re-rendering those queries
      queryClient.setQueriesData<InfiniteData<ItemsPage>>(
        { queryKey: LIST_KEY },
        (old) => {
          if (!old) return old;
          let changed = false;
          const pages = old.pages.map((page) => {
            let pageChanged = false;
            const items = page.items.map((i) => {
              const tick = batch.get(i.id);
              if (!tick) return i;
              pageChanged = true;
              changed = true;
              return { ...i, priceCents: tick.priceCents };
            });
            return pageChanged ? { ...page, items } : page;
          });
          return changed ? { ...old, pages } : old;
        },
      );

      // patch any open detail caches too
      batch.forEach((tick) => {
        queryClient.setQueryData<Item>(itemKeys.detail(tick.id), (old) =>
          old ? { ...old, priceCents: tick.priceCents } : old,
        );
      });
    }, FLUSH_MS);

    return () => {
      es.close();
      clearInterval(flush);
    };
  }, [queryClient]);
}
