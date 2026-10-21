"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  DEFAULT_CURRENCY,
  compareServerOrder,
  compareTimestamps,
  newId,
  normalizeName,
} from "@/lib/domain";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import { DUPLICATE_KEY, RequestError, unwrap, writeSignal } from "./errors";
import { queryKeys } from "./keys";
import { isOwnVersion, readAgain, rememberOwn } from "./reconcile";
import type { TripHistory } from "./trips";

export type Item = Tables<"items">;

async function fetchItems(listId: string): Promise<Item[]> {
  return unwrap(
    await createClient()
      .from("items")
      .select("*")
      .eq("list_id", listId)
      .is("deleted_at", null)
      // Two members adding at once can write the same position: the
      // creation time, then the id, keep the order stable across fetches.
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  );
}

export function useItems(userId: string | null, listId: string | null) {
  const queryClient = useQueryClient();
  const key = queryKeys.items(userId ?? "", listId ?? "");
  // A refetch while a write is in flight would bring back the server state
  // without it, and the row would jump back until the write settles. The
  // last write refetches on its own (see settle). Otherwise, coming back to
  // the tab or to the network reads the list even when the data is fresh:
  // Realtime events may have been lost meanwhile (a frozen tab, a dead
  // socket not yet noticed).
  const whenIdle = () =>
    queryClient.isMutating({ mutationKey: key }) === 0 ? "always" : false;
  return useQuery({
    queryKey: key,
    queryFn: () => fetchItems(listId!),
    enabled: userId !== null && listId !== null,
    refetchOnWindowFocus: whenIdle,
    refetchOnReconnect: whenIdle,
  });
}

export type NewItem = {
  /** Client-generated UUID v7 (plan 3.2), so the UI knows it before the server. */
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  /** Chosen by the caller from the catalog (see suggestCategory). */
  category_id: string | null;
  /** The last price the catalog remembers, if any (see rememberedPrice). */
  estimated_price: number | null;
  currency: string;
};

export function newItem(
  name: string,
  details: {
    quantity?: number | null;
    unit?: string | null;
    categoryId?: string | null;
    price?: { price: number; currency: string } | null;
  } = {},
): NewItem {
  return {
    id: newId(),
    name: name.trim(),
    quantity: details.quantity ?? null,
    unit: details.unit ?? null,
    category_id: details.categoryId ?? null,
    estimated_price: details.price?.price ?? null,
    currency: details.price?.currency ?? DEFAULT_CURRENCY,
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
    category_id: input.category_id,
    estimated_price: input.estimated_price,
    currency: input.currency,
    checked: false,
    checked_at: null,
    position,
    created_by: userId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    trip_id: null,
  };
}

async function fetchItem(id: string): Promise<Item> {
  return unwrap(
    await createClient()
      .from("items")
      .select("*")
      .eq("id", id)
      .abortSignal(writeSignal())
      .single(),
  );
}

