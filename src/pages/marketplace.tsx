import { Profiler, useCallback, useEffect, useMemo, useRef } from "react";
import {
  InfiniteData,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Box, CircularProgress, Alert, TextField } from "@mui/material";
import { fetchItems } from "@/api/items";
import { itemKeys } from "@/api/queryKeys";
import { ItemCard } from "@/components/ItemCard";
import { FiltersContextProvider, useFilters } from "@/context/FiltersContext";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRouter } from "next/router";
import { useDebounceValue } from "@/hooks/useDebounceValue";
import { keepPreviousData } from "@tanstack/react-query";

const ROW_HEIGHT = 340;
const PAGE_SIZE = 20;
const PREFETCH_THRESHOLD = 5;

function MarketplaceGrid() {
  const { q, setQ } = useFilters();
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounceValue(q);

  const router = useRouter();
  const queryClient = useQueryClient();
  const hasRehydrated = useRef(false);
  const hasRestoredScroll = useRef(false);
  const didHydrateFromUrl = useRef(false);

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPlaceholderData,
  } = useInfiniteQuery({
    queryKey: itemKeys.lists({ q: debouncedQuery, limit: PAGE_SIZE }),
    queryFn: ({ pageParam, signal }) =>
      fetchItems(
        { q: debouncedQuery, limit: PAGE_SIZE, cursor: pageParam },
        signal,
      ),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextCursor,
    getPreviousPageParam: (first) => first.prevCursor,
    gcTime: 10 * 60_000,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });

  const handleSelect = useCallback(
    (id: string) => {
      router.push(`/items/${id}`);
    },
    [router],
  );

  const items = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  const initialOffsetRef = useRef<number | null>(null);
  if (initialOffsetRef.current === null) {
    let restored = 0;
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem(`scroll:${router.asPath}`);
      if (saved) {
        const { index, offset } = JSON.parse(saved) as {
          index: number;
          offset: number;
        };
        restored = index * ROW_HEIGHT + offset;
      }
    }
    initialOffsetRef.current = restored;
  }

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
    initialOffset: initialOffsetRef.current,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();

  useEffect(() => {
    const lastRow = virtualRows[virtualRows.length - 1];
    if (!lastRow) return;
    if (
      lastRow.index >= items.length - 1 - PREFETCH_THRESHOLD &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [
    virtualRows,
    items.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ]);

  useEffect(() => {
    const key = `scroll:${router.asPath}`;
    const handleRouterChangeStart = () => {
      const firstRow = virtualRows[0];
      if (!firstRow || !containerRef.current) return;
      const offset = containerRef.current.scrollTop - firstRow.start;

      sessionStorage.setItem(
        key,
        JSON.stringify({
          pageCount: Math.max(1, Math.ceil(items.length / PAGE_SIZE)),
          index: firstRow.index,
          offset,
        }),
      );
    };
    router.events.on("routeChangeStart", handleRouterChangeStart);
    return () => router.events.off("routeChangeStart", handleRouterChangeStart);
  }, [router, virtualRows, data]);

  useEffect(() => {
    if (hasRehydrated.current) return;
    hasRehydrated.current = true;

    const saved = sessionStorage.getItem(`scroll:${router.asPath}`);
    if (!saved) return;

    const existing = queryClient.getQueryData(
      itemKeys.lists({ q: debouncedQuery, limit: PAGE_SIZE }),
    );
    if (existing) return;

    const { pageCount } = JSON.parse(saved) as { pageCount: number };
    if (pageCount <= 1) return;

    fetchItems({
      q: debouncedQuery,
      limit: PAGE_SIZE * pageCount,
      cursor: 0,
    }).then((page) => {
      queryClient.setQueryData<InfiniteData<typeof page>>(
        itemKeys.lists({ q: debouncedQuery, limit: PAGE_SIZE }),
        { pages: [page], pageParams: [0] },
      );
    });
  }, [router.asPath, debouncedQuery, queryClient]);

  useEffect(() => {
    if (hasRestoredScroll.current) return;
    const target = initialOffsetRef.current ?? 0;
    if (target === 0) {
      hasRestoredScroll.current = true;
      return;
    }
    if (rowVirtualizer.getTotalSize() >= target) {
      rowVirtualizer.scrollToOffset(target);
      hasRestoredScroll.current = true;
    }
  }, [items.length]);

  // Hydrate the search box from the URL once, so a shared link like
  // /marketplace?q=jordan starts pre-filtered. On the pages router,
  // router.query is empty until isReady, so gate on it.
  useEffect(() => {
    if (!router.isReady || didHydrateFromUrl.current) return;
    didHydrateFromUrl.current = true;

    const urlQ = typeof router.query.q === "string" ? router.query.q : "";
    if (urlQ) setQ(urlQ);
  }, [router.isReady, router.query.q, setQ]);

  // Mirror the debounced term into the URL (shareable + bookmarkable).
  // replace (not push) so typing doesn't create a history entry per keystroke.
  // shallow so it doesn't re-run getServerSideProps.
  useEffect(() => {
    if (!didHydrateFromUrl.current) return; // don't clobber the URL before we've read it
    const current = typeof router.query.q === "string" ? router.query.q : "";
    if (current === debouncedQuery) return; // avoid redundant navigations / loops

    router.replace(
      {
        pathname: router.pathname,
        query: debouncedQuery ? { q: debouncedQuery } : {},
      },
      undefined,
      { shallow: true },
    );
  }, [debouncedQuery, router]);

  return (
    <Box sx={{ p: 3 }}>
      <TextField
        label="Search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        sx={{ mb: 3 }}
        fullWidth
      />
      <Profiler
        id="marketplace"
        onRender={(id, phase, actualDuration) =>
          console.log(id, phase, actualDuration.toFixed(1), "ms")
        }
      >
        <Box
          ref={containerRef}
          sx={{ height: "80vh", overflowY: "auto", position: "relative" }}
        >
          {isLoading && <CircularProgress />}
          {isError && <Alert severity="error">Failed to load items</Alert>}
          {!isLoading && !isError && (
            <Box
              sx={{
                height: rowVirtualizer.getTotalSize(),
                position: "relative",
              }}
            >
              {virtualRows.map((virtualRow) => {
                const item = items[virtualRow.index];
                if (!item) return null;
                return (
                  <Box
                    key={item.id}
                    sx={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      height: ROW_HEIGHT,
                      transform: `translateY(${virtualRow.start}px)`,
                      opacity: isPlaceholderData ? 0.5 : 1,
                      transition: "opacity 0.2s",
                    }}
                  >
                    <ItemCard item={item} onSelect={handleSelect} />
                  </Box>
                );
              })}
              {isFetchingNextPage && (
                <Box
                  sx={{
                    position: "absolute",
                    top: rowVirtualizer.getTotalSize(),
                    left: 0,
                    right: 0,
                    display: "flex",
                    justifyContent: "center",
                    py: 2,
                  }}
                >
                  <CircularProgress size={24} />
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Profiler>
    </Box>
  );
}

export default function Marketplace() {
  return (
    <FiltersContextProvider>
      <MarketplaceGrid />
    </FiltersContextProvider>
  );
}
