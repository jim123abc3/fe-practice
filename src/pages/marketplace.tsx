import { Profiler, useCallback, useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Box, CircularProgress, Alert, TextField } from "@mui/material";
import { fetchItems } from "@/api/items";
import { itemKeys } from "@/api/queryKeys";
import { ItemCard } from "@/components/ItemCard";
import { FiltersContextProvider, useFilters } from "@/context/FiltersContext";
import { useVirtualizer } from "@tanstack/react-virtual";

const ROW_HEIGHT = 340;
const PAGE_SIZE = 20;
const PREFETCH_THRESHOLD = 5;

function MarketplaceGrid() {
  const { q, setQ } = useFilters();
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: itemKeys.lists({ q, limit: PAGE_SIZE }),
    queryFn: ({ pageParam, signal }) =>
      fetchItems({ q, limit: PAGE_SIZE, cursor: pageParam }, signal),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextCursor,
    getPreviousPageParam: (first) => first.prevCursor,
  });

  const handleSelect = useCallback((id: string) => {
    console.log("selected ", id);
  }, []);

  const items = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
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
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    sx={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      height: ROW_HEIGHT,
                      transform: `translateY(${virtualRow.start}px)`,
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