/** The columns an insert sends: what the user chose, at its position. */
function rowOf(input: NewItem, listId: string, position: number) {
  return {
    id: input.id,
    list_id: listId,
    name: input.name,
    quantity: input.quantity,
    unit: input.unit,
    category_id: input.category_id,
    estimated_price: input.estimated_price,
    currency: input.currency,
    position,
  };
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
        .insert(rowOf(input, listId, position))
        .select()
        .abortSignal(writeSignal())
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

async function insertItems(
  inputs: readonly NewItem[],
  listId: string,
  positions: readonly number[],
): Promise<Item[]> {
  try {
    return unwrap(
      await createClient()
        .from("items")
        .insert(inputs.map((input, n) => rowOf(input, listId, positions[n])))
        .select()
        .abortSignal(writeSignal()),
    );
  } catch (error) {
    // One request is one transaction: a duplicate id on a retry means the
    // first attempt saved them all.
    if (error instanceof RequestError && error.code === DUPLICATE_KEY) {
      return unwrap(
        await createClient()
          .from("items")
          .select("*")
          .in(
            "id",
            inputs.map((input) => input.id),
          )
          .abortSignal(writeSignal()),
      );
    }
    throw error;
  }
}

type ItemChanges = Partial<
  Pick<
    Item,
    | "name"
    | "quantity"
    | "unit"
    | "note"
    | "category_id"
    | "estimated_price"
    | "currency"
    | "checked"
    | "checked_at"
    | "deleted_at"
  >
>;

async function updateItem(id: string, changes: ItemChanges): Promise<Item> {
  return unwrap(
    await createClient()
      .from("items")
      .update(changes)
      .eq("id", id)
      .select()
      .abortSignal(writeSignal())
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
export function listScope(listId: string) {
  return { id: `items:${listId}` };
}

/**
 * Writes to the item queued or running in the list's queue. A write counts
 * until its callbacks are done, the refetch of settle included.
 */
function pendingWritesTo(queryClient: QueryClient, listId: string, id: string) {
  const scope = listScope(listId).id;
  return queryClient.getMutationCache().findAll({
    status: "pending",
    predicate: (mutation) => {
      if (mutation.options.scope?.id !== scope) return false;
      const variables = mutation.state.variables as
        { id?: string; ids?: readonly string[] } | undefined;
      return variables?.id === id || variables?.ids?.includes(id) === true;
    },
  }).length;
}

/** True when no later write to the same item is queued or running. */
function isLastWriteTo(queryClient: QueryClient, listId: string, id: string) {
  return pendingWritesTo(queryClient, listId, id) <= 1;
}

/**
 * Refetches once the last item mutation in flight settles. Refetching after
 * each one would bring back the server state without the optimistic changes
 * still pending, and those rows would flicker.
 */
export function settle(queryClient: QueryClient, key: readonly unknown[]) {
  if (queryClient.isMutating({ mutationKey: key }) > 1) return;
  // The catalog changes with adds and edits (database triggers); the next
  // add reads it to pick the category.
  const catalogKey = [...key.slice(0, -1), "catalog"];
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: key }),
    queryClient.invalidateQueries({ queryKey: catalogKey }),
  ]);
}

/** Mutation keys of the item writes, under the items query key. */
export const itemMutationKeys = {
  all: queryKeys.items,
  add: (userId: string, listId: string) =>
    [...queryKeys.items(userId, listId), "add"] as const,
  toggle: (userId: string, listId: string) =>
    [...queryKeys.items(userId, listId), "toggle"] as const,
  edit: (userId: string, listId: string) =>
    [...queryKeys.items(userId, listId), "edit"] as const,
  remove: (userId: string, listId: string) =>
    [...queryKeys.items(userId, listId), "remove"] as const,
  emptyCart: (userId: string, listId: string) =>
    [...queryKeys.items(userId, listId), "empty-cart"] as const,
  /** Items brought from another list (merge.ts). */
  merge: (userId: string, listId: string) =>
    [...queryKeys.items(userId, listId), "merge"] as const,
  carryOver: (userId: string, listId: string) =>
    [...queryKeys.items(userId, listId), "carry-over"] as const,
  /** Several items at once ("lo de siempre"). */
  addMany: (userId: string, listId: string) =>
    [...queryKeys.items(userId, listId), "add-many"] as const,
  /** Taking back the items of an add of several. */
  undoAdd: (userId: string, listId: string) =>
    [...queryKeys.items(userId, listId), "undo-add"] as const,
  /** Bringing back what an emptying of the cart archived (A-4). */
  restoreCart: (userId: string, listId: string) =>
    [...queryKeys.items(userId, listId), "restore-cart"] as const,
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
      rememberOwn(queryClient, listId, [created]);
      if (!isLastWriteTo(queryClient, listId, created.id)) return;
      patchItem(queryClient, key, created.id, () => created);
    },
    onSettled: () => settle(queryClient, key),
  });
}

export type AddItems = {
  /** The new items' ids, in order: the writes queued after this one find it by them. */
  ids: readonly string[];
  items: readonly NewItem[];
};

