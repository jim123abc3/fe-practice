import { useState } from "react";
import { useRouter } from "next/router";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  TextField,
} from "@mui/material";
import { fetchItem } from "@/api/items";
import { itemKeys } from "@/api/queryKeys";
import { useMakeOffer } from "@/hooks/useMakeOffer";

export default function ItemDetailPage() {
  const router = useRouter();
  const id = router.query.id as string;
  const [amount, setAmount] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: itemKeys.detail(id),
    queryFn: ({ signal }) => fetchItem(id, signal),
    enabled: !!id,
  });

  const makeOffer = useMakeOffer();

  const handleOffer = () => {
    const amountCents = Math.round(Number(amount) * 100);
    if (!id || !amountCents) return;
    makeOffer.mutate({ itemId: id, amountCents });
  };

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
          <Box sx={{ mt: 3, display: "flex", gap: 2, alignItems: "center" }}>
            <TextField
              label="Offer ($)"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              size="small"
            />
            <Button
              variant="contained"
              onClick={handleOffer}
              disabled={makeOffer.isPending}
            >
              {makeOffer.isPending ? "Submitting..." : "Make offer"}
            </Button>
          </Box>

          {makeOffer.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {makeOffer.error.message}
            </Alert>
          )}
          {makeOffer.isSuccess && (
            <Alert severity="success" sx={{ mt: 2 }}>
              Offer accepted
            </Alert>
          )}
        </Box>
      )}
    </Box>
  );
}
