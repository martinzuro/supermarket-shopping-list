"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { newId, normalizeName } from "@/lib/domain";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import { queryKeys } from "./keys";

export type Item = Tables<"items">;

async function fetchItems(listId: string): Promise<Item[]> {
  const { data, error } = await createClient()
    .from("items")
    .select("*")
    .eq("list_id", listId)
    .is("deleted_at", null)
    .order("position", { ascending: true });
  if (error) throw error;
  return data;
}

export function useItems(userId: string | null, listId: string | null) {
  return useQuery({
    queryKey: queryKeys.items(userId ?? "", listId ?? ""),
    queryFn: () => fetchItems(listId!),
    enabled: userId !== null && listId !== null,
  });
}

export type NewItem = {
  /** Client-generated UUID v7 (plan 3.2), so the UI knows it before the server. */
  id: string;
  name: string;
};

export function newItem(name: string): NewItem {
  return { id: newId(), name: name.trim() };
}

function optimisticItem(
  input: NewItem,
  listId: string,
  userId: string,
  position: number,
): Item {
  const now = new Date().toISOString();
  return {
    id: input.id,
    list_id: listId,
    name: input.name,
    name_normalized: normalizeName(input.name),
    quantity: null,
    unit: null,
    note: null,
    category_id: null,
    estimated_price: null,
    currency: "UYU",
    checked: false,
    checked_at: null,
    position,
    created_by: userId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}

async function insertItem(
  input: NewItem,
  listId: string,
  position: number,
): Promise<Item> {
  const { data, error } = await createClient()
    .from("items")
    .insert({ id: input.id, list_id: listId, name: input.name, position })
    .select()
    .single();
  if (error) throw error;
  return data;
}

function setItems(
  queryClient: QueryClient,
  key: readonly unknown[],
  update: (items: Item[]) => Item[],
) {
  queryClient.setQueryData<Item[]>(key, (items) => update(items ?? []));
}

function nextPosition(items: Item[]) {
  return items.reduce((max, item) => Math.max(max, item.position), -1) + 1;
}

/**
 * Reference implementation of the optimistic mutation pattern (plan 2.3).
 * Every write in the app follows these steps:
 *
 * 1. `onMutate`: cancel in-flight fetches of the affected query, snapshot its
 *    data, write the optimistic row into the cache and return the snapshot.
 *    The UI updates at once because it renders the cache.
 * 2. `onError`: restore the snapshot. The caller shows a toast and, for the
 *    add input, puts the text back (plan 3.3).
 * 3. `onSuccess`: replace the optimistic row with the row the server
 *    returned (same id, so nothing moves).
 * 4. `onSettled`: invalidate the query so the cache converges with the
 *    server, including changes made by other members meanwhile.
 *
 * The id is generated on the client, so the optimistic row and the server
 * row are the same entity; that is what makes step 3 a no-op visually.
 */
export function useAddItem(userId: string, listId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.items(userId, listId);

  return useMutation({
    mutationFn: (input: NewItem) => {
      const items = queryClient.getQueryData<Item[]>(key) ?? [];
      const current = items.find((item) => item.id === input.id);
      return insertItem(
        input,
        listId,
        current?.position ?? nextPosition(items),
      );
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Item[]>(key);
      setItems(queryClient, key, (items) => [
        ...items,
        optimisticItem(input, listId, userId, nextPosition(items)),
      ]);
      return { previous };
    },
    onError: (_error, _input, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
    onSuccess: (created) => {
      setItems(queryClient, key, (items) =>
        items.map((item) => (item.id === created.id ? created : item)),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