/** The variables of useAddItems for these new items. */
export function addItems(items: readonly NewItem[]): AddItems {
  return { ids: items.map((item) => item.id), items };
}

/**
 * Adds several items in one write ("lo de siempre"): one request, so the
 * server saves them all or none, and the same pattern as useAddItem. They
 * go after the list's items, in the given order. A rejection drops them all;
 * the caller shows the notice.
 */
export function useAddItems(userId: string, listId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.items(userId, listId);

  return useMutation({
    mutationKey: itemMutationKeys.addMany(userId, listId),
    scope: listScope(listId),
    mutationFn: ({ items: inputs }: AddItems) => {
      const items = queryClient.getQueryData<Item[]>(key) ?? [];
      const next = nextPosition(items);
      return insertItems(
        inputs,
        listId,
        inputs.map(
          (input, n) =>
            items.find((item) => item.id === input.id)?.position ?? next + n,
        ),
      );
    },
    onMutate: async ({ items: inputs }) => {
      await queryClient.cancelQueries({ queryKey: key });
      setItems(queryClient, key, (items) => {
        const next = nextPosition(items);
        return [
          ...items,
          ...inputs.map((input, n) =>
            optimisticItem(input, listId, userId, next + n),
          ),
        ];
      });
    },
    onError: (_error, { ids }) => {
      setItems(queryClient, key, (items) =>
        items.filter((item) => !ids.includes(item.id)),
      );
    },
    onSuccess: (created) => {
      rememberOwn(queryClient, listId, created);
      for (const row of created) {
        if (isLastWriteTo(queryClient, listId, row.id)) {
          patchItem(queryClient, key, row.id, () => row);
        }
      }
    },
    onSettled: () => settle(queryClient, key),
  });
}

export type UndoAdd = {
  /** The items an add of several put on the list. */
  ids: readonly string[];
  /** One archive time for the whole undo, kept across retries. */
  deletedAt: string;
};

/**
 * Takes back what an add of several put on the list: the ones still
 * pending are archived (deleted_at, plan 3.2), with one timestamp and one
 * request, as useEmptyCart does with the cart. One already checked stays:
 * it is in the cart. It runs after the add in the list's queue; if the add
 * was rejected there is nothing left to take back.
 */
export function useUndoAdd(userId: string, listId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.items(userId, listId);

  return useMutation({
    mutationKey: itemMutationKeys.undoAdd(userId, listId),
    scope: listScope(listId),
    mutationFn: async ({ ids, deletedAt }: UndoAdd) => {
      const items = queryClient.getQueryData<Item[]>(key) ?? [];
      const ours = items
        .filter((item) => ids.includes(item.id))
        .filter((item) => item.deleted_at === deletedAt && !item.checked)
        .map((item) => item.id);
      if (ours.length === 0) return [];
      return archivePending(ours, deletedAt);
    },
    onMutate: async ({ ids, deletedAt }) => {
      await queryClient.cancelQueries({ queryKey: key });
      setItems(queryClient, key, (items) =>
        items.map((item) =>
          ids.includes(item.id) && item.deleted_at === null && !item.checked
            ? { ...item, deleted_at: deletedAt }
            : item,
        ),
      );
    },
    onError: (_error, { ids, deletedAt }) => {
      setItems(queryClient, key, (items) =>
        items.map((item) =>
          ids.includes(item.id) && item.deleted_at === deletedAt
            ? { ...item, deleted_at: null }
            : item,
        ),
      );
    },
    onSuccess: (archived) => {
      rememberOwn(queryClient, listId, archived);
      for (const row of archived) {
        if (isLastWriteTo(queryClient, listId, row.id)) {
          patchItem(queryClient, key, row.id, () => row);
        }
      }
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
      rememberOwn(queryClient, listId, [updated]);
      if (!updated || !isLastWriteTo(queryClient, listId, updated.id)) return;
      patchItem(queryClient, key, updated.id, () => updated);
    },
    onSettled: () => settle(queryClient, key),
  });
}

