import { type ItemFilters } from "@/pages/api/items";

export const itemKeys = {
  all: ["items"] as const,
  lists: (f: ItemFilters) => [...itemKeys.all, "list", f] as const,
  detail: (id: string) => [...itemKeys.all, "detail", id] as const,
};
