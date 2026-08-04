import { Card, CardContent, CardMedia, Typography } from "@mui/material";
import type { Item } from "@/mocks/data";
import { memo, useEffect, useRef, useState } from "react";

interface ItemCardProps {
  item: Item;
  onSelect: (id: string) => void;
}

const cardSx = {
  cursor: "pointer",
  height: "100%",
  display: "flex",
  flexDirection: "column",
} as const;

export const ItemCard = memo(function ItemCard({
  item,
  onSelect,
}: ItemCardProps) {
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevPrice = useRef(item.priceCents);

  useEffect(() => {
    if (item.priceCents !== prevPrice.current) {
      setFlash(item.priceCents > prevPrice.current ? "up" : "down");
      prevPrice.current = item.priceCents;
      const t = setTimeout(() => setFlash(null), 700);
      return () => clearTimeout(t);
    }
  }, [item.priceCents]);

  return (
    <Card onClick={() => onSelect(item.id)} sx={cardSx}>
      <CardMedia
        component="img"
        height={220}
        image={item.imageUrl}
        alt={item.name}
      />{" "}
      <CardContent>
        <Typography variant="subtitle1" noWrap>
          {item.name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {item.player} · {item.year}
        </Typography>
        <Typography variant="body2">Grade {item.grade}</Typography>
        <Typography
          variant="h6"
          sx={{
            transition: "color 0.15s ease, transform 0.15s ease",
            color:
              flash === "up"
                ? "success.main"
                : flash === "down"
                  ? "error.main"
                  : "text.primary",
            transform: flash ? "scale(1.08)" : "scale(1)",
          }}
        >
          ${(item.priceCents / 100).toFixed(2)}
        </Typography>
      </CardContent>
    </Card>
  );
});