export type EditableFields = Pick<
  Item,
  | "name"
  | "quantity"
  | "unit"
  | "note"
  | "category_id"
  | "estimated_price"
  | "currency"
>;

export type EditItem = {
  id: string;
  /** Name before the edit, for the notice if the server rejects it. */
  name: string;
  /** Only the fields that changed. */
  changes: Partial<EditableFields>;
};

function withChanges(item: Item, changes: Partial<EditableFields>): Item {
  return {
    ...item,
    ...changes,
    name_normalized:
      changes.name === undefined
        ? item.name_normalized
        : normalizeName(changes.name),
  };
}

/** True when the item still shows every value this write put there. */
function stillShows(item: Item, changes: Partial<EditableFields>) {
  return (Object.keys(changes) as (keyof EditableFields)[]).every(
    (field) => item[field] === changes[field],
  );
}

/**
 * Edits name, quantity, unit, note, category, price and currency. Same
 * pattern as
 * useToggleItem: only the changed fields are sent, and a rejected edit
 * restores them unless a later edit already replaced them.
 */
export function useEditItem(userId: string, listId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.items(userId, listId);

  return useMutation({
    mutationKey: itemMutationKeys.edit(userId, listId),
    scope: listScope(listId),
    mutationFn: async ({ id, changes }: EditItem) => {
      // Gone (its insert was rejected): nothing to update.
      if (!findItem(queryClient, key, id)) return null;
      return updateItem(id, changes);
    },
    onMutate: async ({ id, changes }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = findItem(queryClient, key, id);
      if (previous) {
        patchItem(queryClient, key, id, (item) => withChanges(item, changes));
      }
      return { previous };
    },
    onError: (_error, { id, changes }, context) => {
      const previous = context?.previous;
      if (!previous) return;
      const restore = Object.fromEntries(
        Object.keys(changes).map((field) => [
          field,
          previous[field as keyof EditableFields],
        ]),
      ) as Partial<EditableFields>;
      patchItem(queryClient, key, id, (item) =>
        stillShows(item, changes) ? withChanges(item, restore) : item,
      );
    },
    onSuccess: (updated) => {
      rememberOwn(queryClient, listId, [updated]);
      if (!updated || !isLastWriteTo(queryClient, listId, updated.id)) return;
      patchItem(queryClient, key, updated.id, () => updated);
    },
    onSettled: () => settle(queryClient, key),
  });
}

export type RemoveItem = {
  id: string;
  /** For the notice if the server rejects it. */
  name: string;
};

/**
 * Deletes an item. It is a soft delete (deleted_at, plan 3.2): the row stays
 * in the cache marked as deleted, so every view drops it at once, and a
 * rejection only has to clear the mark to bring it back in its place.
 */
export function useRemoveItem(userId: string, listId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.items(userId, listId);

  return useMutation({
    mutationKey: itemMutationKeys.remove(userId, listId),
    scope: listScope(listId),
    mutationFn: async ({ id }: RemoveItem) => {
      const item = findItem(queryClient, key, id);
      if (!item) return null;
      return updateItem(id, {
        deleted_at: item.deleted_at ?? new Date().toISOString(),
      });
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: key });
      if (!findItem(queryClient, key, id)) return { deletedAt: null };
      const deletedAt = new Date().toISOString();
      patchItem(queryClient, key, id, (item) => ({
        ...item,
        deleted_at: deletedAt,
      }));
      return { deletedAt };
    },
    onError: (_error, { id }, context) => {
      const deletedAt = context?.deletedAt;
      if (!deletedAt) return;
      patchItem(queryClient, key, id, (item) =>
        item.deleted_at === deletedAt ? { ...item, deleted_at: null } : item,
      );
    },
    onSuccess: (removed) => {
      rememberOwn(queryClient, listId, [removed]);
      if (!removed || !isLastWriteTo(queryClient, listId, removed.id)) return;
      patchItem(queryClient, key, removed.id, () => removed);
    },
    onSettled: () => settle(queryClient, key),
  });
}

