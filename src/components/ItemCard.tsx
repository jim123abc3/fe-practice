import { Card, CardContent, CardMedia, Typography } from "@mui/material";
import type { Item } from "@/mocks/data";
import { memo } from "react";

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
        <Typography variant="h6">
          ${(item.priceCents / 100).toFixed(2)}
        </Typography>
      </CardContent>
    </Card>
  );
});
