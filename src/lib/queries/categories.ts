"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  adjacentCategory,
  compareTimestamps,
  moveCategory,
  type Direction,
} from "@/lib/domain";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import { unwrap, writeSignal } from "./errors";
import { queryKeys } from "./keys";
import { isOwnVersion, readAgain, rememberOwn } from "./reconcile";

export type Category = Tables<"categories">;
export type CatalogEntry = Pick<
  Tables<"catalog">,
  "name_normalized" | "last_category_id"
>;

async function fetchCategories(listId: string): Promise<Category[]> {
  return unwrap(
    await createClient()
      .from("categories")
      .select("*")
      .eq("list_id", listId)
      .is("deleted_at", null)
      // Route order, as move_category and compareRouteOrder have it.
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  );
}

/** The list's categories in route order (the walk through the supermarket). */
export function useCategories(userId: string | null, listId: string | null) {
  const queryClient = useQueryClient();
  const key = queryKeys.categories(userId ?? "", listId ?? "");
  // As with the items (useItems): no read while a move is pending, which
  // would bring back the route without it; otherwise, coming back to the tab
  // or to the network reads it even when fresh, in case events were lost.
  const whenIdle = () =>
    queryClient.isMutating({ mutationKey: key }) === 0 ? "always" : false;
  return useQuery({
    queryKey: key,
    queryFn: () => fetchCategories(listId!),
    enabled: userId !== null && listId !== null,
    refetchOnWindowFocus: whenIdle,
    refetchOnReconnect: whenIdle,
  });
}

/**
 * Writes to a list's categories run in one queue of their own, apart from
 * the items': a move never waits for an item write, and the moves reach the
 * server in the user's order.
 */
export function categoriesScope(listId: string) {
  return { id: `categories:${listId}` };
}

/** Mutation keys of the category writes, under the categories query key. */
export const categoryMutationKeys = {
  all: queryKeys.categories,
  move: (userId: string, listId: string) =>
    [...queryKeys.categories(userId, listId), "move"] as const,
};

export type MoveCategory = {
  id: string;
  /** For the notice if the server rejects it. */
  name: string;
  direction: Direction;
  /**
   * The category it moves past: the one next to it when the user tapped.
   * Fixed with the move, so a retry after a lost answer finds it already in
   * place and does not move it again (see public.move_category).
   */
  past: string;
};

/**
 * A step of the category along the route, past the one next to it in the
 * cache, or null at that end. What the route's arrows send.
 */
export function categoryStep(
  categories: readonly Category[],
  category: Pick<Category, "id" | "name">,
  direction: Direction,
): MoveCategory | null {
  const past = adjacentCategory(categories, category.id, direction);
  return past
    ? { id: category.id, name: category.name, direction, past: past.id }
    : null;
}

async function moveOnServer({
  id,
  direction,
  past,
}: MoveCategory): Promise<Category[]> {
  return unwrap(
    await createClient()
      .rpc("move_category", {
        target_category_id: id,
        direction,
        past_category_id: past,
      })
      .abortSignal(writeSignal()),
  );
}

/**
 * Moves of the user's own, queued or running, that touch the category: the
 * one moved or the one it moves past. Their echo can arrive before their
 * answer, when it cannot be told by its version yet.
 */
function pendingMovesOf(queryClient: QueryClient, listId: string, id: string) {
  const scope = categoriesScope(listId).id;
  return queryClient.getMutationCache().findAll({
    status: "pending",
    predicate: (mutation) => {
      if (mutation.options.scope?.id !== scope) return false;
      const move = mutation.state.variables as MoveCategory | undefined;
      return move?.id === id || move?.past === id;
    },
  }).length;
}

/** Refetches once the last category write in flight settles (see settle). */
function settleCategories(queryClient: QueryClient, key: readonly unknown[]) {
  if (queryClient.isMutating({ mutationKey: key }) > 1) return;
  return queryClient.invalidateQueries({ queryKey: key });
}

/**
 * Moves a category one step along the route (plan 2.3, the pattern of
 * useAddItem): the route changes in the cache at once and the server applies
 * the same move to the route as it stands then (public.move_category), so two
 * members moving at once both see their moves applied.
 *
 * - A rejection undoes only this move, and only while the route still shows
 *   it (the category right next to the one it moved past, on that side): a
 *   later move or another member's change is never undone.
 * - The answer is the whole route: it replaces the cache unless a later move
 *   is pending, whose optimistic route is the newer one.
 * - Once the last move settles, the route is read again.
 */
