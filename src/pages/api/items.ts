import type { NextApiRequest, NextApiResponse } from "next";
import { ALL_ITEMS, type Item } from "@/mocks/data";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ItemsPage {
  items: Item[];
  nextCursor: number | null;
  prevCursor: number | null;
  total: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ItemsPage | { error: string }>,
) {
  const {
    cursor = "0",
    limit = "20",
    q = "",
    sort = "relevance",
    category = "",
    flaky = "0",
    delay = "",
  } = req.query as Record<string, string>;

  await sleep(delay ? Number(delay) : 250 + Math.random() * 450);
  if (Math.random() < Number(flaky))
    return res.status(500).json({ error: "upstream exploded" });

  let rows = ALL_ITEMS;
  if (category) rows = rows.filter((i) => i.category === category);
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter(
      (i) =>
        i.name.toLowerCase().includes(needle) ||
        i.player.toLowerCase().includes(needle),
    );
  }
  if (sort === "price_asc")
    rows = [...rows].sort((a, b) => a.priceCents - b.priceCents);
  if (sort === "price_desc")
    rows = [...rows].sort((a, b) => b.priceCents - a.priceCents);
  if (sort === "newest")
    rows = [...rows].sort(
      (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt),
    );

  const start = Number(cursor);
  const size = Math.min(Number(limit), 100);
  const items = rows.slice(start, start + size);
  const nextCursor = start + size < rows.length ? start + size : null;
  const prevCursor = start > 0 ? Math.max(0, start - size) : null;

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ items, nextCursor, prevCursor, total: rows.length });
}
