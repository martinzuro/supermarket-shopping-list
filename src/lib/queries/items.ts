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
import { RequestError, unwrap } from "./errors";
import { queryKeys } from "./keys";

export type Item = Tables<"items">;

async function fetchItems(listId: string): Promise<Item[]> {
  return unwrap(
    await createClient()
      .from("items")
      .select("*")
      .eq("list_id", listId)
      .is("deleted_at", null)
      .order("position", { ascending: true }),
  );
}

export function useItems(userId: string | null, listId: string | null) {
  const queryClient = useQueryClient();
  const key = queryKeys.items(userId ?? "", listId ?? "");
  // A refetch while a write is in flight would bring back the server state
  // without it, and the row would jump back until the write settles. The
  // last write refetches on its own (see settle).
  const idle = () => queryClient.isMutating({ mutationKey: key }) === 0;
  return useQuery({
    queryKey: key,
    queryFn: () => fetchItems(listId!),
    enabled: userId !== null && listId !== null,
    refetchOnWindowFocus: idle,
    refetchOnReconnect: idle,
  });
}

export type NewItem = {
  /** Client-generated UUID v7 (plan 3.2), so the UI knows it before the server. */
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
};

export function newItem(
  name: string,
  details: { quantity?: number | null; unit?: string | null } = {},
): NewItem {
  return {
    id: newId(),
    name: name.trim(),
    quantity: details.quantity ?? null,
    unit: details.unit ?? null,
  };
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
    quantity: input.quantity,
    unit: input.unit,
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

/**
 * A write that hangs (signal but no packets) would block the list's queue of
 * writes for minutes. After this long it is aborted, which postgrest-js
 * reports as status 0, so it is retried like any lost request.
 */
const WRITE_TIMEOUT_MS = 10_000;

/** Postgres unique_violation. */
const DUPLICATE_KEY = "23505";

async function fetchItem(id: string): Promise<Item> {
  return unwrap(
    await createClient()
      .from("items")
      .select("*")
      .eq("id", id)
      .abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS))
      .single(),
  );
}

async function insertItem(
  input: NewItem,
  listId: string,
  position: number,
): Promise<Item> {
  try {
    return unwrap(
      await createClient()
        .from("items")
        .insert({
          id: input.id,
          list_id: listId,
          name: input.name,
          quantity: input.quantity,
          unit: input.unit,
          position,
        })
        .select()
        .abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS))
        .single(),
    );
  } catch (error) {
    // A retry after a lost answer: the first attempt was saved. The id is
    // generated on the client, so a duplicate id can only be this same item.
    if (error instanceof RequestError && error.code === DUPLICATE_KEY) {
      return fetchItem(input.id);
    }
    throw error;
  }
}

async function updateItem(
  id: string,
  changes: Partial<Pick<Item, "checked" | "checked_at">>,
): Promise<Item> {
  return unwrap(
    await createClient()
      .from("items")
      .update(changes)
      .eq("id", id)
      .select()
      .abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS))
      .single(),
  );
}

function setItems(
  queryClient: QueryClient,
  key: readonly unknown[],
  update: (items: Item[]) => Item[],
) {
  queryClient.setQueryData<Item[]>(key, (items) => update(items ?? []));
}

function patchItem(
  queryClient: QueryClient,
  key: readonly unknown[],
  id: string,
  update: (item: Item) => Item,
) {
  setItems(queryClient, key, (items) =>
    items.map((item) => (item.id === id ? update(item) : item)),
  );
}

function findItem(
  queryClient: QueryClient,
  key: readonly unknown[],
  id: string,
) {
  return queryClient.getQueryData<Item[]>(key)?.find((item) => item.id === id);
}

function nextPosition(items: Item[]) {
  return items.reduce((max, item) => Math.max(max, item.position), -1) + 1;
}

/**
 * Every write to a list's items runs in one queue (TanStack Query runs
 * mutations of the same scope in series, retries included). The UI does not
 * wait for it: each change is applied to the cache at once. The queue keeps
 * the server in the user's order: a check made while the insert is still in
 * flight reaches the server after the row exists, and two quick toggles of
 * the same row cannot land the wrong way round.
 */
function listScope(listId: string) {
  return { id: `items:${listId}` };
}

/** True when no later write to the same item is queued or running. */
function isLastWriteTo(queryClient: QueryClient, listId: string, id: string) {
  const scope = listScope(listId).id;
  const pending = queryClient.getMutationCache().findAll({
    status: "pending",
    predicate: (mutation) =>
      mutation.options.scope?.id === scope &&
      (mutation.state.variables as { id?: string } | undefined)?.id === id,
  });
  return pending.length <= 1;
}