export function useMoveCategory(userId: string, listId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.categories(userId, listId);

  return useMutation({
    mutationKey: categoryMutationKeys.move(userId, listId),
    scope: categoriesScope(listId),
    mutationFn: moveOnServer,
    onMutate: async ({ id, direction, past }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const categories = queryClient.getQueryData<Category[]>(key);
      const moved = categories && moveCategory(categories, id, direction, past);
      if (moved) queryClient.setQueryData<Category[]>(key, moved);
      return { moved: Boolean(moved) };
    },
    onError: (_error, { id, direction, past }, context) => {
      if (!context?.moved) return;
      const back = direction === "up" ? "down" : "up";
      queryClient.setQueryData<Category[]>(key, (categories) => {
        if (!categories) return categories;
        // Still right before (after) the one it moved past: put it back on
        // the other side.
        if (adjacentCategory(categories, id, back)?.id !== past) {
          return categories;
        }
        return moveCategory(categories, id, back, past) ?? categories;
      });
    },
    onSuccess: (route) => {
      rememberOwn(queryClient, listId, route);
      if (queryClient.isMutating({ mutationKey: key }) > 1) return;
      queryClient.setQueryData<Category[]>(key, route);
    },
    onSettled: () => settleCategories(queryClient, key),
  });
}

/** What a Realtime event says another client did to a category of the list. */
export type RemoteCategoryChange =
  | {
      type: "INSERT" | "UPDATE";
      row: Category;
      /** The row before an update (full replica identity). */
      previous?: Partial<Category>;
    }
  | { type: "DELETE"; id: string };

/**
 * Applies a change to the list's categories that Realtime reports (plan 2.3),
 * the way applyRemoteItem does for items, but by reading the route again
 * instead of patching it: a move is two events, one per category, and the
 * cache patched with the first alone would hold two categories at the same
 * position. Both events are sent after the commit, so one read for the burst
 * (readAgain) always finds the whole move, and waits while a move of the
 * user's own is pending.
 *
 * - The echo of the user's own move (its answer reported the versions) and
 *   an event not newer than the category in the cache change nothing.
 * - A read in flight is read again: it may predate the change.
 *
 * Returns "reordered" when another member moved a category, for screen
 * readers; the groups show it by sliding into their new places. Never while
 * a move of the user's own touches that category: the event may be its echo,
 * arrived before the answer.
 */
export function applyRemoteCategory(
  queryClient: QueryClient,
  userId: string,
  listId: string,
  change: RemoteCategoryChange,
): "reordered" | null {
  const key = queryKeys.categories(userId, listId);
  const categories = queryClient.getQueryData<Category[]>(key);
  if (change.type === "DELETE") {
    if (!categories || categories.some((c) => c.id === change.id)) {
      readAgain(queryClient, key);
    }
    return null;
  }
  const row = change.row;
  // The channel filters by list; this only guards against a stray event.
  if (row.list_id !== listId || isOwnVersion(queryClient, listId, row)) {
    return null;
  }
  const cached = categories?.find((category) => category.id === row.id);
  const order = cached
    ? compareTimestamps(row.updated_at, cached.updated_at)
    : 1;
  if (order < 0) return null;
  if (order > 0 || queryClient.isFetching({ queryKey: key, exact: true }) > 0) {
    readAgain(queryClient, key);
  }
  const before = change.type === "UPDATE" ? change.previous : undefined;
  const moved =
    before?.position !== undefined && before.position !== row.position;
  return moved && pendingMovesOf(queryClient, listId, row.id) === 0
    ? "reordered"
    : null;
}

async function fetchCatalog(listId: string): Promise<CatalogEntry[]> {
  return unwrap(
    await createClient()
      .from("catalog")
      .select("name_normalized, last_category_id")
      .eq("list_id", listId),
  );
}

/**
 * What the list remembers of every product ever added (written by the items
 * triggers). Read here only to put a new item in its usual category at once.
 */
export function useCatalog(userId: string | null, listId: string | null) {
  return useQuery({
    queryKey: queryKeys.catalog(userId ?? "", listId ?? ""),
    queryFn: () => fetchCatalog(listId!),
    enabled: userId !== null && listId !== null,
  });
}
