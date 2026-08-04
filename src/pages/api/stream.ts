import type { NextApiRequest, NextApiResponse } from "next";
import { ALL_ITEMS } from "@/mocks/data";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  const timer = setInterval(() => {
    const item = ALL_ITEMS[Math.floor(Math.random() * 200)];
    const delta = Math.floor((Math.random() - 0.45) * 5000);
    res.write(
      `data: ${JSON.stringify({ id: item.id, priceCents: Math.max(100, item.priceCents + delta), at: Date.now() })}\n\n`,
    );
  }, 600);
  res.on("close", () => {
    clearInterval(timer);
    res.end();
  });
}
