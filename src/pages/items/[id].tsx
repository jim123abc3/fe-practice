import { useRouter } from "next/router";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
} from "@mui/material";
import { fetchItem } from "@/api/items";
import { itemKeys } from "@/api/queryKeys";

export default function ItemDetailPage() {
  const router = useRouter();
  const id = router.query.id as string;

  const { data, isLoading, isError } = useQuery({
    queryKey: itemKeys.detail(id),
    queryFn: ({ signal }) => fetchItem(id, signal),
    enabled: !!id,
  });

  return (
    <Box sx={{ p: 3 }}>
      <Button onClick={() => router.back()}>Back</Button>
      {isLoading && <CircularProgress />}
      {isError && <Alert severity="error">Failed to load item</Alert>}
      {data && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="h5">{data.name}</Typography>
          <Typography>
            {data.player} - {data.year}
          </Typography>
          <Typography>Grade {data.grade}</Typography>
          <Typography variant="h6">
            ${(data.priceCents / 100).toFixed(2)}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