export type EmptyCart = {
  /** The items in the cart when the user emptied it. */
  ids: readonly string[];
  /** One archive time for the whole emptying, kept across retries. */
  deletedAt: string;
  /**
   * The trip the emptying makes (docs/improvements.md, F-4), generated here
   * like every id: a retry after a lost answer finds it made.
   */
  tripId: string;
};

/**
 * Archives the rows that are, on the server, still live and pending: undoing
 * an add. A row someone checked meanwhile stays on the list, in the cart.
 */
async function archivePending(
  ids: readonly string[],
  deletedAt: string,
): Promise<Item[]> {
  return unwrap(
    await createClient()
      .from("items")
      .update({ deleted_at: deletedAt })
      .in("id", [...ids])
      .is("deleted_at", null)
      .eq("checked", false)
      .select()
      .abortSignal(writeSignal()),
  );
}

/**
 * The history shows a trip once it is made and no longer once it is undone.
 * It is not in the Realtime publication: it is read when it is opened.
 */
function readTripsAgain(
  queryClient: QueryClient,
  userId: string,
  listId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.trips(userId, listId),
  });
}

/**
 * Empties the cart at the end of the shopping: the checked items are
 * archived (deleted_at, plan 3.2), all with one timestamp, and recorded as a
 * trip for the history (docs/improvements.md, F-4), in one request: the RPC
 * empty_cart (migration trips), which does both in one transaction. Only the
 * ids the user saw in the cart, and only while still checked: not a row
 * checked meanwhile by someone else, nor one whose check was rejected or
 * undone (it stays hidden until the refetch of settle brings it back as
 * pending). Nothing left to archive, no request and no trip. A rejection
 * brings back the rows still marked with this emptying's timestamp.
 */
export function useEmptyCart(userId: string, listId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.items(userId, listId);

  return useMutation({
    mutationKey: itemMutationKeys.emptyCart(userId, listId),
    scope: listScope(listId),
    mutationFn: async ({ ids, deletedAt, tripId }: EmptyCart) => {
      // Only rows still marked by this emptying: one whose insert was
      // rejected meanwhile is gone, and that is not an error. With none (it
      // was undone before it left the queue) there is nothing to send.
      const items = queryClient.getQueryData<Item[]>(key) ?? [];
      const ours = items
        .filter((item) => ids.includes(item.id))
        .filter((item) => item.deleted_at === deletedAt && item.checked)
        .map((item) => item.id);
      if (ours.length === 0) return [];
      return unwrap(
        await createClient()
          .rpc("empty_cart", {
            target_list_id: listId,
            target_trip_id: tripId,
            item_ids: ours,
            emptied_at: deletedAt,
          })
          .abortSignal(writeSignal()),
      );
    },
    onMutate: async ({ ids, deletedAt, tripId }) => {
      await queryClient.cancelQueries({ queryKey: key });
      setItems(queryClient, key, (items) =>
        items.map((item) =>
          ids.includes(item.id) && item.deleted_at === null
            ? { ...item, deleted_at: deletedAt, trip_id: tripId }
            : item,
        ),
      );
    },
    onError: (_error, { ids, deletedAt }) => {
      setItems(queryClient, key, (items) =>
        items.map((item) =>
          ids.includes(item.id) && item.deleted_at === deletedAt
            ? { ...item, deleted_at: null, trip_id: null }
            : item,
        ),
      );
    },
    onSuccess: (archived) => {
      rememberOwn(queryClient, listId, archived);
      for (const row of archived) {
        if (isLastWriteTo(queryClient, listId, row.id)) {
          patchItem(queryClient, key, row.id, () => row);
        }
      }
    },
    onSettled: () => {
      readTripsAgain(queryClient, userId, listId);
      return settle(queryClient, key);
    },
  });
}