/**
 * Refetches once the last item mutation in flight settles. Refetching after
 * each one would bring back the server state without the optimistic changes
 * still pending, and those rows would flicker.
 */
function settle(queryClient: QueryClient, key: readonly unknown[]) {
  if (queryClient.isMutating({ mutationKey: key }) > 1) return;
  return queryClient.invalidateQueries({ queryKey: key });
}

/** Mutation keys of the item writes, under the items query key. */
export const itemMutationKeys = {
  all: queryKeys.items,
  add: (userId: string, listId: string) =>
    [...queryKeys.items(userId, listId), "add"] as const,
  toggle: (userId: string, listId: string) =>
    [...queryKeys.items(userId, listId), "toggle"] as const,
};

/**
 * Reference implementation of the optimistic mutation pattern (plan 2.3).
 * Every write in the app follows these steps:
 *
 * 1. `onMutate`: cancel in-flight fetches of the affected query and write the
 *    optimistic row into the cache. The UI updates at once because it renders
 *    the cache.
 * 2. `onError`: undo only this mutation's change (here, drop the row), never
 *    by restoring a snapshot of the whole list: with two adds in a row, the
 *    snapshot of the first would also erase the second. The caller shows the
 *    notice and, for the add input, puts the text back (plan 3.3).
 * 3. `onSuccess`: replace the optimistic row with the row the server
 *    returned (same id, so nothing moves), unless a later write to the same
 *    item is pending: its optimistic state is the newer one.
 * 4. `onSettled`: once no other item write is in flight, invalidate the
 *    query so the cache converges with the server, including changes made by
 *    other members meanwhile.
 *
 * The id is generated on the client, so the optimistic row and the server
 * row are the same entity; that is what makes step 3 a no-op visually.
 */
export function useAddItem(userId: string, listId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.items(userId, listId);

  return useMutation({
    mutationKey: itemMutationKeys.add(userId, listId),
    scope: listScope(listId),
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
      setItems(queryClient, key, (items) => [
        ...items,
        optimisticItem(input, listId, userId, nextPosition(items)),
      ]);
    },
    onError: (_error, input) => {
      setItems(queryClient, key, (items) =>
        items.filter((item) => item.id !== input.id),
      );
    },
    onSuccess: (created) => {
      if (!isLastWriteTo(queryClient, listId, created.id)) return;
      patchItem(queryClient, key, created.id, () => created);
    },
    onSettled: () => settle(queryClient, key),
  });
}

export type ToggleItem = {
  id: string;
  /** For the notice if the server rejects the change. */
  name: string;
  checked: boolean;
};

/**
 * Checks or unchecks an item: it moves between "Pendientes" and "En el carro"
 * at once. Same pattern as useAddItem; the rollback restores the item's
 * previous check state only if no later toggle has overwritten it. When two
 * quick toggles are both rejected, the second restores the first one's
 * (rejected) state for a moment: the refetch of settle corrects it.
 */
export function useToggleItem(userId: string, listId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.items(userId, listId);

  return useMutation({
    mutationKey: itemMutationKeys.toggle(userId, listId),
    scope: listScope(listId),
    mutationFn: async ({ id, checked }: ToggleItem) => {
      const item = findItem(queryClient, key, id);
      // The insert this toggle queued behind was rejected and its row is
      // gone: there is nothing to update, and the add already showed its
      // notice. The server gets the same check time the cache shows.
      if (!item) return null;
      return updateItem(id, {
        checked,
        checked_at: checked
          ? (item.checked_at ?? new Date().toISOString())
          : null,
      });
    },
    onMutate: async ({ id, checked }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = findItem(queryClient, key, id);
      if (!previous) return { previous };
      const checkedAt = checked ? new Date().toISOString() : null;
      patchItem(queryClient, key, id, (item) => ({
        ...item,
        checked,
        checked_at: checkedAt,
      }));
      return { previous, checkedAt };
    },
    onError: (_error, { id, checked }, context) => {
      const previous = context?.previous;
      if (!previous) return;
      patchItem(queryClient, key, id, (item) =>
        // A later toggle already wrote its own state: keep it.
        item.checked === checked && item.checked_at === context.checkedAt
          ? {
              ...item,
              checked: previous.checked,
              checked_at: previous.checked_at,
            }
          : item,
      );
    },
    onSuccess: (updated) => {
      if (!updated || !isLastWriteTo(queryClient, listId, updated.id)) return;
      patchItem(queryClient, key, updated.id, () => updated);
    },
    onSettled: () => settle(queryClient, key),
  });
}
