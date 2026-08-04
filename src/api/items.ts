import { Item } from "@/mocks/data";
import type { ItemsPage } from "@/pages/api/items";

export interface ItemFilters {
  q?: string;
  category?: string;
  sort?: "relevance" | "price_asc" | "price_desc" | "newest";
  cursor?: number;
  limit?: number;
}

export async function fetchItems(
  params: ItemFilters,
  signal?: AbortSignal,
): Promise<ItemsPage> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.category) search.set("category", params.category);
  if (params.sort) search.set("sort", params.sort);
  if (params.cursor != null) search.set("cursor", String(params.cursor));
  if (params.limit != null) search.set("limit", String(params.limit));

  const res = await fetch(`/api/items?${search.toString()}`, { signal });
  if (!res.ok) throw new Error(`fetchItems failed: ${res.status}`);
  return res.json();
}

export async function fetchItem(
  id: string,
  signal?: AbortSignal,
): Promise<Item> {
  const res = await fetch(`/api/items/${id}`, { signal });

  if (!res.ok) throw new Error(`fetchItem failed: ${res.status}`);

  return res.json();
}