export type RestoreCart = {
  /** The items the emptying archived. */
  ids: readonly string[];
  /**
   * Those items as they were in the cart: the refetch after the emptying may
   * have dropped them from the cache, and they come back at once.
   */
  rows: readonly Item[];
  /** The emptying's archive time, back on its rows if the undo is rejected. */
  deletedAt: string;
  /** The emptying's trip: only what it took comes back, and it is undone. */
  tripId: string;
};

/** Puts rows into the list in their place in the server's order. */
function insertInOrder(items: Item[], rows: readonly Item[]): Item[] {
  return rows.reduce((next, row) => {
    const at = next.findIndex((item) => compareServerOrder(row, item) < 0);
    return at === -1
      ? [...next, row]
      : [...next.slice(0, at), row, ...next.slice(at)];
  }, items);
}

/**
 * Undoes an emptying of the cart (docs/improvements.md, A-4): the rows it
 * archived come back to the cart, still checked, in one request, and its
 * trip leaves the history (the RPC restore_trip, migration trips, which
 * soft-deletes it: no ghost trip). Only rows of that trip: if the emptying
 * was rejected (its rows are already back) or someone archived a row
 * otherwise, nothing else changes. It runs after the emptying in the list's
 * queue; if the emptying had not left yet, there is no trip and the server
 * changes nothing. A rejection hides the rows again, marked with the
 * emptying's time and trip until the refetch. The catalog does not move: its
 * trigger ignores an archive change.
 */
export function useRestoreCart(userId: string, listId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.items(userId, listId);

  return useMutation({
    mutationKey: itemMutationKeys.restoreCart(userId, listId),
    scope: listScope(listId),
    mutationFn: async ({ tripId }: RestoreCart) =>
      unwrap(
        await createClient()
          .rpc("restore_trip", { target_trip_id: tripId })
          .abortSignal(writeSignal()),
      ),
    onMutate: async ({ ids, rows, tripId }) => {
      await queryClient.cancelQueries({ queryKey: key });
      // Out of the history read before, at once: opening it before the read
      // that follows the undo comes back must not show (or offer) the trip.
      queryClient.setQueryData<TripHistory>(
        queryKeys.trips(userId, listId),
        (history) =>
          history && {
            ...history,
            trips: history.trips.filter((trip) => trip.id !== tripId),
          },
      );
      setItems(queryClient, key, (items) => {
        // By the trip, not by the archive time, which the emptying's answer
        // spells as the server does ("+00:00", not the client's "Z").
        const back = items.map((item) =>
          ids.includes(item.id) && item.trip_id === tripId
            ? { ...item, deleted_at: null, trip_id: null }
            : item,
        );
        const missing = rows
          .filter(
            (row) =>
              ids.includes(row.id) && !items.some((item) => item.id === row.id),
          )
          .map((row) => ({ ...row, deleted_at: null, trip_id: null }));
        return insertInOrder(back, missing);
      });
    },
    onError: (_error, { ids, deletedAt, tripId }) => {
      setItems(queryClient, key, (items) =>
        items.map((item) =>
          ids.includes(item.id) && item.deleted_at === null && item.checked
            ? { ...item, deleted_at: deletedAt, trip_id: tripId }
            : item,
        ),
      );
    },
    onSuccess: (restored) => {
      rememberOwn(queryClient, listId, restored);
      for (const row of restored) {
        if (isLastWriteTo(queryClient, listId, row.id)) {
          patchItem(queryClient, key, row.id, () => row);
        }
      }
    },
    onSettled: () => {
      readTripsAgain(queryClient, userId, listId);
      return settle(queryClient, key);
    },
  });
}

/**
 * Rows a write of the user's own created on the server (a merge, a carry
 * over): into the cache in the server's order, remembered as our own so
 * their Realtime echoes never pulse. A row the cache has already (a later
 * read) is replaced. Nothing is written before the first load: settle
 * reads the list after the write.
 */
