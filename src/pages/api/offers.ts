import { ALL_ITEMS } from "@/mocks/data";
import type { NextApiRequest, NextApiResponse } from "next";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface OfferResponse {
  itemId: string;
  amountCents: number;
  accepted: boolean;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<OfferResponse | { error: string }>,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }

  const { itemId, amountCents } = req.body as {
    itemId?: string;
    amountCents?: number;
  };

  if (!itemId || typeof amountCents !== "number") {
    return res.status(400).json({ error: "itemId and amountCents required" });
  }

  await sleep(600);

  if (Math.random() < 0.3) {
    return res.status(409).json({ error: "Offer rejected" });
  }

  // persist to the in-memory dataset so the invalidation refetch reflects it
  const item = ALL_ITEMS.find((i) => i.id === itemId);
  if (item) item.priceCents = amountCents;

  res.status(200).json({ itemId, amountCents, accepted: true });
}
