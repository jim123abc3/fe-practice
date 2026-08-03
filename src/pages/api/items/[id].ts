import type { NextApiRequest, NextApiResponse } from "next";
import { ALL_ITEMS, type Item } from "@/mocks/data";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Item | { error: string }>,
) {
  const { id, flaky = "0", delay = "" } = req.query as Record<string, string>;

  await sleep(delay ? Number(delay) : 250 + Math.random() * 450);
  if (Math.random() < Number(flaky))
    return res.status(500).json({ error: "upstream exploded" });

  const item = ALL_ITEMS.find((i) => i.id === id);
  if (!item) return res.status(404).json({ error: "item not found" });

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(item);
}
