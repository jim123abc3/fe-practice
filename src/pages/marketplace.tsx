import { Profiler, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, CircularProgress, Alert, TextField } from "@mui/material";
import { fetchItems } from "@/api/items";
import { itemKeys } from "@/api/queryKeys";
import { ItemCard } from "@/components/ItemCard";
import { FiltersContextProvider, useFilters } from "@/context/FiltersContext";
import { useVirtualList } from "@/hooks/useVirtualList";

const ROW_HEIGHT = 340; // adjust to your actual rendered card height

function MarketplaceGrid() {
  const { q, setQ } = useFilters();
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: itemKeys.lists({ limit: 5000 }),
    queryFn: ({ signal }) => fetchItems({ limit: 5000 }, signal),
  });

  const handleSelect = useCallback((id: string) => {
    console.log("selected ", id);
  }, []);

  const filtered = data?.items.filter((item) =>
    item.name.toLowerCase().includes(q.toLowerCase()),
  );

  const { virtualItems, totalHeight } = useVirtualList({
    items: filtered ?? [],
    rowHeight: ROW_HEIGHT,
    overscan: 5,
    containerRef,
  });

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
            <Box sx={{ height: totalHeight, position: "relative" }}>
              {virtualItems.map(({ item, offsetTop }) => (
                <Box
                  key={item.id}
                  sx={{
                    position: "absolute",
                    top: offsetTop,
                    left: 0,
                    right: 0,
                    height: ROW_HEIGHT,
                  }}
                >
                  <ItemCard item={item} onSelect={handleSelect} />
                </Box>
              ))}
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
