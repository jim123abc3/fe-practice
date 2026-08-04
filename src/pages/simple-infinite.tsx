import { useEffect } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Box, Typography, CircularProgress } from "@mui/material";
import { fetchItems } from "@/api/items";
import { useInView } from "react-intersection-observer";

export default function SimpleInfinite() {
  const { inView, ref } = useInView();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: ["simple-items"],
      queryFn: ({ pageParam, signal }) =>
        fetchItems({ limit: 100, cursor: pageParam }, signal),
      initialPageParam: 0,
      getNextPageParam: (last) => last.nextCursor,
    });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  if (isLoading) return <CircularProgress />;

  return (
    <Box sx={{ p: 3, maxWidth: 600, mx: "auto" }}>
      {items.map((item) => (
        <Box
          key={item.id}
          sx={{ p: 2, mb: 1, border: "1px solid #ddd", borderRadius: 1 }}
        >
          <Typography variant="subtitle1">{item.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            {item.player} · {item.year} · ${(item.priceCents / 100).toFixed(2)}
          </Typography>
        </Box>
      ))}
      <Box
        ref={ref}
        sx={{
          height: 40,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {isFetchingNextPage && <CircularProgress size={24} />}
      </Box>
    </Box>
  );
}
