import { Profiler, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, Grid, CircularProgress, Alert, TextField } from "@mui/material";
import { fetchItems } from "@/api/items";
import { itemKeys } from "@/api/queryKeys";
import { ItemCard } from "@/components/ItemCard";
import { FiltersContextProvider, useFilters } from "@/context/FiltersContext";

function MarketplaceGrid() {
  const { q, setQ } = useFilters();

  const { data, isLoading, isError } = useQuery({
    queryKey: itemKeys.lists({ limit: 5000 }),
    queryFn: ({ signal }) => fetchItems({ limit: 5000 }, signal),
  });

  const handleSelect = useCallback((id: string) => {
    console.log("selected ", id);
  }, []);

  if (isLoading) return <CircularProgress />;
  if (isError) return <Alert severity="error">Failed to load items</Alert>;

  const filtered = data?.items.filter((item) =>
    item.name.toLowerCase().includes(q.toLowerCase()),
  );

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
        <Grid container spacing={2}>
          {filtered?.map((item) => (
            <Grid key={item.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
              <ItemCard item={item} onSelect={handleSelect} />
            </Grid>
          ))}
        </Grid>
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