export function receiveOwnRows(
  queryClient: QueryClient,
  userId: string,
  listId: string,
  rows: readonly Item[],
) {
  rememberOwn(queryClient, listId, rows);
  const key = queryKeys.items(userId, listId);
  if (queryClient.getQueryData(key) === undefined) return;
  setItems(queryClient, key, (items) =>
    rows.reduce(
      (next, row) =>
        next.some((item) => item.id === row.id)
          ? next.map((item) => (item.id === row.id ? row : item))
          : insertInOrder(next, [row]),
      items,
    ),
  );
}

/**
 * What a Realtime event says another client did to one item of the list.
 * With RLS on, a DELETE carries only the primary key.
 */
export type RemoteItemChange =
  | {
      type: "INSERT" | "UPDATE";
      row: Item;
      /** The row before an update, when the event carries it. */
      previous?: Partial<Item>;
    }
  | { type: "DELETE"; id: string };

/**
 * What another member did to a row the user sees, as applyRemoteItem tells
 * it: the row pulses unless it left the list, and screen readers hear it.
 */
export type RemoteItemOutcome = {
  kind: "added" | "checked" | "unchecked" | "edited" | "removed";
  id: string;
  name: string;
};

/**
 * Fields the catalog trigger follows (migration initial_schema,
 * upsert_catalog_from_item): another member's add, or a change to any of
 * these, changes what the catalog remembers. The catalog is not in the
 * Realtime publication: every change to it comes from one of these events.
 */
const CATALOG_FIELDS = [
  "name",
  "category_id",
  "unit",
  "estimated_price",
  "currency",
] as const satisfies readonly (keyof Item)[];

/**
 * The next add reads the catalog for the category, the price and the
 * suggestions. Once per burst (readAgain): another member's "lo de siempre"
 * is up to fifteen inserts, and each read would cancel the one before.
 */
function readCatalogAgain(
  queryClient: QueryClient,
  userId: string,
  listId: string,
) {
  readAgain(queryClient, queryKeys.catalog(userId, listId));
}

/** Fields the list shows: a change to any of them pulses the row. */
const VISIBLE_FIELDS = [
  "name",
  "quantity",
  "unit",
  "note",
  "checked",
  "category_id",
  "estimated_price",
  "currency",
] as const satisfies readonly (keyof Item)[];

/**
 * The list has to be read again (see readAgain): something changed that the
 * cache may not show, or a read in flight may predate a change just received.
 */
export function readItemsAgain(
  queryClient: QueryClient,
  userId: string,
  listId: string,
) {
  readAgain(queryClient, queryKeys.items(userId, listId));
}

/**
 * Applies a change another client made to the list, as Realtime reports it
 * (plan 2.3, phase 2b), without breaking the optimistic pattern above:
 *
 * - The version is `updated_at`, which grows with every committed change of
 *   a row (migration monotonic_updated_at). An event not newer than the row
 *   in the cache changes nothing: a late event, the echo of one of our own
 *   writes (whose answer already put that same row there), or another
 *   member's change that a read brought before its event.
 * - The echoes are told apart by the versions our own writes' answers
 *   reported (rememberOwn), not by the cache: they never pulse.
 * - While one of our writes to the item is queued or running, its optimistic
 *   state wins and the event is left to the refetch of settle, which reads
 *   the list after the last write. The rollbacks stay targeted: nothing here
 *   touches a row they guard.
 * - A read in flight when a change arrives may predate it, and its answer
 *   would overwrite it: the list is read again (readItemsAgain).
 * - An archived or deleted row stays in the cache marked with deleted_at
 *   until the next refetch, so a late event cannot bring it back. An update
 *   to a row the cache does not have never creates it (it may be from before
 *   the row was archived): the list is read again instead, in case its
 *   insert was missed. A late insert does create it, but the events of a
 *   row come in order, and the archive that follows hides it again.
 *
 * Returns what another member did to a row the user sees (added, checked,
 * unchecked, edited or removed it), also when a read showed the change
 * before its event arrived: the row pulses (DESIGN_DIRECTION.md, section 8)
 * unless it left the list, and the change is announced to screen readers.
 * Echoes, late events and rows with a write of ours pending return null.
 */
