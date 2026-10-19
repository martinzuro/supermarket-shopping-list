"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  compareServerOrder,
  compareTimestamps,
  newId,
  normalizeName,
} from "@/lib/domain";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import { DUPLICATE_KEY, RequestError, unwrap, writeSignal } from "./errors";
import { queryKeys } from "./keys";

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
};

export function newItem(
  name: string,
  details: {
    quantity?: number | null;
    unit?: string | null;
    categoryId?: string | null;
  } = {},
): NewItem {
  return {
    id: newId(),
    name: name.trim(),
    quantity: details.quantity ?? null,
    unit: details.unit ?? null,
    category_id: details.categoryId ?? null,
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
          category_id: input.category_id,
          position,
        })
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

type ItemChanges = Partial<
  Pick<
    Item,
    | "name"
    | "quantity"
    | "unit"
    | "note"
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
function listScope(listId: string) {
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
function settle(queryClient: QueryClient, key: readonly unknown[]) {
  if (queryClient.isMutating({ mutationKey: key }) > 1) return;
  // The catalog changes with adds and renames (database triggers); the next
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

export type EditableFields = Pick<Item, "name" | "quantity" | "unit" | "note">;

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
 * Edits name, quantity, unit and note. Same pattern as useToggleItem: only
 * the changed fields are sent, and a rejected edit restores them unless a
 * later edit already replaced them.
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
};

async function archiveItems(
  ids: readonly string[],
  deletedAt: string,
): Promise<Item[]> {
  return unwrap(
    await createClient()
      .from("items")
      .update({ deleted_at: deletedAt })
      .in("id", [...ids])
      .is("deleted_at", null)
      // Only what is in the cart on the server: a row whose check was
      // rejected meanwhile, or that someone unchecked, stays on the list.
      .eq("checked", true)
      .select()
      .abortSignal(writeSignal()),
  );
}

/**
 * Empties the cart at the end of the shopping: the checked items are
 * archived (deleted_at, plan 3.2), all with one timestamp and one request.
 * Only the ids the user saw in the cart, and only while still checked: not a
 * row checked meanwhile by someone else, nor one whose check was rejected or
 * undone (it stays hidden until the refetch of settle brings it back as
 * pending). A rejection brings back the rows still marked with this
 * emptying's timestamp.
 */
export function useEmptyCart(userId: string, listId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.items(userId, listId);

  return useMutation({
    mutationKey: itemMutationKeys.emptyCart(userId, listId),
    scope: listScope(listId),
    mutationFn: async ({ ids, deletedAt }: EmptyCart) => {
      // Only rows still marked by this emptying: one whose insert was
      // rejected meanwhile is gone, and that is not an error.
      const items = queryClient.getQueryData<Item[]>(key) ?? [];
      const ours = items
        .filter((item) => ids.includes(item.id))
        .filter((item) => item.deleted_at === deletedAt && item.checked)
        .map((item) => item.id);
      if (ours.length === 0) return [];
      return archiveItems(ours, deletedAt);
    },
    onMutate: async ({ ids, deletedAt }) => {
      await queryClient.cancelQueries({ queryKey: key });
      setItems(queryClient, key, (items) =>
        items.map((item) =>
          ids.includes(item.id) && item.deleted_at === null
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
      for (const row of archived) {
        if (isLastWriteTo(queryClient, listId, row.id)) {
          patchItem(queryClient, key, row.id, () => row);
        }
      }
    },
    onSettled: () => settle(queryClient, key),
  });
}

/**
 * What a Realtime event says another client did to one item of the list.
 * With RLS on, a DELETE carries only the primary key.
 */
export type RemoteItemChange =
  { type: "INSERT" | "UPDATE"; row: Item } | { type: "DELETE"; id: string };

/** Fields the list shows: a change to any of them pulses the row. */
const VISIBLE_FIELDS = [
  "name",
  "quantity",
  "unit",
  "note",
  "checked",
  "category_id",
] as const satisfies readonly (keyof Item)[];

/** How long a read waits for the rest of a burst of events. */
const READ_AGAIN_MS = 100;

// Lists with a read already scheduled, per query client.
const scheduledReads = new WeakMap<QueryClient, Set<string>>();

/**
 * The list has to be read again: something changed that the cache may not
 * show, or a read in flight may have been made before a change just received.
 *
 * - A read in flight is cancelled: its answer could overwrite what the
 *   events applied meanwhile, which the cache keeps. While a write is
 *   pending that read can only be the one of settle, made after the last
 *   write reached the server, so cancelling it drops nothing.
 * - One read follows a moment later, once for a whole burst of events (an
 *   emptied cart is one event per row).
 * - While a write is queued or running, that read is left to settle, which
 *   reads after the last write: an earlier one would drop the optimistic
 *   changes still pending.
 */
export function readItemsAgain(
  queryClient: QueryClient,
  userId: string,
  listId: string,
) {
  const key = queryKeys.items(userId, listId);
  const filters = { queryKey: key, exact: true };
  // The first load is let through, so the list shows without waiting; the
  // read below follows it.
  if (
    queryClient.getQueryData(key) !== undefined &&
    queryClient.isFetching(filters) > 0
  ) {
    void queryClient.cancelQueries(filters);
  }
  let scheduled = scheduledReads.get(queryClient);
  if (!scheduled) {
    scheduled = new Set();
    scheduledReads.set(queryClient, scheduled);
  }
  const hash = JSON.stringify(key);
  if (scheduled.has(hash)) return;
  scheduled.add(hash);
  setTimeout(() => {
    scheduled.delete(hash);
    if (queryClient.isMutating({ mutationKey: key }) > 0) return;
    void fetchAgain(queryClient, key);
  }, READ_AGAIN_MS);
}

function fetchAgain(queryClient: QueryClient, key: readonly unknown[]) {
  const filters = { queryKey: key, exact: true };
  // Invalidating starts a fetch in flight over only when the query has data:
  // the first load is waited for, then the list is read again.
  if (
    queryClient.getQueryData(key) === undefined &&
    queryClient.isFetching(filters) > 0
  ) {
    return queryClient
      .refetchQueries(filters, { cancelRefetch: false })
      .then(() => queryClient.invalidateQueries(filters));
  }
  return queryClient.invalidateQueries(filters);
}

/**
 * Applies a change another client made to the list, as Realtime reports it
 * (plan 2.3, phase 2b), without breaking the optimistic pattern above:
 *
 * - The version is `updated_at`, which grows with every committed change of
 *   a row (migration monotonic_updated_at). An event not newer than the row
 *   in the cache changes nothing: it is the echo of one of our own writes,
 *   whose answer already put that same row there, or a late event.
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
 * Returns true when a member added, edited, checked or brought back a row
 * the user sees: that row pulses (DESIGN_DIRECTION.md, section 8). Echoes,
 * late events, deletions and refetches never do.
 */
export function applyRemoteItem(
  queryClient: QueryClient,
  userId: string,
  listId: string,
  change: RemoteItemChange,
): boolean {
  const key = queryKeys.items(userId, listId);
  // The channel filters by list; this only guards against a stray event.
  if (change.type !== "DELETE" && change.row.list_id !== listId) return false;
  const items = queryClient.getQueryData<Item[]>(key);
  if (items === undefined) {
    readItemsAgain(queryClient, userId, listId);
    return false;
  }
  const id = change.type === "DELETE" ? change.id : change.row.id;
  const cached = items.find((item) => item.id === id);
  if (change.type === "DELETE" && !cached) return false;
  if (
    change.type !== "DELETE" &&
    cached &&
    compareTimestamps(change.row.updated_at, cached.updated_at) <= 0
  ) {
    return false;
  }

  // Before the change is applied: cancelling the read restores the cache
  // as it was before that read began, events applied since included.
  if (queryClient.isFetching({ queryKey: key, exact: true }) > 0) {
    readItemsAgain(queryClient, userId, listId);
  }
  if (pendingWritesTo(queryClient, listId, id) > 0) return false;

  if (change.type === "DELETE") {
    setItems(queryClient, key, (items) =>
      items.filter((item) => item.id !== id),
    );
    return false;
  }
  const row = change.row;
  if (!cached) {
    if (change.type === "UPDATE") {
      if (row.deleted_at === null) readItemsAgain(queryClient, userId, listId);
      return false;
    }
    if (row.deleted_at !== null) return false;
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
  // The catalog changes with adds and renames (database triggers); the next
  // add reads it to pick the category.
  if (!cached || cached.name !== row.name) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.catalog(userId, listId),
    });
  }
  if (row.deleted_at !== null) return false;
  return (
    !cached ||
    cached.deleted_at !== null ||
    VISIBLE_FIELDS.some((field) => row[field] !== cached[field])
  );
}
