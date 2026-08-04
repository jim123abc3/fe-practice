import {
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { postOffer, type OfferInput } from "@/api/offers";
import { itemKeys } from "@/api/queryKeys";
import type { Item } from "@/mocks/data";
import type { ItemsPage } from "@/pages/api/items";

const LIST_KEY = [...itemKeys.all, "list"];

export function useMakeOffer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: postOffer,

    onMutate: async ({ itemId, amountCents }: OfferInput) => {
      // 1. stop in-flight GETs that could land after our optimistic write
      await queryClient.cancelQueries({ queryKey: itemKeys.detail(itemId) });
      await queryClient.cancelQueries({ queryKey: LIST_KEY });

      // 2. snapshot what we're about to change, for rollback
      const previousDetail = queryClient.getQueryData<Item>(
        itemKeys.detail(itemId),
      );
      const previousLists = queryClient.getQueriesData<InfiniteData<ItemsPage>>(
        { queryKey: LIST_KEY },
      );

      // 3a. optimistic write to the detail cache
      queryClient.setQueryData<Item>(itemKeys.detail(itemId), (old) =>
        old ? { ...old, priceCents: amountCents } : old,
      );

      // 3b. optimistic write to the item inside every cached list
      queryClient.setQueriesData<InfiniteData<ItemsPage>>(
        { queryKey: LIST_KEY },
        (old) =>
          old && {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((i) =>
                i.id === itemId ? { ...i, priceCents: amountCents } : i,
              ),
            })),
          },
      );

      // 4. pass snapshots to onError via context
      return { previousDetail, previousLists };
    },
    onError: (_err, { itemId }, ctx) => {
      if (ctx?.previousDetail) {
        queryClient.setQueryData(itemKeys.detail(itemId), ctx.previousDetail);
      }
      ctx?.previousLists?.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
    },
    onSettled: (_data, _err, { itemId }) => {
      queryClient.invalidateQueries({ queryKey: itemKeys.detail(itemId) });
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
    },
  });
}
