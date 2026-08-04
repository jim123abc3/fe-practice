import { http, HttpResponse } from "msw";
import type { Item } from "@/mocks/data";
import type { ItemsPage } from "@/pages/api/items";

// Small, deterministic fixtures — nothing like the real 5000-item generator.
// Tests assert against these exact names/prices, so keep them stable.
const TEST_ITEMS: Item[] = [
  {
    id: "item_a",
    name: "Test Card A",
    player: "Ada",
    year: 2020,
    setName: "Topps",
    grade: 9,
    priceCents: 1000,
    category: "card",
    imageUrl: "https://example.com/a.jpg",
    updatedAt: "2020-01-01T00:00:00.000Z",
  },
  {
    id: "item_b",
    name: "Test Card B",
    player: "Bob",
    year: 2021,
    setName: "Prizm",
    grade: 9,
    priceCents: 2000,
    category: "card",
    imageUrl: "https://example.com/b.jpg",
    updatedAt: "2020-01-01T00:00:00.000Z",
  },
];

// The default happy-path handler. `*/api/items` matches the path on ANY origin,
// so it doesn't matter what host our fetch resolves to. Individual tests can
// override this with server.use(...) to simulate errors.
export const handlers = [
  http.get("*/api/items", () => {
    const page: ItemsPage = {
      items: TEST_ITEMS,
      nextCursor: null,
      prevCursor: null,
      total: TEST_ITEMS.length,
    };
    return HttpResponse.json(page);
  }),
];