export function applyRemoteItem(
  queryClient: QueryClient,
  userId: string,
  listId: string,
  change: RemoteItemChange,
): RemoteItemOutcome | null {
  const key = queryKeys.items(userId, listId);
  // The channel filters by list; this only guards against a stray event.
  if (change.type !== "DELETE" && change.row.list_id !== listId) return null;
  const items = queryClient.getQueryData<Item[]>(key);
  if (items === undefined) {
    readItemsAgain(queryClient, userId, listId);
    return null;
  }
  const id = change.type === "DELETE" ? change.id : change.row.id;
  const cached = items.find((item) => item.id === id);
  if (change.type === "DELETE" && !cached) return null;
  const own =
    change.type !== "DELETE" && isOwnVersion(queryClient, listId, change.row);
  if (change.type !== "DELETE" && cached) {
    const order = compareTimestamps(change.row.updated_at, cached.updated_at);
    if (order < 0) return null;
    // The cache shows this very version already: nothing to apply. If it is
    // not ours, a read brought it first, unannounced: it is told now.
    if (order === 0) {
      if (own || pendingWritesTo(queryClient, listId, id) > 0) return null;
      // A read brought another member's change first: the catalog it
      // changed was not read with it.
      readCatalogAgain(queryClient, userId, listId);
      return outcome(
        change.row,
        change.type === "INSERT" ? undefined : (change.previous ?? {}),
      );
    }
  }

  // Before the change is applied: cancelling the read restores the cache
  // as it was before that read began, events applied since included.
  if (queryClient.isFetching({ queryKey: key, exact: true }) > 0) {
    readItemsAgain(queryClient, userId, listId);
  }
  if (pendingWritesTo(queryClient, listId, id) > 0) return null;

  if (change.type === "DELETE") {
    setItems(queryClient, key, (items) =>
      items.filter((item) => item.id !== id),
    );
    return cached!.deleted_at === null
      ? { kind: "removed", id, name: cached!.name }
      : null;
  }
  const row = change.row;
  if (!cached) {
    if (change.type === "UPDATE") {
      if (row.deleted_at === null) {
        readItemsAgain(queryClient, userId, listId);
        readCatalogAgain(queryClient, userId, listId);
        return null;
      }
      // Archived, and the cache no longer has it (a read dropped it first)
      // or never had it: nothing to apply, and nothing told, since nothing
      // says the user ever saw the row.
      return null;
    }
    if (row.deleted_at !== null) return null;
    // In its place in the server's order, so the next refetch moves nothing.
    setItems(queryClient, key, (items) => {
      const next = items.findIndex((item) => compareServerOrder(row, item) < 0);
      return next === -1
        ? [...items, row]
        : [...items.slice(0, next), row, ...items.slice(next)];
    });
  } else {
    patchItem(queryClient, key, id, () => row);
  }
  if (!cached || CATALOG_FIELDS.some((field) => cached[field] !== row[field])) {
    readCatalogAgain(queryClient, userId, listId);
  }
  return own ? null : outcome(row, cached);
}

/**
 * What another member's change did to a row the user sees, against the row
 * as it was before it: none (a new row), or one that may lack fields (an
 * event's old record), which then count as unknown, never as changed.
 */
function outcome(
  row: Item,
  before: Partial<Item> | undefined,
): RemoteItemOutcome | null {
  const told = (kind: RemoteItemOutcome["kind"]) => ({
    kind,
    id: row.id,
    name: row.name,
  });
  if (row.deleted_at !== null) {
    return before?.deleted_at === null ? told("removed") : null;
  }
  if (!before || before.deleted_at != null) return told("added");
  if ("checked" in before && before.checked !== row.checked) {
    return told(row.checked ? "checked" : "unchecked");
  }
  return VISIBLE_FIELDS.some(
    (field) => field in before && before[field] !== row[field],
  )
    ? told("edited")
    : null;
}
